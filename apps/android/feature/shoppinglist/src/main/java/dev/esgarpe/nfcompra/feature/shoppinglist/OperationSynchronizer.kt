package dev.esgarpe.nfcompra.feature.shoppinglist

import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import dev.esgarpe.nfcompra.core.database.LocalShoppingItem
import dev.esgarpe.nfcompra.core.database.OperationReconciliation
import dev.esgarpe.nfcompra.core.database.PendingOperation
import dev.esgarpe.nfcompra.core.database.PendingOperationState
import dev.esgarpe.nfcompra.core.database.PendingOperationType
import dev.esgarpe.nfcompra.core.database.ShoppingDao
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import retrofit2.Response
import java.io.IOException
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

sealed interface SyncResult {
    data object Idle : SyncResult
    data object Succeeded : SyncResult
    data object Retry : SyncResult
    data object Failed : SyncResult
    data object Conflict : SyncResult
}

sealed interface ResolveConflict : ShoppingListAction {
    val operationId: String

    data class UseServer(override val operationId: String) : ResolveConflict
    data class RetryLocal(override val operationId: String) : ResolveConflict
}

class OperationSynchronizer(
    private val api: ShoppingListApi,
    private val dao: ShoppingDao,
    private val clock: () -> Long = System::currentTimeMillis,
    private val operationId: () -> String = { UUID.randomUUID().toString() },
    private val syncMutex: Mutex = Mutex(),
    private val databaseMutex: Mutex = Mutex(),
    private val itemAliases: ItemIdAliases = ItemIdAliases(),
) {
    suspend fun syncNext(): SyncResult = syncMutex.withLock { syncNextLocked() }

    suspend fun syncUntilBlocked(): SyncResult {
        while (true) {
            when (val result = syncNext()) {
                SyncResult.Idle, SyncResult.Conflict, SyncResult.Retry -> return result
                SyncResult.Succeeded, SyncResult.Failed -> Unit
            }
        }
    }

    private suspend fun syncNextLocked(): SyncResult {
        val operation = dao.pendingOperations().firstOrNull {
            it.state == PendingOperationState.PENDING ||
                it.state == PendingOperationState.SYNCING ||
                it.state == PendingOperationState.CONFLICT
        } ?: return SyncResult.Idle
        if (operation.state == PendingOperationState.CONFLICT) return SyncResult.Conflict
        val attempts = operation.attempts + 1
        if (!operation.hasValidPayload()) {
            dao.transitionOperation(operation.id, PendingOperationState.FAILED, attempts)
            return SyncResult.Failed
        }
        dao.transitionOperation(operation.id, PendingOperationState.SYNCING, attempts)
        return try {
            handleResponse(operation, attempts, execute(operation))
        } catch (error: CancellationException) {
            dao.transitionOperation(operation.id, PendingOperationState.PENDING, attempts)
            throw error
        } catch (_: IOException) {
            dao.transitionOperation(operation.id, PendingOperationState.PENDING, attempts)
            SyncResult.Retry
        } catch (_: Exception) {
            dao.transitionOperation(operation.id, PendingOperationState.PENDING, attempts)
            SyncResult.Retry
        }
    }

    suspend fun resolve(resolution: ResolveConflict): Boolean = syncMutex.withLock {
        val operation = dao.pendingOperations().firstOrNull {
            it.operationId == resolution.operationId && it.state == PendingOperationState.CONFLICT
        } ?: return@withLock false
        val serverItem = operation.serverItemJson?.let(itemAdapter::fromJson) ?: return@withLock false
        when (resolution) {
            is ResolveConflict.UseServer -> {
                complete(operation, serverItem)
                true
            }
            is ResolveConflict.RetryLocal -> retryLocal(operation, serverItem)
        }
    }

    private suspend fun execute(operation: PendingOperation): Response<*> = when (operation.type) {
        PendingOperationType.CREATE -> api.createItem(
            operation.listId,
            requireNotNull(createAdapter.fromJson(operation.payloadJson)),
        )
        PendingOperationType.UPDATE -> api.updateItem(
            operation.itemId,
            requireNotNull(updateAdapter.fromJson(operation.payloadJson)),
        )
        PendingOperationType.DELETE -> api.deleteItem(
            operation.itemId,
            requireNotNull(deleteAdapter.fromJson(operation.payloadJson)),
        )
        else -> error("Tipo de operación desconocido: ${operation.type}")
    }

    private suspend fun handleResponse(
        operation: PendingOperation,
        attempts: Int,
        response: Response<*>,
    ): SyncResult {
        if (response.isSuccessful) {
            val serverItem = (response.body() as? ItemResponse)?.item
            if (operation.type != PendingOperationType.DELETE && serverItem == null) {
                dao.transitionOperation(operation.id, PendingOperationState.PENDING, attempts)
                return SyncResult.Retry
            }
            complete(operation, serverItem)
            return SyncResult.Succeeded
        }

        val error = response.errorBody()?.string()?.let { body ->
            runCatching { errorAdapter.fromJson(body) }.getOrNull()
        }
        val current = error?.error?.details?.current
        if (response.code() == 409 && error?.error?.code == ITEM_VERSION_CONFLICT && current != null) {
            dao.transitionOperation(
                id = operation.id,
                state = PendingOperationState.CONFLICT,
                attempts = attempts,
                serverItemJson = itemAdapter.toJson(current),
            )
            return SyncResult.Conflict
        }
        if (
            response.code() >= 500 ||
            response.code() == 401 ||
            response.code() == 408 ||
            (response.code() == 409 && error?.error?.code == OPERATION_IN_PROGRESS) ||
            response.code() == 429
        ) {
            dao.transitionOperation(operation.id, PendingOperationState.PENDING, attempts)
            return SyncResult.Retry
        }
        dao.transitionOperation(operation.id, PendingOperationState.FAILED, attempts)
        return SyncResult.Failed
    }

    private suspend fun complete(operation: PendingOperation, serverItem: ShoppingItemDto?) = databaseMutex.withLock {
        if (serverItem == null) {
            dao.completeOperation(operation.id, operation.itemId, serverItem = null)
            return@withLock
        }
        dao.reconcileOperation(
            operationId = operation.id,
            localItemId = operation.itemId,
        ) { queued ->
            val following = queued.dropWhile { it.id != operation.id }
                .drop(1)
                .filter { it.itemId == operation.itemId }
            var nextVersion = serverItem.version
            var projectedItem: LocalShoppingItem? = serverItem.toLocalItem()
            val replacements = following.map { pending ->
                val rebasedPayload = when (pending.type) {
                    PendingOperationType.UPDATE -> {
                        val request = requireNotNull(updateAdapter.fromJson(pending.payloadJson))
                        projectedItem = projectedItem?.apply(request)
                        request.copy(expectedVersion = nextVersion)
                            .also { nextVersion++ }
                            .let(updateAdapter::toJson)
                    }
                    PendingOperationType.DELETE -> {
                        projectedItem = null
                        requireNotNull(deleteAdapter.fromJson(pending.payloadJson)).copy(
                            expectedVersion = nextVersion,
                        ).let(deleteAdapter::toJson)
                    }
                    else -> pending.payloadJson
                }
                pending.copy(itemId = serverItem.id, payloadJson = rebasedPayload)
            }
            OperationReconciliation(
                serverItem = projectedItem?.copy(version = nextVersion),
                replacementOperations = replacements,
            )
        }
        if (serverItem.id != operation.itemId) itemAliases.record(operation.itemId, serverItem.id)
    }

    private fun PendingOperation.hasValidPayload(): Boolean = runCatching {
        when (type) {
            PendingOperationType.CREATE -> createAdapter.fromJson(payloadJson) != null
            PendingOperationType.UPDATE -> updateAdapter.fromJson(payloadJson) != null
            PendingOperationType.DELETE -> deleteAdapter.fromJson(payloadJson) != null
            else -> false
        }
    }.getOrDefault(false)

    private suspend fun retryLocal(operation: PendingOperation, serverItem: ShoppingItemDto): Boolean {
        val newOperationId = operationId()
        val payload = when (operation.type) {
            PendingOperationType.CREATE -> requireNotNull(createAdapter.fromJson(operation.payloadJson)).copy(
                operationId = newOperationId,
            ).let(createAdapter::toJson)
            PendingOperationType.UPDATE -> requireNotNull(updateAdapter.fromJson(operation.payloadJson)).copy(
                expectedVersion = serverItem.version,
                operationId = newOperationId,
            ).let(updateAdapter::toJson)
            PendingOperationType.DELETE -> requireNotNull(deleteAdapter.fromJson(operation.payloadJson)).copy(
                expectedVersion = serverItem.version,
                operationId = newOperationId,
            ).let(deleteAdapter::toJson)
            else -> return false
        }
        dao.replaceOperation(
            operationId = operation.id,
            replacement = operation.copy(
                id = operation.id,
                operationId = newOperationId,
                itemId = serverItem.id,
                payloadJson = payload,
                attempts = 0,
                state = PendingOperationState.PENDING,
                serverItemJson = null,
            ),
        )
        return true
    }

    private companion object {
        const val ITEM_VERSION_CONFLICT = "ITEM_VERSION_CONFLICT"
        const val OPERATION_IN_PROGRESS = "OPERATION_IN_PROGRESS"
        val moshi: Moshi = Moshi.Builder().addLast(KotlinJsonAdapterFactory()).build()
        val createAdapter = moshi.adapter(CreateItemRequest::class.java)
        val updateAdapter = moshi.adapter(UpdateItemRequest::class.java)
        val deleteAdapter = moshi.adapter(DeleteItemRequest::class.java)
        val itemAdapter = moshi.adapter(ShoppingItemDto::class.java)
        val errorAdapter = moshi.adapter(ErrorResponse::class.java)
    }
}

class ItemIdAliases {
    private val aliases = ConcurrentHashMap<String, String>()

    fun record(localId: String, serverId: String) {
        aliases[localId] = serverId
    }

    fun resolve(itemId: String): String {
        var resolved = itemId
        val visited = mutableSetOf<String>()
        while (visited.add(resolved)) resolved = aliases[resolved] ?: return resolved
        return resolved
    }
}

private fun LocalShoppingItem.apply(request: UpdateItemRequest): LocalShoppingItem = copy(
    name = request.name ?: name,
    normalizedName = request.name?.trim()?.lowercase() ?: normalizedName,
    quantity = request.quantity ?: quantity,
    unit = request.unit ?: unit,
    isChecked = request.isChecked ?: isChecked,
)

internal fun ShoppingItemDto.toLocalItem() = LocalShoppingItem(
    id = id,
    listId = listId,
    name = name,
    normalizedName = normalizedName,
    quantity = quantity,
    unit = unit,
    category = category,
    note = note,
    isChecked = isChecked,
    position = position,
    version = version,
    createdBy = createdBy.orEmpty(),
    updatedBy = updatedBy.orEmpty(),
    createdAt = createdAt,
    updatedAt = updatedAt,
)

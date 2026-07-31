package dev.esgarpe.nfcompra.feature.shoppinglist

import android.content.Context
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import dev.esgarpe.nfcompra.core.database.LocalHousehold
import dev.esgarpe.nfcompra.core.database.LocalShoppingItem
import dev.esgarpe.nfcompra.core.database.LocalShoppingList
import dev.esgarpe.nfcompra.core.database.NfCompraDatabase
import dev.esgarpe.nfcompra.core.database.PendingOperation
import dev.esgarpe.nfcompra.core.database.PendingOperationState
import dev.esgarpe.nfcompra.core.database.PendingOperationType
import dev.esgarpe.nfcompra.core.database.ShoppingDao
import dev.esgarpe.nfcompra.core.database.SnapshotCollection
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import retrofit2.Response
import java.io.Closeable
import java.io.IOException
import java.util.UUID

data class HouseholdUiModel(val id: String, val name: String)
data class ShoppingListSummaryUiModel(val id: String, val householdId: String, val name: String)

class ShoppingListApiException(
    val status: Int,
    val code: String?,
    override val message: String,
    val current: ShoppingListItemUiModel? = null,
) : IOException(message)

interface ShoppingRepository {
    val isOffline: Boolean get() = false
    val continuouslyObservesItems: Boolean get() = false
    suspend fun households(): List<HouseholdUiModel>
    suspend fun lists(householdId: String): List<ShoppingListSummaryUiModel>
    suspend fun refreshItems(listId: String) = Unit
    fun observeItems(listId: String): Flow<List<ShoppingListItemUiModel>>
    suspend fun createHousehold(name: String): Pair<HouseholdUiModel, ShoppingListSummaryUiModel>
    suspend fun createList(householdId: String, name: String): ShoppingListSummaryUiModel
    suspend fun createItem(listId: String, name: String)
    suspend fun updateItem(item: ShoppingListItemUiModel, name: String? = null, checked: Boolean? = null)
    suspend fun deleteItem(item: ShoppingListItemUiModel)
    suspend fun resolveConflict(resolution: ResolveConflict) = Unit
}

class ShoppingListRepository(private val api: ShoppingListApi) : ShoppingRepository {
    override suspend fun households(): List<HouseholdUiModel> =
        api.households().bodyOrThrow().households.map { HouseholdUiModel(it.id, it.name) }

    override suspend fun lists(householdId: String): List<ShoppingListSummaryUiModel> =
        api.lists(householdId).bodyOrThrow().lists.map { ShoppingListSummaryUiModel(it.id, it.householdId, it.name) }

    override fun observeItems(listId: String): Flow<List<ShoppingListItemUiModel>> = flow {
        emit(api.items(listId).bodyOrThrow().items.map(::toUiModel))
    }

    override suspend fun createHousehold(name: String): Pair<HouseholdUiModel, ShoppingListSummaryUiModel> {
        val response = api.createHousehold(CreateHouseholdRequest(name)).bodyOrThrow()
        return HouseholdUiModel(response.household.id, response.household.name) to response.defaultList.toUiModel()
    }

    override suspend fun createList(householdId: String, name: String): ShoppingListSummaryUiModel =
        api.createList(householdId, CreateListRequest(name)).bodyOrThrow().list.toUiModel()

    override suspend fun createItem(listId: String, name: String) {
        api.createItem(listId, CreateItemRequest(name = name, operationId = UUID.randomUUID().toString())).bodyOrThrow()
    }

    override suspend fun updateItem(item: ShoppingListItemUiModel, name: String?, checked: Boolean?) {
        api.updateItem(item.id, UpdateItemRequest(name = name, isChecked = checked, expectedVersion = item.version, operationId = UUID.randomUUID().toString())).bodyOrThrow()
    }

    override suspend fun deleteItem(item: ShoppingListItemUiModel) {
        api.deleteItem(item.id, DeleteItemRequest(item.version, UUID.randomUUID().toString())).bodyOrThrow()
    }

    private fun ShoppingListDto.toUiModel() = ShoppingListSummaryUiModel(id, householdId, name)

    private fun toUiModel(item: ShoppingItemDto) = ShoppingListItemUiModel(
        id = item.id,
        name = item.name,
        quantity = item.quantity.toString().removeSuffix(".0") + (item.unit?.let { " $it" } ?: ""),
        checked = item.isChecked,
        version = item.version,
    )

    private fun <T> Response<T>.bodyOrThrow(): T {
        body()?.let { return it }
        val error = errorBody()?.string()?.let(errorAdapter::fromJson)
        val details = error?.error?.details?.current?.let(::toUiModel)
        throw ShoppingListApiException(
            status = code(),
            code = error?.error?.code,
            message = error?.error?.message ?: "No se pudo completar la operaciÃ³n.",
            current = details,
        )
    }

    private companion object {
        val errorAdapter = Moshi.Builder().addLast(KotlinJsonAdapterFactory()).build().adapter(ErrorResponse::class.java)
    }
}

class OfflineShoppingRepository(
    private val api: ShoppingListApi,
    private val dao: ShoppingDao,
    private val clock: () -> Long = System::currentTimeMillis,
    private val operationId: () -> String = { UUID.randomUUID().toString() },
    private val scheduleSync: () -> Unit = {},
    private val closeDatabase: () -> Unit = {},
    private val syncMutex: Mutex = Mutex(),
    private val databaseMutex: Mutex = Mutex(),
    private val itemAliases: ItemIdAliases = ItemIdAliases(),
) : ShoppingRepository, Closeable {
    override val continuouslyObservesItems = true
    private val lifecycleLock = Any()
    private val activeJobs = mutableSetOf<Job>()
    private var closed = false

    @Volatile
    override var isOffline: Boolean = false
        private set

    override suspend fun households(): List<HouseholdUiModel> = accountOperation {
        val remote = try {
            api.households().also { markOnline() }.bodyOrThrow().households.map(HouseholdDto::toLocal)
        } catch (error: ShoppingListApiException) {
            isOffline = false
            throw error
        } catch (error: IOException) {
            isOffline = true
            if (dao.snapshot(SnapshotCollection.HOUSEHOLDS) == null) throw error
            return@accountOperation dao.households().map { HouseholdUiModel(it.id, it.name) }
        }
        dao.replaceHouseholds(remote, clock())
        dao.households().map { HouseholdUiModel(it.id, it.name) }
    }

    override suspend fun lists(householdId: String): List<ShoppingListSummaryUiModel> = accountOperation {
        val remote = try {
            api.lists(householdId).also { markOnline() }.bodyOrThrow().lists.map(ShoppingListDto::toLocal)
        } catch (error: ShoppingListApiException) {
            isOffline = false
            throw error
        } catch (error: IOException) {
            isOffline = true
            if (dao.snapshot(SnapshotCollection.lists(householdId)) == null) throw error
            return@accountOperation dao.lists(householdId).map {
                ShoppingListSummaryUiModel(it.id, it.householdId, it.name)
            }
        }
        dao.replaceLists(householdId, remote, clock())
        dao.lists(householdId).map { ShoppingListSummaryUiModel(it.id, it.householdId, it.name) }
    }

    override suspend fun refreshItems(listId: String) = accountOperation {
        syncMutex.withLock {
            val remote = try {
                api.items(listId).also { markOnline() }.bodyOrThrow().items.map(ShoppingItemDto::toLocal)
            } catch (error: ShoppingListApiException) {
                isOffline = false
                throw error
            } catch (error: IOException) {
                isOffline = true
                if (dao.snapshot(SnapshotCollection.items(listId)) == null) throw error
                return@accountOperation
            }
            databaseMutex.withLock { dao.replaceItems(listId, remote, clock()) }
        }
    }

    override fun observeItems(listId: String): Flow<List<ShoppingListItemUiModel>> =
        channelFlow {
            val collector = launch(Dispatchers.IO, start = CoroutineStart.LAZY) {
                combine(
                    dao.observeItems(listId),
                    dao.observeOperations(listId),
                ) { items, operations ->
                    val mapped = items.map { item ->
                        val itemOperations = operations.filter { operation -> operation.itemId == item.id }
                        val visibleOperation = itemOperations.firstOrNull {
                            it.state == PendingOperationState.CONFLICT
                        } ?: itemOperations.lastOrNull()
                        item.toUiModel(visibleOperation)
                    }
                    val itemIds = items.mapTo(mutableSetOf()) { it.id }
                    val orphanedOperations = operations.mapNotNull { operation ->
                        if (operation.itemId in itemIds) return@mapNotNull null
                        operation.serverItemJson?.let(serverItemAdapter::fromJson)?.toLocal()?.toUiModel(operation)
                            ?: operation.toTombstoneUiModel()
                    }
                    mapped + orphanedOperations
                }.collect(::send)
            }
            if (!register(collector)) {
                close()
                return@channelFlow
            }
            collector.invokeOnCompletion {
                unregister(collector)
                close()
            }
            collector.start()
            awaitClose { collector.cancel() }
        }

    override suspend fun createHousehold(
        name: String,
    ): Pair<HouseholdUiModel, ShoppingListSummaryUiModel> = accountOperation {
        val response = api.createHousehold(CreateHouseholdRequest(name)).also { isOffline = false }.bodyOrThrow()
        dao.upsertHouseholdAndList(response.household.toLocal(), response.defaultList.toLocal())
        HouseholdUiModel(response.household.id, response.household.name) to
            ShoppingListSummaryUiModel(response.defaultList.id, response.defaultList.householdId, response.defaultList.name)
    }

    override suspend fun createList(
        householdId: String,
        name: String,
    ): ShoppingListSummaryUiModel = accountOperation {
        val remote = api.createList(householdId, CreateListRequest(name)).also { isOffline = false }.bodyOrThrow().list
        dao.upsertList(remote.toLocal())
        ShoppingListSummaryUiModel(remote.id, remote.householdId, remote.name)
    }

    override suspend fun createItem(listId: String, name: String) = accountOperation {
        databaseMutex.withLock {
            val operationId = operationId()
            val now = clock()
            val item = LocalShoppingItem(
                id = "local-$operationId",
                listId = listId,
                name = name,
                normalizedName = name.trim().lowercase(),
                quantity = 1.0,
                unit = null,
                category = null,
                note = null,
                isChecked = false,
                position = dao.maxItemPosition(listId) + 1,
                version = 0,
                createdBy = "",
                updatedBy = "",
                createdAt = now.toString(),
                updatedAt = now.toString(),
            )
            val request = CreateItemRequest(name = name, operationId = operationId)
            dao.upsertItemAndEnqueue(
                item,
                PendingOperation(
                    operationId = operationId,
                    type = PendingOperationType.CREATE,
                    listId = listId,
                    itemId = item.id,
                    payloadJson = createItemAdapter.toJson(request),
                    createdAt = now,
                ),
            )
        }
        scheduleSync()
        Unit
    }

    override suspend fun updateItem(
        item: ShoppingListItemUiModel,
        name: String?,
        checked: Boolean?,
    ) = accountOperation {
        databaseMutex.withLock {
            val resolvedItemId = itemAliases.resolve(item.id)
            val local = requireNotNull(dao.item(resolvedItemId)) { "No existe el producto local $resolvedItemId." }
            val operationId = operationId()
            val now = clock()
            val updated = local.copy(
                name = name ?: local.name,
                normalizedName = name?.trim()?.lowercase() ?: local.normalizedName,
                isChecked = checked ?: local.isChecked,
                updatedAt = now.toString(),
            )
            val request = UpdateItemRequest(
                name = name,
                isChecked = checked,
                expectedVersion = if (resolvedItemId == item.id) item.version else local.version,
                operationId = operationId,
            )
            dao.upsertItemAndEnqueue(
                updated,
                PendingOperation(
                    operationId = operationId,
                    type = PendingOperationType.UPDATE,
                    listId = local.listId,
                    itemId = local.id,
                    payloadJson = updateItemAdapter.toJson(request),
                    createdAt = now,
                ),
            )
        }
        scheduleSync()
        Unit
    }

    override suspend fun deleteItem(item: ShoppingListItemUiModel) = accountOperation {
        databaseMutex.withLock {
            val resolvedItemId = itemAliases.resolve(item.id)
            val local = requireNotNull(dao.item(resolvedItemId)) { "No existe el producto local $resolvedItemId." }
            val operationId = operationId()
            val request = DeleteItemRequest(
                expectedVersion = if (resolvedItemId == item.id) item.version else local.version,
                operationId = operationId,
            )
            dao.deleteItemAndEnqueue(
                local.id,
                PendingOperation(
                    operationId = operationId,
                    type = PendingOperationType.DELETE,
                    listId = local.listId,
                    itemId = local.id,
                    payloadJson = deleteItemAdapter.toJson(request),
                    createdAt = clock(),
                ),
            )
        }
        scheduleSync()
        Unit
    }

    override suspend fun resolveConflict(resolution: ResolveConflict) = accountOperation {
        if (
            OperationSynchronizer(
                api = api,
                dao = dao,
                clock = clock,
                operationId = operationId,
                syncMutex = syncMutex,
                databaseMutex = databaseMutex,
                itemAliases = itemAliases,
            ).resolve(resolution)
        ) scheduleSync()
    }

    override fun close() {
        val jobs = synchronized(lifecycleLock) {
            if (closed) return
            closed = true
            activeJobs.toList()
        }
        runBlocking {
            jobs.forEach { it.cancelAndJoin() }
        }
        closeDatabase()
    }

    private suspend fun <T> accountOperation(block: suspend () -> T): T = coroutineScope {
        val operation = async(Dispatchers.IO, start = CoroutineStart.LAZY) { block() }
        check(register(operation)) { "La sesión de compras ya está cerrada." }
        try {
            operation.start()
            operation.await()
        } finally {
            unregister(operation)
        }
    }

    private fun register(job: Job): Boolean = synchronized(lifecycleLock) {
        if (closed) false else activeJobs.add(job)
    }

    private fun unregister(job: Job) {
        synchronized(lifecycleLock) {
            activeJobs.remove(job)
        }
    }

    private fun markOnline() {
        val recovered = isOffline
        isOffline = false
        if (recovered) scheduleSync()
    }

    companion object {
        private val moshi = Moshi.Builder().addLast(KotlinJsonAdapterFactory()).build()
        private val createItemAdapter = moshi.adapter(CreateItemRequest::class.java)
        private val updateItemAdapter = moshi.adapter(UpdateItemRequest::class.java)
        private val deleteItemAdapter = moshi.adapter(DeleteItemRequest::class.java)
        private val serverItemAdapter = moshi.adapter(ShoppingItemDto::class.java)

        fun create(
            context: Context,
            api: ShoppingListApi,
            accountId: String,
            baseUrl: String,
        ): OfflineShoppingRepository {
            val database = NfCompraDatabase.create(context, accountId)
            val scheduleSync = { SyncWorker.enqueue(context, accountId, baseUrl) }
            val syncState = ShoppingSyncCoordinator.acquireRepository(accountId)
            return try {
                OfflineShoppingRepository(
                    api = api,
                    dao = database.shoppingDao(),
                    scheduleSync = scheduleSync,
                    syncMutex = syncState.syncMutex,
                    databaseMutex = syncState.databaseMutex,
                    itemAliases = syncState.itemAliases,
                    closeDatabase = {
                        releaseShoppingRepository(context, accountId, database, syncState)
                    },
                ).also { scheduleSync() }
            } catch (error: Throwable) {
                releaseShoppingRepository(context, accountId, database, syncState)
                throw error
            }
        }
    }
}

internal fun releaseShoppingRepository(
    context: Context,
    accountId: String,
    database: NfCompraDatabase,
    syncState: ShoppingSyncState,
) {
    try {
        syncState.releaseRepository {
            SyncWorker.cancel(context, accountId)
        }
    } finally {
        NfCompraDatabase.release(accountId, database)
    }
}

private fun HouseholdDto.toLocal() = LocalHousehold(
    id = id,
    name = name,
    ownerId = ownerId,
    createdAt = createdAt,
    updatedAt = updatedAt,
)

private fun ShoppingListDto.toLocal() = LocalShoppingList(
    id = id,
    householdId = householdId,
    name = name,
    isDefault = isDefault,
    version = version,
    createdAt = createdAt,
    updatedAt = updatedAt,
)

private fun ShoppingItemDto.toLocal() = LocalShoppingItem(
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
    createdBy = createdBy,
    updatedBy = updatedBy,
    createdAt = createdAt,
    updatedAt = updatedAt,
)

private fun LocalShoppingItem.toUiModel(operation: PendingOperation?): ShoppingListItemUiModel {
    val server = operation?.serverItemJson?.let(shoppingItemJsonAdapter::fromJson)
    val pendingUpdate = operation?.updateRequest()
    return ShoppingListItemUiModel(
        id = id,
        name = name,
        quantity = quantity.toString().removeSuffix(".0") + (unit?.let { " $it" } ?: ""),
        checked = isChecked,
        version = version,
        pendingState = operation?.state,
        serverItemJson = operation?.serverItemJson,
        pendingOperationId = operation?.operationId,
        pendingOperationType = operation?.type,
        pendingExpectedVersion = pendingUpdate?.expectedVersion ?: operation?.expectedVersion(),
        pendingIsChecked = pendingUpdate?.isChecked,
        serverItemName = server?.name,
        serverItemVersion = server?.version,
        serverItemIsChecked = server?.isChecked,
    )
}

private fun PendingOperation.toTombstoneUiModel(): ShoppingListItemUiModel {
    val create = runCatching {
        if (type == PendingOperationType.CREATE) createItemJsonAdapter.fromJson(payloadJson) else null
    }.getOrNull()
    val update = runCatching {
        if (type == PendingOperationType.UPDATE) updateItemJsonAdapter.fromJson(payloadJson) else null
    }.getOrNull()
    val delete = runCatching {
        if (type == PendingOperationType.DELETE) deleteItemJsonAdapter.fromJson(payloadJson) else null
    }.getOrNull()
    return ShoppingListItemUiModel(
        id = itemId,
        name = create?.name ?: update?.name ?: "Producto eliminado",
        quantity = "",
        checked = false,
        version = update?.expectedVersion ?: delete?.expectedVersion ?: 0,
        pendingState = state,
        serverItemJson = serverItemJson,
        pendingOperationId = operationId,
        pendingOperationType = type,
        pendingExpectedVersion = update?.expectedVersion ?: delete?.expectedVersion,
        pendingIsChecked = update?.isChecked,
    )
}

private fun PendingOperation.updateRequest(): UpdateItemRequest? = runCatching {
    if (type == PendingOperationType.UPDATE) updateItemJsonAdapter.fromJson(payloadJson) else null
}.getOrNull()

private fun PendingOperation.expectedVersion(): Int? = runCatching {
    when (type) {
        PendingOperationType.UPDATE -> updateItemJsonAdapter.fromJson(payloadJson)?.expectedVersion
        PendingOperationType.DELETE -> deleteItemJsonAdapter.fromJson(payloadJson)?.expectedVersion
        else -> null
    }
}.getOrNull()

private fun <T> Response<T>.bodyOrThrow(): T {
    body()?.let { return it }
    val error = errorBody()?.string()?.let(offlineErrorAdapter::fromJson)
    val details = error?.error?.details?.current?.let {
        ShoppingListItemUiModel(
            id = it.id,
            name = it.name,
            quantity = it.quantity.toString().removeSuffix(".0") + (it.unit?.let { unit -> " $unit" } ?: ""),
            checked = it.isChecked,
            version = it.version,
        )
    }
    throw ShoppingListApiException(
        status = code(),
        code = error?.error?.code,
        message = error?.error?.message ?: "No se pudo completar la operaciÃ³n.",
        current = details,
    )
}

private val offlineErrorAdapter =
    Moshi.Builder().addLast(KotlinJsonAdapterFactory()).build().adapter(ErrorResponse::class.java)
private val shoppingItemJsonAdapter =
    Moshi.Builder().addLast(KotlinJsonAdapterFactory()).build().adapter(ShoppingItemDto::class.java)
private val createItemJsonAdapter =
    Moshi.Builder().addLast(KotlinJsonAdapterFactory()).build().adapter(CreateItemRequest::class.java)
private val updateItemJsonAdapter =
    Moshi.Builder().addLast(KotlinJsonAdapterFactory()).build().adapter(UpdateItemRequest::class.java)
private val deleteItemJsonAdapter =
    Moshi.Builder().addLast(KotlinJsonAdapterFactory()).build().adapter(DeleteItemRequest::class.java)

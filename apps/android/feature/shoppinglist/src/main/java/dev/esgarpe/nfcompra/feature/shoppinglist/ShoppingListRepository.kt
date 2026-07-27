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
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flow
import retrofit2.Response
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
) : ShoppingRepository {
    override val continuouslyObservesItems = true
    override var isOffline: Boolean = false
        private set

    override suspend fun households(): List<HouseholdUiModel> {
        val remote = try {
            api.households().also { isOffline = false }.bodyOrThrow().households.map(HouseholdDto::toLocal)
        } catch (error: ShoppingListApiException) {
            isOffline = false
            throw error
        } catch (error: IOException) {
            isOffline = true
            return dao.households()
                .ifEmpty { throw error }
                .map { HouseholdUiModel(it.id, it.name) }
        }
        dao.replaceHouseholds(remote)
        return remote.map { HouseholdUiModel(it.id, it.name) }
    }

    override suspend fun lists(householdId: String): List<ShoppingListSummaryUiModel> {
        val remote = try {
            api.lists(householdId).also { isOffline = false }.bodyOrThrow().lists.map(ShoppingListDto::toLocal)
        } catch (error: ShoppingListApiException) {
            isOffline = false
            throw error
        } catch (error: IOException) {
            isOffline = true
            return dao.lists(householdId)
                .ifEmpty { throw error }
                .map { ShoppingListSummaryUiModel(it.id, it.householdId, it.name) }
        }
        dao.replaceLists(householdId, remote)
        return remote.map { ShoppingListSummaryUiModel(it.id, it.householdId, it.name) }
    }

    override suspend fun refreshItems(listId: String) {
        val remote = try {
            api.items(listId).also { isOffline = false }.bodyOrThrow().items.map(ShoppingItemDto::toLocal)
        } catch (error: ShoppingListApiException) {
            isOffline = false
            throw error
        } catch (error: IOException) {
            isOffline = true
            if (dao.list(listId) == null) throw error
            return
        }
        dao.replaceItems(listId, remote)
    }

    override fun observeItems(listId: String): Flow<List<ShoppingListItemUiModel>> =
        combine(
            dao.observeItems(listId),
            dao.observeOperations(listId),
        ) { items, operations ->
            items.map { item ->
                val latest = operations.lastOrNull { operation -> operation.itemId == item.id }
                item.toUiModel(latest)
            }
        }

    override suspend fun createHousehold(
        name: String,
    ): Pair<HouseholdUiModel, ShoppingListSummaryUiModel> {
        val response = api.createHousehold(CreateHouseholdRequest(name)).also { isOffline = false }.bodyOrThrow()
        val households = dao.households()
        dao.replaceHouseholds(households.filterNot { it.id == response.household.id } + response.household.toLocal())
        val lists = dao.lists(response.household.id)
        dao.replaceLists(
            response.household.id,
            lists.filterNot { it.id == response.defaultList.id } + response.defaultList.toLocal(),
        )
        return HouseholdUiModel(response.household.id, response.household.name) to
            ShoppingListSummaryUiModel(response.defaultList.id, response.defaultList.householdId, response.defaultList.name)
    }

    override suspend fun createList(
        householdId: String,
        name: String,
    ): ShoppingListSummaryUiModel {
        val remote = api.createList(householdId, CreateListRequest(name)).also { isOffline = false }.bodyOrThrow().list
        val lists = dao.lists(householdId)
        dao.replaceLists(householdId, lists.filterNot { it.id == remote.id } + remote.toLocal())
        return ShoppingListSummaryUiModel(remote.id, remote.householdId, remote.name)
    }

    override suspend fun createItem(listId: String, name: String) {
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

    override suspend fun updateItem(
        item: ShoppingListItemUiModel,
        name: String?,
        checked: Boolean?,
    ) {
        val local = requireNotNull(dao.item(item.id)) { "No existe el producto local ${item.id}." }
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
            expectedVersion = item.version,
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

    override suspend fun deleteItem(item: ShoppingListItemUiModel) {
        val local = requireNotNull(dao.item(item.id)) { "No existe el producto local ${item.id}." }
        val operationId = operationId()
        val request = DeleteItemRequest(expectedVersion = item.version, operationId = operationId)
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

    companion object {
        private val moshi = Moshi.Builder().addLast(KotlinJsonAdapterFactory()).build()
        private val createItemAdapter = moshi.adapter(CreateItemRequest::class.java)
        private val updateItemAdapter = moshi.adapter(UpdateItemRequest::class.java)
        private val deleteItemAdapter = moshi.adapter(DeleteItemRequest::class.java)

        fun create(
            context: Context,
            api: ShoppingListApi,
            accountId: String,
        ): OfflineShoppingRepository {
            val database = NfCompraDatabase.create(context, accountId)
            return OfflineShoppingRepository(api, database.shoppingDao())
        }
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

private fun LocalShoppingItem.toUiModel(operation: PendingOperation?) = ShoppingListItemUiModel(
    id = id,
    name = name,
    quantity = quantity.toString().removeSuffix(".0") + (unit?.let { " $it" } ?: ""),
    checked = isChecked,
    version = version,
    pendingState = operation?.state,
    serverItemJson = operation?.serverItemJson,
)

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

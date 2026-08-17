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
import java.io.File
import java.io.IOException
import java.text.Normalizer
import java.util.UUID

data class HouseholdUiModel(val id: String, val name: String, val ownerId: String = "")
data class ShoppingListSummaryUiModel(val id: String, val householdId: String, val name: String, val version: Int = 1)
data class ProductCatalogUiModel(
    val id: String,
    val name: String,
    val normalizedName: String,
    val categoryName: String?,
    val iconKey: String,
    val packageSize: String?,
    val isFavorite: Boolean = false,
    val categoryId: String? = null,
    val brand: String? = null,
    val scope: String? = null,
    val householdId: String? = null,
    val canEdit: Boolean = false,
    val canDelete: Boolean = false,
)
data class ProductCategoryUiModel(
    val id: String,
    val name: String,
    val normalizedName: String,
    val iconKey: String,
    val isFavorite: Boolean = false,
    val scope: String? = null,
    val householdId: String? = null,
    val canEdit: Boolean = false,
    val canDelete: Boolean = false,
)
data class ProfileUiModel(
    val id: String,
    val email: String,
    val name: String,
    val firstName: String?,
    val lastName: String?,
    val username: String?,
    val role: String? = null,
) {
    val displayName: String = name.takeIf { it.isNotBlank() }
        ?: listOfNotNull(firstName, lastName).joinToString(" ").takeIf { it.isNotBlank() }
        ?: username?.takeIf { it.isNotBlank() }
        ?: email.substringBefore("@")
}

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
    suspend fun cachedHouseholds(): List<HouseholdUiModel>? = null
    suspend fun cachedLists(householdId: String): List<ShoppingListSummaryUiModel>? = null
    suspend fun refreshItems(listId: String) = Unit
    fun observeItems(listId: String): Flow<List<ShoppingListItemUiModel>>
    suspend fun createHousehold(name: String): HouseholdUiModel
    suspend fun updateHousehold(household: HouseholdUiModel, name: String): HouseholdUiModel = error("No se usa en este repositorio.")
    suspend fun deleteHousehold(household: HouseholdUiModel): Unit = error("No se usa en este repositorio.")
    suspend fun leaveHousehold(householdId: String): Unit = error("No se usa en este repositorio.")
    suspend fun createList(householdId: String, name: String): ShoppingListSummaryUiModel
    suspend fun updateList(list: ShoppingListSummaryUiModel, name: String): ShoppingListSummaryUiModel = error("No se usa en este repositorio.")
    suspend fun deleteList(list: ShoppingListSummaryUiModel): Unit = error("No se usa en este repositorio.")
    suspend fun deleteCheckedItems(listId: String): Int = error("No se usa en este repositorio.")
    suspend fun createItem(listId: String, name: String, quantity: Double = 1.0)
    suspend fun updateItem(item: ShoppingListItemUiModel, name: String? = null, checked: Boolean? = null, quantity: Double? = null)
    suspend fun deleteItem(item: ShoppingListItemUiModel)
    suspend fun searchProductCatalog(householdId: String?, search: String, limit: Int): List<ProductCatalogUiModel> = emptyList()
    suspend fun warmProductCatalog(householdId: String?) = Unit
    suspend fun productCategories(householdId: String?): List<ProductCategoryUiModel> = emptyList()
    suspend fun setProductFavorite(productId: String, favorite: Boolean): ProductCatalogUiModel? = null
    suspend fun createProductCategory(householdId: String?, name: String, iconKey: String): ProductCategoryUiModel? = null
    suspend fun updateProductCategory(category: ProductCategoryUiModel, name: String, iconKey: String): ProductCategoryUiModel? = null
    suspend fun deleteProductCategory(category: ProductCategoryUiModel) = Unit
    suspend fun createProductCatalogItem(householdId: String?, name: String, categoryId: String?, iconKey: String, brand: String?, packageSize: String?): ProductCatalogUiModel? = null
    suspend fun updateProductCatalogItem(product: ProductCatalogUiModel, name: String, categoryId: String?, iconKey: String, brand: String?, packageSize: String?): ProductCatalogUiModel? = null
    suspend fun deleteProductCatalogItem(product: ProductCatalogUiModel) = Unit
    suspend fun profile(): ProfileUiModel? = null
    suspend fun updateProfile(firstName: String?, lastName: String?, username: String?): ProfileUiModel? = null
    suspend fun changePassword(currentPassword: String, newPassword: String) = Unit
    suspend fun deleteAccount(currentPassword: String) = Unit
    suspend fun profileDisplayName(): String? = null
    suspend fun resolveConflict(resolution: ResolveConflict) = Unit
}

class ShoppingListRepository(private val api: ShoppingListApi) : ShoppingRepository {
    private val catalogSnapshots = mutableMapOf<String?, List<ProductCatalogUiModel>>()
    private var favoriteProductIds: Set<String> = emptySet()
    private val catalogMutex = Mutex()

    override suspend fun households(): List<HouseholdUiModel> =
        api.households().bodyOrThrow().households.map { HouseholdUiModel(it.id, it.name, it.ownerId) }

    override suspend fun lists(householdId: String): List<ShoppingListSummaryUiModel> =
        api.lists(householdId).bodyOrThrow().lists.map { ShoppingListSummaryUiModel(it.id, it.householdId, it.name) }

    override fun observeItems(listId: String): Flow<List<ShoppingListItemUiModel>> = flow {
        emit(api.items(listId).bodyOrThrow().items.map(::toUiModel))
    }

    override suspend fun createHousehold(name: String): HouseholdUiModel {
        val response = api.createHousehold(CreateHouseholdRequest(name)).bodyOrThrow()
        return HouseholdUiModel(response.household.id, response.household.name)
    }

    override suspend fun updateHousehold(household: HouseholdUiModel, name: String): HouseholdUiModel {
        val response = api.updateHousehold(household.id, UpdateHouseholdRequest(name)).bodyOrThrow()
        return HouseholdUiModel(response.household.id, response.household.name)
    }

    override suspend fun deleteHousehold(household: HouseholdUiModel) {
        api.deleteHousehold(household.id).bodyOrThrow()
    }

    override suspend fun leaveHousehold(householdId: String) {
        api.leaveHousehold(householdId).bodyOrThrow()
    }

    override suspend fun createList(householdId: String, name: String): ShoppingListSummaryUiModel =
        api.createList(householdId, CreateListRequest(name)).bodyOrThrow().list.toUiModel()

    override suspend fun updateList(list: ShoppingListSummaryUiModel, name: String): ShoppingListSummaryUiModel =
        api.updateList(list.id, UpdateListRequest(name = name, expectedVersion = list.version, operationId = UUID.randomUUID().toString())).bodyOrThrow().list.toUiModel()

    override suspend fun deleteList(list: ShoppingListSummaryUiModel) {
        api.deleteList(list.id, DeleteListRequest(expectedVersion = list.version, operationId = UUID.randomUUID().toString())).bodyOrThrow()
    }

    override suspend fun deleteCheckedItems(listId: String): Int =
        api.deleteCheckedItems(listId, DeleteCheckedItemsRequest(operationId = UUID.randomUUID().toString())).bodyOrThrow().removed

    override suspend fun createItem(listId: String, name: String, quantity: Double) {
        api.createItem(listId, CreateItemRequest(name = name, quantity = quantity, operationId = UUID.randomUUID().toString())).bodyOrThrow()
    }

    override suspend fun updateItem(item: ShoppingListItemUiModel, name: String?, checked: Boolean?, quantity: Double?) {
        api.updateItem(item.id, UpdateItemRequest(name = name, quantity = quantity, isChecked = checked, expectedVersion = item.version, operationId = UUID.randomUUID().toString())).bodyOrThrow()
    }

    override suspend fun deleteItem(item: ShoppingListItemUiModel) {
        api.deleteItem(item.id, DeleteItemRequest(item.version, UUID.randomUUID().toString())).bodyOrThrow()
    }

    override suspend fun searchProductCatalog(householdId: String?, search: String, limit: Int): List<ProductCatalogUiModel> {
        val query = search.normalizedSearch()
        if (query.isBlank()) return loadCatalogSnapshotOrNull(householdId)?.take(limit.coerceAtLeast(1)) ?: emptyList()
        if (query.length < 3) return emptyList()
        val snapshot = catalogSnapshots[householdId]
        if (snapshot != null) return snapshot.searchCatalog(query, limit)
        return runCatching {
            val products = api.searchProductCatalog(search, limit.coerceIn(1, 25), householdId).bodyOrThrow().products.map(ProductCatalogItemDto::toUiModel)
            favoriteProductIds = products.favoriteIds() + favoriteProductIds
            products.applyFavoriteOverlay(favoriteProductIds)
        }.getOrElse { emptyList() }
    }

    override suspend fun warmProductCatalog(householdId: String?) {
        if (catalogSnapshots[householdId] == null) loadCatalogSnapshotOrNull(householdId)
    }

    override suspend fun productCategories(householdId: String?): List<ProductCategoryUiModel> =
        api.productCategories(householdId).bodyOrThrow().categories.map(ProductCategoryDto::toUiModel)

    override suspend fun setProductFavorite(productId: String, favorite: Boolean): ProductCatalogUiModel? {
        if (favorite) api.addProductFavorite(productId).bodyOrThrow()
        else api.removeProductFavorite(productId).bodyOrThrow()
        favoriteProductIds = if (favorite) favoriteProductIds + productId else favoriteProductIds - productId
        catalogSnapshots.replaceAll { _, products -> products.applyFavoriteOverlay(favoriteProductIds) }
        return catalogSnapshots.values.flatten().firstOrNull { it.id == productId }
            ?: ProductCatalogUiModel(productId, "", "", null, "star", null, favorite)
    }

    override suspend fun createProductCategory(householdId: String?, name: String, iconKey: String): ProductCategoryUiModel {
        invalidateCatalogSnapshot()
        val request = ProductCategoryMutationRequest(name = name, iconKey = iconKey)
        return if (householdId != null) {
            api.createHouseholdProductCategory(householdId, request).bodyOrThrow().category.toUiModel()
        } else {
            api.createProductCategory(request).bodyOrThrow().category.toUiModel()
        }
    }

    override suspend fun updateProductCategory(category: ProductCategoryUiModel, name: String, iconKey: String): ProductCategoryUiModel {
        invalidateCatalogSnapshot()
        val request = ProductCategoryMutationRequest(name = name, iconKey = iconKey)
        return if (category.scope == "household" && category.householdId != null) {
            api.updateHouseholdProductCategory(category.householdId, category.id, request).bodyOrThrow().category.toUiModel()
        } else {
            api.updateProductCategory(category.id, request).bodyOrThrow().category.toUiModel()
        }
    }

    override suspend fun deleteProductCategory(category: ProductCategoryUiModel) {
        if (category.scope == "household" && category.householdId != null) {
            api.deleteHouseholdProductCategory(category.householdId, category.id).bodyOrThrow()
        } else {
            api.deleteProductCategory(category.id).bodyOrThrow()
        }
        invalidateCatalogSnapshot()
    }

    override suspend fun createProductCatalogItem(householdId: String?, name: String, categoryId: String?, iconKey: String, brand: String?, packageSize: String?): ProductCatalogUiModel {
        val request = ProductCatalogMutationRequest(name, categoryId, iconKey, brand, packageSize)
        val product = if (householdId != null) {
            api.createHouseholdProductCatalogItem(householdId, request).bodyOrThrow().product.toUiModel()
        } else {
            api.createProductCatalogItem(request).bodyOrThrow().product.toUiModel()
        }
        return product.also(::upsertCatalogSnapshot)
    }

    override suspend fun updateProductCatalogItem(product: ProductCatalogUiModel, name: String, categoryId: String?, iconKey: String, brand: String?, packageSize: String?): ProductCatalogUiModel {
        invalidateCatalogSnapshot()
        val request = ProductCatalogMutationRequest(name, categoryId, iconKey, brand, packageSize)
        return if (product.scope == "household" && product.householdId != null) {
            api.updateHouseholdProductCatalogItem(product.householdId, product.id, request).bodyOrThrow().product.toUiModel()
        } else {
            api.updateProductCatalogItem(product.id, request).bodyOrThrow().product.toUiModel()
        }
    }

    override suspend fun deleteProductCatalogItem(product: ProductCatalogUiModel) {
        if (product.scope == "household" && product.householdId != null) {
            api.deleteHouseholdProductCatalogItem(product.householdId, product.id).bodyOrThrow()
        } else {
            api.deleteProductCatalogItem(product.id).bodyOrThrow()
        }
        favoriteProductIds = favoriteProductIds - product.id
        invalidateCatalogSnapshot()
    }

    override suspend fun profile(): ProfileUiModel =
        api.me().bodyOrThrow().user.toUiModel()

    override suspend fun updateProfile(firstName: String?, lastName: String?, username: String?): ProfileUiModel =
        api.updateProfile(UpdateProfileRequest(firstName, lastName, username)).bodyOrThrow().user.toUiModel()

    override suspend fun changePassword(currentPassword: String, newPassword: String) {
        api.changePassword(ChangePasswordRequest(currentPassword, newPassword)).bodyOrThrow()
    }

    override suspend fun deleteAccount(currentPassword: String) {
        api.deleteAccount(DeleteAccountRequest(currentPassword)).bodyOrThrow()
    }

    override suspend fun profileDisplayName(): String? =
        profile().displayName

    private fun ShoppingListDto.toUiModel() = ShoppingListSummaryUiModel(id, householdId, name, version)
    private fun MeUserDto.toUiModel() = ProfileUiModel(id, email, name, firstName, lastName, username, role)

    private fun invalidateCatalogSnapshot() {
        catalogSnapshots.clear()
    }

    private fun upsertCatalogSnapshot(product: ProductCatalogUiModel) {
        val key = product.householdId
        catalogSnapshots[key] = (catalogSnapshots[key]?.filterNot { it.id == product.id } ?: emptyList()) + product
    }

    private suspend fun loadCatalogSnapshotOrNull(householdId: String?): List<ProductCatalogUiModel>? = catalogMutex.withLock {
        catalogSnapshots[householdId]?.let { return@withLock it }
        runCatching {
            api.productCatalogSnapshot(householdId).bodyOrThrow().products.map(ProductCatalogItemDto::toUiModel)
        }.getOrNull()?.let { products ->
            favoriteProductIds = products.favoriteIds() + favoriteProductIds
            products.applyFavoriteOverlay(favoriteProductIds).also { catalogSnapshots[householdId] = it }
        }
    }

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
            message = error?.error?.message ?: "No se pudo completar la operación.",
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
    private val catalogCache: ProductCatalogCache? = null,
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
    private val catalogSnapshots = mutableMapOf<String?, List<ProductCatalogUiModel>>()
    private var favoriteProductIds: Set<String> = emptySet()
    private val catalogMutex = Mutex()

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
            return@accountOperation dao.households().map { HouseholdUiModel(it.id, it.name, it.ownerId) }
        }
        dao.replaceHouseholds(remote, clock())
        dao.households().map { HouseholdUiModel(it.id, it.name, it.ownerId) }
    }

    override suspend fun cachedHouseholds(): List<HouseholdUiModel>? = accountOperation {
        if (dao.snapshot(SnapshotCollection.HOUSEHOLDS) == null) return@accountOperation null
        dao.households().map { HouseholdUiModel(it.id, it.name, it.ownerId) }
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

    override suspend fun cachedLists(householdId: String): List<ShoppingListSummaryUiModel>? = accountOperation {
        if (dao.snapshot(SnapshotCollection.lists(householdId)) == null) return@accountOperation null
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
    ): HouseholdUiModel = accountOperation {
        val response = api.createHousehold(CreateHouseholdRequest(name)).also { isOffline = false }.bodyOrThrow()
        dao.upsertHousehold(response.household.toLocal())
        HouseholdUiModel(response.household.id, response.household.name)
    }

    override suspend fun updateHousehold(
        household: HouseholdUiModel,
        name: String,
    ): HouseholdUiModel = accountOperation {
        val response = api.updateHousehold(household.id, UpdateHouseholdRequest(name)).also { isOffline = false }.bodyOrThrow()
        dao.upsertHousehold(response.household.toLocal())
        HouseholdUiModel(response.household.id, response.household.name)
    }

    override suspend fun deleteHousehold(household: HouseholdUiModel) = accountOperation {
        api.deleteHousehold(household.id).also { isOffline = false }.bodyOrThrow()
        dao.deleteHouseholdById(household.id)
        Unit
    }

    override suspend fun leaveHousehold(householdId: String) = accountOperation {
        api.leaveHousehold(householdId).also { isOffline = false }.bodyOrThrow()
        dao.deleteHouseholdById(householdId)
        Unit
    }

    override suspend fun createList(
        householdId: String,
        name: String,
    ): ShoppingListSummaryUiModel = accountOperation {
        val remote = api.createList(householdId, CreateListRequest(name)).also { isOffline = false }.bodyOrThrow().list
        dao.upsertList(remote.toLocal())
        ShoppingListSummaryUiModel(remote.id, remote.householdId, remote.name, remote.version)
    }

    override suspend fun updateList(
        list: ShoppingListSummaryUiModel,
        name: String,
    ): ShoppingListSummaryUiModel = accountOperation {
        val remote = api.updateList(
            list.id,
            UpdateListRequest(name = name, expectedVersion = list.version, operationId = operationId()),
        ).also { isOffline = false }.bodyOrThrow().list
        dao.upsertList(remote.toLocal())
        ShoppingListSummaryUiModel(remote.id, remote.householdId, remote.name, remote.version)
    }

    override suspend fun deleteList(list: ShoppingListSummaryUiModel) = accountOperation {
        api.deleteList(
            list.id,
            DeleteListRequest(expectedVersion = list.version, operationId = operationId()),
        ).also { isOffline = false }.bodyOrThrow()
        dao.deleteListById(list.id)
        Unit
    }

    override suspend fun deleteCheckedItems(listId: String): Int = accountOperation {
        val removed = api.deleteCheckedItems(
            listId,
            DeleteCheckedItemsRequest(operationId = operationId()),
        ).also { isOffline = false }.bodyOrThrow().removed
        dao.deleteCheckedItems(listId)
        removed
    }

    override suspend fun createItem(listId: String, name: String, quantity: Double) = accountOperation {
        databaseMutex.withLock {
            val operationId = operationId()
            val now = clock()
            val item = LocalShoppingItem(
                id = "local-$operationId",
                listId = listId,
                name = name,
                normalizedName = name.trim().lowercase(),
                quantity = quantity,
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
            val request = CreateItemRequest(name = name, quantity = quantity, operationId = operationId)
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
        quantity: Double?,
    ) = accountOperation {
        databaseMutex.withLock {
            val resolvedItemId = itemAliases.resolve(item.id)
            val local = requireNotNull(dao.item(resolvedItemId)) { "No existe el producto local $resolvedItemId." }
            val operationId = operationId()
            val now = clock()
            val updated = local.copy(
                name = name ?: local.name,
                normalizedName = name?.trim()?.lowercase() ?: local.normalizedName,
                quantity = quantity ?: local.quantity,
                isChecked = checked ?: local.isChecked,
                updatedAt = now.toString(),
            )
            val request = UpdateItemRequest(
                name = name,
                quantity = quantity,
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

    override suspend fun searchProductCatalog(householdId: String?, search: String, limit: Int): List<ProductCatalogUiModel> = accountOperation {
        val query = search.normalizedSearch()
        if (query.isBlank()) return@accountOperation loadCatalogSnapshotOrNull(householdId)?.take(limit.coerceAtLeast(1)) ?: emptyList()
        if (query.length < 3) return@accountOperation emptyList()
        val snapshot = catalogSnapshots[householdId] ?: loadCachedCatalogSnapshotOrNull(householdId)
        if (snapshot != null) return@accountOperation snapshot.searchCatalog(query, limit)
        runCatching {
            val products = api.searchProductCatalog(search, limit.coerceIn(1, 25), householdId).bodyOrThrow().products.map(ProductCatalogItemDto::toUiModel)
            favoriteProductIds = products.favoriteIds() + favoriteProductIds
            products.applyFavoriteOverlay(favoriteProductIds)
        }.getOrElse { emptyList() }
    }

    override suspend fun warmProductCatalog(householdId: String?) = accountOperation {
        if (catalogSnapshots[householdId] == null) loadCatalogSnapshotOrNull(householdId)
        Unit
    }

    override suspend fun productCategories(householdId: String?): List<ProductCategoryUiModel> = accountOperation {
        runCatching {
            api.productCategories(householdId).also { isOffline = false }.bodyOrThrow().categories.map(ProductCategoryDto::toUiModel)
        }.getOrElse { emptyList() }
    }

    override suspend fun setProductFavorite(productId: String, favorite: Boolean): ProductCatalogUiModel? = accountOperation {
        if (favorite) api.addProductFavorite(productId).also { isOffline = false }.bodyOrThrow()
        else api.removeProductFavorite(productId).also { isOffline = false }.bodyOrThrow()
        favoriteProductIds = if (favorite) favoriteProductIds + productId else favoriteProductIds - productId
        catalogSnapshots.replaceAll { _, products -> products.applyFavoriteOverlay(favoriteProductIds) }
        catalogSnapshots.forEach { (key, products) -> catalogCache?.write(key, products) }
        catalogSnapshots.values.flatten().firstOrNull { it.id == productId }
            ?: ProductCatalogUiModel(productId, "", "", null, "star", null, favorite)
    }

    override suspend fun createProductCategory(householdId: String?, name: String, iconKey: String): ProductCategoryUiModel = accountOperation {
        val request = ProductCategoryMutationRequest(name = name, iconKey = iconKey)
        val category = if (householdId != null) {
            api.createHouseholdProductCategory(householdId, request).also { isOffline = false }.bodyOrThrow().category.toUiModel()
        } else {
            api.createProductCategory(request).also { isOffline = false }.bodyOrThrow().category.toUiModel()
        }
        invalidateCatalogSnapshot()
        category
    }

    override suspend fun updateProductCategory(category: ProductCategoryUiModel, name: String, iconKey: String): ProductCategoryUiModel = accountOperation {
        val request = ProductCategoryMutationRequest(name = name, iconKey = iconKey)
        val updated = if (category.scope == "household" && category.householdId != null) {
            api.updateHouseholdProductCategory(category.householdId, category.id, request).also { isOffline = false }.bodyOrThrow().category.toUiModel()
        } else {
            api.updateProductCategory(category.id, request).also { isOffline = false }.bodyOrThrow().category.toUiModel()
        }
        invalidateCatalogSnapshot()
        updated
    }

    override suspend fun deleteProductCategory(category: ProductCategoryUiModel) = accountOperation {
        if (category.scope == "household" && category.householdId != null) {
            api.deleteHouseholdProductCategory(category.householdId, category.id).also { isOffline = false }.bodyOrThrow()
        } else {
            api.deleteProductCategory(category.id).also { isOffline = false }.bodyOrThrow()
        }
        invalidateCatalogSnapshot()
        Unit
    }

    override suspend fun createProductCatalogItem(householdId: String?, name: String, categoryId: String?, iconKey: String, brand: String?, packageSize: String?): ProductCatalogUiModel = accountOperation {
        val request = ProductCatalogMutationRequest(name, categoryId, iconKey, brand, packageSize)
        val product = if (householdId != null) {
            api.createHouseholdProductCatalogItem(householdId, request).also { isOffline = false }.bodyOrThrow().product.toUiModel()
        } else {
            api.createProductCatalogItem(request).also { isOffline = false }.bodyOrThrow().product.toUiModel()
        }
        upsertCatalogSnapshot(product)
        product
    }

    override suspend fun updateProductCatalogItem(product: ProductCatalogUiModel, name: String, categoryId: String?, iconKey: String, brand: String?, packageSize: String?): ProductCatalogUiModel = accountOperation {
        val request = ProductCatalogMutationRequest(name, categoryId, iconKey, brand, packageSize)
        val updated = if (product.scope == "household" && product.householdId != null) {
            api.updateHouseholdProductCatalogItem(product.householdId, product.id, request).also { isOffline = false }.bodyOrThrow().product.toUiModel()
        } else {
            api.updateProductCatalogItem(product.id, request).also { isOffline = false }.bodyOrThrow().product.toUiModel()
        }
        invalidateCatalogSnapshot()
        updated
    }

    override suspend fun deleteProductCatalogItem(product: ProductCatalogUiModel) = accountOperation {
        if (product.scope == "household" && product.householdId != null) {
            api.deleteHouseholdProductCatalogItem(product.householdId, product.id).also { isOffline = false }.bodyOrThrow()
        } else {
            api.deleteProductCatalogItem(product.id).also { isOffline = false }.bodyOrThrow()
        }
        favoriteProductIds = favoriteProductIds - product.id
        invalidateCatalogSnapshot()
        Unit
    }

    override suspend fun profileDisplayName(): String? = accountOperation {
        runCatching {
            profile()?.displayName
        }.getOrNull()
    }

    override suspend fun profile(): ProfileUiModel = accountOperation {
        api.me().also { isOffline = false }.bodyOrThrow().user.toProfileUiModel()
    }

    override suspend fun updateProfile(firstName: String?, lastName: String?, username: String?): ProfileUiModel = accountOperation {
        api.updateProfile(UpdateProfileRequest(firstName, lastName, username)).also { isOffline = false }.bodyOrThrow().user.toProfileUiModel()
    }

    override suspend fun changePassword(currentPassword: String, newPassword: String) = accountOperation {
        api.changePassword(ChangePasswordRequest(currentPassword, newPassword)).also { isOffline = false }.bodyOrThrow()
        Unit
    }

    override suspend fun deleteAccount(currentPassword: String) = accountOperation {
        api.deleteAccount(DeleteAccountRequest(currentPassword)).also { isOffline = false }.bodyOrThrow()
        Unit
    }

    private suspend fun loadCatalogSnapshotOrNull(householdId: String?): List<ProductCatalogUiModel>? = catalogMutex.withLock {
        catalogSnapshots[householdId]?.let { return@withLock it }
        loadCachedCatalogSnapshotOrNull(householdId)?.let { return@withLock it }
        runCatching {
            api.productCatalogSnapshot(householdId).bodyOrThrow().products.map(ProductCatalogItemDto::toUiModel)
        }.getOrNull()?.let { products ->
            favoriteProductIds = products.favoriteIds() + favoriteProductIds
            products.applyFavoriteOverlay(favoriteProductIds).also {
                catalogSnapshots[householdId] = it
                catalogCache?.write(householdId, it)
            }
        }
    }

    private fun loadCachedCatalogSnapshotOrNull(householdId: String?): List<ProductCatalogUiModel>? =
        catalogCache?.read(householdId)?.let { cached ->
            favoriteProductIds = cached.favoriteIds() + favoriteProductIds
            cached.applyFavoriteOverlay(favoriteProductIds).also { catalogSnapshots[householdId] = it }
        }

    private fun invalidateCatalogSnapshot() {
        catalogSnapshots.clear()
        catalogCache?.clear()
    }

    private suspend fun upsertCatalogSnapshot(product: ProductCatalogUiModel) = catalogMutex.withLock {
        val key = product.householdId
        catalogSnapshots[key] = (catalogSnapshots[key]?.filterNot { it.id == product.id } ?: emptyList()) + product
        catalogSnapshots[key]?.let { catalogCache?.write(key, it) }
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
                    catalogCache = ProductCatalogCache(context, accountId, moshi),
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
        syncState.releaseRepository {}
    } finally {
        NfCompraDatabase.release(accountId, database)
    }
}

internal fun revokeShoppingAccount(context: Context, accountId: String) {
    SyncWorker.cancel(context, accountId)
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
    createdBy = createdBy.orEmpty(),
    updatedBy = updatedBy.orEmpty(),
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

private fun MeUserDto.toProfileUiModel() = ProfileUiModel(id, email, name, firstName, lastName, username, role)

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
        message = error?.error?.message ?: "No se pudo completar la operación.",
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

class ProductCatalogCache(
    context: Context,
    accountId: String,
    moshi: Moshi,
) {
    private val cacheDir = File(context.filesDir, "nfcompra-catalog-$accountId")
    private val adapter = moshi.adapter(ProductCatalogCachePayload::class.java)

    fun read(householdId: String?): List<ProductCatalogUiModel>? = runCatching {
        val file = cacheFile(householdId)
        if (!file.isFile) return null
        val payload = adapter.fromJson(file.readText()) ?: return null
        if (payload.products.isEmpty()) return null
        payload.products
    }.getOrNull()

    fun write(householdId: String?, products: List<ProductCatalogUiModel>) {
        runCatching {
            val file = cacheFile(householdId)
            file.parentFile?.mkdirs()
            file.writeText(adapter.toJson(ProductCatalogCachePayload(products = products)))
        }
    }

    fun clear() {
        runCatching { cacheDir.deleteRecursively() }
    }

    private fun cacheFile(householdId: String?): File =
        if (householdId == null) File(cacheDir, "system.json") else File(cacheDir, "household-$householdId.json")
}

private data class ProductCatalogCachePayload(
    val products: List<ProductCatalogUiModel>,
)

private fun ProductCatalogItemDto.toUiModel() = ProductCatalogUiModel(
    id = id,
    name = name,
    normalizedName = normalizedName,
    categoryName = categoryName,
    iconKey = iconKey,
    packageSize = packageSize,
    isFavorite = isFavorite,
    categoryId = categoryId,
    brand = brand,
    scope = scope,
    householdId = householdId,
    canEdit = permissions?.canEdit ?: false,
    canDelete = permissions?.canDelete ?: false,
)

private fun ProductCategoryDto.toUiModel() = ProductCategoryUiModel(
    id = id,
    name = name,
    normalizedName = normalizedName,
    iconKey = iconKey,
    isFavorite = isFavorite,
    scope = scope,
    householdId = householdId,
    canEdit = permissions?.canEdit ?: false,
    canDelete = permissions?.canDelete ?: false,
)

private fun List<ProductCatalogUiModel>.searchCatalog(query: String, limit: Int): List<ProductCatalogUiModel> =
    mapNotNull { product -> product.catalogRank(query)?.let { rank -> product to rank } }
        .sortedWith(compareBy<Pair<ProductCatalogUiModel, Int>> { if (it.first.isFavorite) 0 else 1 }.thenBy { it.second }.thenBy { it.first.name })
        .take(limit.coerceIn(1, 25))
        .map { it.first }

private fun List<ProductCatalogUiModel>.favoriteIds(): Set<String> =
    filterTo(mutableListOf()) { it.isFavorite }.mapTo(mutableSetOf()) { it.id }

private fun List<ProductCatalogUiModel>.applyFavoriteOverlay(favoriteIds: Set<String>): List<ProductCatalogUiModel> =
    map { product -> product.copy(isFavorite = product.id in favoriteIds) }

private fun ProductCatalogUiModel.catalogRank(query: String): Int? {
    val name = normalizedName.ifBlank { name.normalizedSearch() }
    if (name.startsWith(query)) return 0
    if (name.split(' ').any { it.startsWith(query) }) return 1
    if (name.contains(query)) return 2
    if ((categoryName ?: "").normalizedSearch().contains(query)) return 3
    return null
}

private fun String.normalizedSearch(): String =
    Normalizer.normalize(this, Normalizer.Form.NFD)
        .replace("\\p{Mn}+".toRegex(), "")
        .lowercase()
        .replace("\\s+".toRegex(), " ")
        .trim()

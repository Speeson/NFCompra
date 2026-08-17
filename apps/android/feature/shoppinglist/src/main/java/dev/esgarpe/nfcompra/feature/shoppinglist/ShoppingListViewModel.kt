package dev.esgarpe.nfcompra.feature.shoppinglist

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.cancel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

class ShoppingListViewModel(private val repository: ShoppingRepository) : ViewModel() {
    private val mutableState = MutableStateFlow<ShoppingListViewState>(ShoppingListViewState.Loading)
    val state: StateFlow<ShoppingListViewState> = mutableState.asStateFlow()
    private var pendingContext: ShoppingContext? = null
    private var loadGeneration = 0
    private var itemObservation: Job? = null

    fun onAction(action: ShoppingListAction) {
        viewModelScope.launch {
            val current = mutableState.value
            if (current === ShoppingListViewState.NoHouseholds || current is ShoppingListViewState.InitialHouseholdError) {
                if (action is ShoppingListAction.CreateHousehold) createInitialHousehold(action.name)
                return@launch
            }
            if (current is ShoppingListViewState.InitialHouseholdLoadError) {
                if (action is ShoppingListAction.RetryInitialHouseholdLoad) publishNoList(listOf(action.household), emptyList(), action.household.id)
                return@launch
            }
            val data = current as? ShoppingListViewState.Data ?: return@launch
            try {
                when (action) {
                    is ShoppingListAction.SelectHousehold -> selectHousehold(data, action.id)
                    is ShoppingListAction.SelectList -> refresh(data, action.id)
                    is ShoppingListAction.CreateHousehold -> createHousehold(data, action.name)
                    is ShoppingListAction.RenameHousehold -> renameHousehold(data, action.householdId, action.name)
                    is ShoppingListAction.DeleteHousehold -> deleteHousehold(data, action.householdId)
                    is ShoppingListAction.LeaveHousehold -> leaveHousehold(data, action.householdId)
                    is ShoppingListAction.CreateList -> createList(data, action.householdId, action.name)
                    is ShoppingListAction.RenameList -> renameList(data, action.name)
                    ShoppingListAction.DeleteSelectedList -> deleteSelectedList(data)
                    ShoppingListAction.DeleteCheckedItems -> deleteCheckedItems(data)
                    ShoppingListAction.ClearSelectedList -> clearSelectedList(data)
                    is ShoppingListAction.RetryInitialHouseholdLoad -> Unit
                    is ShoppingListAction.AddItem -> data.selectedListId?.let { mutateAfter(data) { repository.createItem(it, action.name, action.quantity) } }
                    is ShoppingListAction.EditItem -> mutateAfter(data) { repository.updateItem(data.item(action.id), name = action.name, quantity = action.quantity) }
                    is ShoppingListAction.ToggleItem -> mutateItem(data, action.id) { repository.updateItem(it, checked = !it.checked) }
                    is ShoppingListAction.DeleteItem -> mutateAfter(data) { repository.deleteItem(data.item(action.id)) }
                    is ResolveConflict.UseServer -> repository.resolveConflict(action)
                    is ResolveConflict.RetryLocal -> repository.resolveConflict(action)
                    ShoppingListAction.RetryConflict -> data.retryAction?.let(::onAction)
                }
            } catch (error: ShoppingListApiException) {
                val currentItem = error.current
                val conflicted = currentItem?.let { data.withCurrent(it) } ?: data
                mutableState.value = conflicted.copy(message = error.message, conflict = currentItem, retryAction = action)
            } catch (error: CancellationException) {
                throw error
            } catch (_: Exception) {
                mutableState.value = data.copy(message = "No se pudo conectar con el servidor.")
            }
        }
    }

    fun load() = loadForCurrentIntent()

    suspend fun searchProductCatalog(search: String, limit: Int): List<ProductCatalogUiModel> =
        repository.searchProductCatalog(currentHouseholdId(), search, limit)

    fun warmProductCatalog() {
        viewModelScope.launch {
            runCatching { repository.warmProductCatalog(currentHouseholdId()) }
        }
    }

    suspend fun setProductFavorite(productId: String, favorite: Boolean): ProductCatalogUiModel? =
        try {
            repository.setProductFavorite(productId, favorite)
        } catch (error: ShoppingListApiException) {
            publishTransientMessage(error.message.ifBlank { "No se pudo guardar el favorito." })
            null
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            publishTransientMessage("No se pudo guardar el favorito. Comprueba la conexión.")
            null
        }

    suspend fun createProductCategory(name: String, iconKey: String): ProductCategoryUiModel? =
        catalogMutation("No se pudo crear la categoria.") { repository.createProductCategory(currentHouseholdId(), name, iconKey) }

    suspend fun updateProductCategory(category: ProductCategoryUiModel, name: String, iconKey: String): ProductCategoryUiModel? =
        catalogMutation("No se pudo editar la categoria.") { repository.updateProductCategory(category, name, iconKey) }

    suspend fun deleteProductCategory(category: ProductCategoryUiModel): Boolean =
        catalogMutation("No se pudo eliminar la categoria.") { repository.deleteProductCategory(category); true } == true

    suspend fun createProductCatalogItem(name: String, categoryId: String?, iconKey: String, brand: String?, packageSize: String?): ProductCatalogUiModel? =
        catalogMutation("No se pudo crear el producto.") { repository.createProductCatalogItem(currentHouseholdId(), name, categoryId, iconKey, brand, packageSize) }

    suspend fun updateProductCatalogItem(product: ProductCatalogUiModel, name: String, categoryId: String?, iconKey: String, brand: String?, packageSize: String?): ProductCatalogUiModel? =
        catalogMutation("No se pudo editar el producto.") { repository.updateProductCatalogItem(product, name, categoryId, iconKey, brand, packageSize) }

    suspend fun deleteProductCatalogItem(product: ProductCatalogUiModel): Boolean =
        catalogMutation("No se pudo eliminar el producto.") { repository.deleteProductCatalogItem(product); true } == true

    suspend fun updateProfile(firstName: String?, lastName: String?, username: String?): ProfileUiModel? =
        catalogMutation("No se pudo actualizar el perfil.") {
            repository.updateProfile(firstName, lastName, username)?.also { profile ->
                val current = mutableState.value as? ShoppingListViewState.Data ?: return@also
                mutableState.value = current.copy(profile = profile, displayName = profile.displayName, message = "Perfil actualizado.")
            }
        }

    suspend fun changePassword(currentPassword: String, newPassword: String): Boolean =
        catalogMutation("No se pudo cambiar la contrasena.") {
            repository.changePassword(currentPassword, newPassword)
            val current = mutableState.value as? ShoppingListViewState.Data ?: return@catalogMutation true
            mutableState.value = current.copy(message = "Contrasena actualizada.")
            true
        } == true

    suspend fun deleteAccount(currentPassword: String): Boolean =
        catalogMutation("No se pudo eliminar la cuenta.") {
            repository.deleteAccount(currentPassword)
            true
        } == true

    fun refreshProfile() {
        viewModelScope.launch {
            loadProfile()?.let { profile ->
                val current = mutableState.value as? ShoppingListViewState.Data ?: return@launch
                mutableState.value = current.copy(profile = profile, displayName = profile.displayName)
            }
        }
    }

    fun refreshProductCategories() {
        viewModelScope.launch {
            val current = mutableState.value as? ShoppingListViewState.Data ?: return@launch
            val categories = loadCategories()
            mutableState.value = current.copy(productCategories = categories)
        }
    }

    fun openContext(householdId: String, listId: String? = null) {
        pendingContext = ShoppingContext(householdId, listId)
        loadForCurrentIntent()
    }

    fun dispose() {
        loadGeneration++
        pendingContext = null
        itemObservation?.cancel()
        viewModelScope.cancel()
    }

    private suspend fun <T> catalogMutation(message: String, block: suspend () -> T): T? =
        try {
            val result = block()
            refreshCategoriesAfterCatalogMutation()
            result
        } catch (error: ShoppingListApiException) {
            publishTransientMessage(error.message.ifBlank { message })
            null
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            publishTransientMessage("$message Comprueba la conexion.")
            null
        }

    private fun loadForCurrentIntent() {
        val generation = ++loadGeneration
        val context = pendingContext
        itemObservation?.cancel()
        viewModelScope.launch {
            try {
                cachedSelection(context)?.let { cached ->
                    if (generation != loadGeneration) return@launch
                    publishSelection(
                        cached.households,
                        cached.lists,
                        cached.household.id,
                        cached.list?.id,
                        refreshFromServer = false,
                        expectedGeneration = generation,
                    )
                }
                val households = repository.households()
                if (households.isEmpty()) {
                    if (generation == loadGeneration) publishNoHouseholds(expectedGeneration = generation)
                    return@launch
                }
                val household = context?.let { requested ->
                    households.firstOrNull { it.id == requested.householdId }
                        ?: throw ShoppingListApiException(404, "HOUSEHOLD_NOT_ACCESSIBLE", "No se pudo abrir este hogar.")
                } ?: households.first()
                val lists = repository.lists(household.id)
                val list = context?.listId?.let { requested -> lists.firstOrNull { it.id == requested } }
                    ?: lists.firstOrNull()
                if (generation != loadGeneration) return@launch
                publishSelection(households, lists, household.id, list?.id, expectedGeneration = generation)
                if (pendingContext == context) pendingContext = null
            } catch (error: ShoppingListApiException) {
                if (generation == loadGeneration) {
                    val current = mutableState.value as? ShoppingListViewState.Data
                    mutableState.value = if (context != null && current != null) {
                        current.copy(message = error.message)
                    } else {
                        ShoppingListViewState.Error(error.message)
                    }
                    if (pendingContext == context) pendingContext = null
                }
            } catch (error: CancellationException) {
                throw error
            } catch (_: Exception) {
                if (generation == loadGeneration) mutableState.value = ShoppingListViewState.Error("No se pudo conectar con el servidor.")
            }
        }
    }

    private data class ShoppingContext(val householdId: String, val listId: String?)

    private data class CachedSelection(
        val households: List<HouseholdUiModel>,
        val lists: List<ShoppingListSummaryUiModel>,
        val household: HouseholdUiModel,
        val list: ShoppingListSummaryUiModel?,
    )

    private suspend fun cachedSelection(context: ShoppingContext?): CachedSelection? {
        val households = repository.cachedHouseholds() ?: return null
        val household = context?.let { requested -> households.firstOrNull { it.id == requested.householdId } }
            ?: households.firstOrNull() ?: return null
        val lists = repository.cachedLists(household.id) ?: return null
        val list = context?.listId?.let { requested -> lists.firstOrNull { it.id == requested } }
            ?: lists.firstOrNull()
        return CachedSelection(households, lists, household, list)
    }

    private suspend fun selectHousehold(data: ShoppingListViewState.Data, householdId: String) {
        val lists = repository.lists(householdId)
        publishSelection(data.households, lists, householdId, lists.firstOrNull()?.id)
    }

    private suspend fun createHousehold(data: ShoppingListViewState.Data, name: String) {
        val household = repository.createHousehold(name)
        publishNoList(data.households + household, emptyList(), household.id)
    }

    private suspend fun renameHousehold(data: ShoppingListViewState.Data, householdId: String, name: String) {
        val current = data.households.firstOrNull { it.id == householdId } ?: return
        val updated = repository.updateHousehold(current, name)
        publishSelection(
            data.households.map { if (it.id == updated.id) updated else it },
            data.lists,
            data.selectedHouseholdId ?: return,
            data.selectedListId,
            refreshFromServer = false,
        )
    }

    private suspend fun deleteHousehold(data: ShoppingListViewState.Data, householdId: String) {
        val current = data.households.firstOrNull { it.id == householdId } ?: return
        repository.deleteHousehold(current)
        val remainingHouseholds = data.households.filterNot { it.id == householdId }
        if (remainingHouseholds.isEmpty()) {
            publishNoHouseholds()
            return
        }
        val nextHouseholdId = remainingHouseholds.firstOrNull { it.id == data.selectedHouseholdId }?.id
            ?: remainingHouseholds.first().id
        val nextLists = if (nextHouseholdId == data.selectedHouseholdId) {
            data.lists.filterNot { it.householdId == householdId }
        } else {
            repository.lists(nextHouseholdId)
        }
        publishSelection(remainingHouseholds, nextLists, nextHouseholdId, nextLists.firstOrNull()?.id)
    }

    private suspend fun leaveHousehold(data: ShoppingListViewState.Data, householdId: String) {
        repository.leaveHousehold(householdId)
        val remainingHouseholds = data.households.filterNot { it.id == householdId }
        if (remainingHouseholds.isEmpty()) {
            publishNoHouseholds()
            return
        }
        val nextHouseholdId = remainingHouseholds.firstOrNull { it.id == data.selectedHouseholdId }?.id
            ?: remainingHouseholds.first().id
        val nextLists = if (nextHouseholdId == data.selectedHouseholdId) {
            data.lists.filterNot { it.householdId == householdId }
        } else {
            repository.lists(nextHouseholdId)
        }
        publishSelection(remainingHouseholds, nextLists, nextHouseholdId, nextLists.firstOrNull()?.id)
    }

    private suspend fun createInitialHousehold(name: String) {
        val household = try {
            repository.createHousehold(name)
        } catch (error: ShoppingListApiException) {
            mutableState.value = ShoppingListViewState.InitialHouseholdError(
                message = error.message,
                retryAction = ShoppingListAction.CreateHousehold(name),
            )
            return
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            mutableState.value = ShoppingListViewState.InitialHouseholdError(
                message = "No se pudo conectar con el servidor.",
                retryAction = ShoppingListAction.CreateHousehold(name),
            )
            return
        }
        publishNoList(listOf(household), emptyList(), household.id)
    }

    private suspend fun createList(data: ShoppingListViewState.Data, householdId: String, name: String) {
        val list = repository.createList(householdId, name)
        val lists = if (householdId == data.selectedHouseholdId) {
            data.lists + list
        } else {
            repository.lists(householdId)
        }
        publishSelection(data.households, lists, householdId, list.id)
    }

    private suspend fun renameList(data: ShoppingListViewState.Data, name: String) {
        val current = data.selectedList() ?: return
        val updated = repository.updateList(current, name)
        publishSelection(
            data.households,
            data.lists.map { if (it.id == updated.id) updated else it },
            data.selectedHouseholdId ?: return,
            updated.id,
        )
    }

    private suspend fun deleteSelectedList(data: ShoppingListViewState.Data) {
        val current = data.selectedList() ?: return
        repository.deleteList(current)
        val remaining = data.lists.filterNot { it.id == current.id }
        publishSelection(data.households, remaining, data.selectedHouseholdId ?: return, remaining.firstOrNull()?.id)
    }

    private suspend fun deleteCheckedItems(data: ShoppingListViewState.Data) {
        val listId = data.selectedListId ?: return
        repository.deleteCheckedItems(listId)
        publishSelection(data.households, data.lists, data.selectedHouseholdId ?: return, listId)
    }

    private suspend fun clearSelectedList(data: ShoppingListViewState.Data) {
        val listId = data.selectedListId ?: return
        val items = data.content.pending + data.content.checked
        if (items.isEmpty()) return
        items.forEach { repository.deleteItem(it) }
        publishSelection(data.households, data.lists, data.selectedHouseholdId ?: return, listId, refreshFromServer = false)
    }

    private suspend fun mutateAfter(data: ShoppingListViewState.Data, action: suspend () -> Unit) {
        val listId = data.selectedListId ?: return
        action()
        publishSelection(data.households, data.lists, data.selectedHouseholdId ?: return, listId, refreshFromServer = false)
    }

    private suspend fun mutateItem(data: ShoppingListViewState.Data, itemId: String, action: suspend (ShoppingListItemUiModel) -> Unit) {
        val listId = data.selectedListId ?: return
        action(data.item(itemId))
        publishSelection(data.households, data.lists, data.selectedHouseholdId ?: return, listId, refreshFromServer = false)
    }

    private suspend fun refresh(data: ShoppingListViewState.Data, listId: String) {
        publishSelection(data.households, data.lists, data.selectedHouseholdId ?: return, listId)
    }

    private suspend fun publishSelection(
        households: List<HouseholdUiModel>,
        lists: List<ShoppingListSummaryUiModel>,
        householdId: String,
        listId: String?,
        refreshFromServer: Boolean = true,
        expectedGeneration: Int? = null,
    ) {
        if (listId == null) {
            publishNoList(households, lists, householdId, expectedGeneration)
            return
        }
        if (refreshFromServer) repository.refreshItems(listId)
        val items = repository.observeItems(listId).first()
        if (expectedGeneration != null && expectedGeneration != loadGeneration) return
        val selected = lists.first { it.id == listId }
        val householdLists = lists.filter { it.householdId == householdId }
        val selectedListMetrics = currentMetrics().withListMetrics(listId, items)
        val missingMetrics = householdLists.filterNot { it.id in selectedListMetrics.keys }
        val metrics = if (missingMetrics.isEmpty() || !refreshFromServer) {
            selectedListMetrics
        } else {
            selectedListMetrics + loadHouseholdMetrics(missingMetrics)
        }
        val categories = currentCategories()
        val profile = currentProfile()
        val displayName = profile?.displayName ?: currentDisplayName()
        mutableState.value = ShoppingListViewState.Data(
            content = ShoppingListUiState(
                title = selected.name,
                pending = items.filterNot { it.checked },
                checked = items.filter { it.checked },
                isOffline = repository.isOffline,
            ),
            households = households,
            lists = lists,
            selectedHouseholdId = householdId,
            selectedListId = listId,
            listMetrics = metrics,
            productCategories = categories,
            profile = profile,
            displayName = displayName,
        )
        observeSelectedList(listId)
    }

    private suspend fun publishNoList(
        households: List<HouseholdUiModel>,
        lists: List<ShoppingListSummaryUiModel>,
        householdId: String,
        expectedGeneration: Int? = null,
    ) {
        if (expectedGeneration != null && expectedGeneration != loadGeneration) return
        itemObservation?.cancel()
        val categories = currentCategories()
        val profile = currentProfile()
        val displayName = profile?.displayName ?: currentDisplayName()
        val householdLists = lists.filter { it.householdId == householdId }
        val metrics = currentMetrics().takeIf { it.isNotEmpty() } ?: loadHouseholdMetrics(householdLists)
        mutableState.value = ShoppingListViewState.Data(
            content = ShoppingListUiState(
                title = "Sin listas",
                pending = emptyList(),
                checked = emptyList(),
                isOffline = repository.isOffline,
            ),
            households = households,
            lists = lists,
            selectedHouseholdId = householdId,
            selectedListId = null,
            listMetrics = metrics,
            productCategories = categories,
            profile = profile,
            displayName = displayName,
        )
    }

    private suspend fun publishNoHouseholds(expectedGeneration: Int? = null) {
        if (expectedGeneration != null && expectedGeneration != loadGeneration) return
        itemObservation?.cancel()
        val profile = currentProfile() ?: loadProfile()
        val displayName = profile?.displayName ?: currentDisplayName()
        mutableState.value = ShoppingListViewState.Data(
            content = ShoppingListUiState(
                title = "Sin hogar",
                pending = emptyList(),
                checked = emptyList(),
                isOffline = repository.isOffline,
            ),
            households = emptyList(),
            lists = emptyList(),
            selectedHouseholdId = null,
            selectedListId = null,
            listMetrics = emptyMap(),
            productCategories = currentCategories(),
            profile = profile,
            displayName = displayName,
        )
    }

    private suspend fun loadHouseholdMetrics(lists: List<ShoppingListSummaryUiModel>): Map<String, ShoppingListMetricsUiModel> {
        if (lists.isEmpty()) return emptyMap()
        return coroutineScope {
            lists.map { list ->
                async {
                    repository.refreshItems(list.id)
                    val items = repository.observeItems(list.id).first()
                    list.id to ShoppingListMetricsUiModel(
                        pendingCount = items.count { !it.checked },
                        checkedCount = items.count { it.checked },
                    )
                }
            }.awaitAll().toMap()
        }
    }

    private fun observeSelectedList(listId: String) {
        itemObservation?.cancel()
        if (!repository.continuouslyObservesItems) return
        itemObservation = viewModelScope.launch {
            repository.observeItems(listId).collect { items ->
                val current = mutableState.value as? ShoppingListViewState.Data ?: return@collect
                if (current.selectedListId != listId) return@collect
                val content = current.content.copy(
                    pending = items.filterNot { it.checked },
                    checked = items.filter { it.checked },
                    isOffline = repository.isOffline,
                )
                val metrics = current.listMetrics.withListMetrics(listId, items)
                if (content != current.content || metrics != current.listMetrics) {
                    mutableState.value = current.copy(content = content, listMetrics = metrics)
                }
            }
        }
    }

    private fun currentMetrics(): Map<String, ShoppingListMetricsUiModel> =
        (mutableState.value as? ShoppingListViewState.Data)?.listMetrics.orEmpty()

    private fun currentHouseholdId(): String? =
        (mutableState.value as? ShoppingListViewState.Data)?.selectedHouseholdId

    private fun currentCategories(): List<ProductCategoryUiModel> =
        (mutableState.value as? ShoppingListViewState.Data)?.productCategories.orEmpty()

    private fun currentDisplayName(): String? =
        (mutableState.value as? ShoppingListViewState.Data)?.displayName

    private fun currentProfile(): ProfileUiModel? =
        (mutableState.value as? ShoppingListViewState.Data)?.profile

    private suspend fun loadCategories(): List<ProductCategoryUiModel> =
        runCatching { repository.productCategories(currentHouseholdId()) }.getOrElse { emptyList() }

    private suspend fun refreshCategoriesAfterCatalogMutation() {
        val current = mutableState.value as? ShoppingListViewState.Data ?: return
        mutableState.value = current.copy(productCategories = loadCategories())
    }

    private suspend fun loadProfile(): ProfileUiModel? =
        runCatching { repository.profile() }.getOrNull()

    private fun publishTransientMessage(message: String) {
        val current = mutableState.value as? ShoppingListViewState.Data ?: return
        mutableState.value = current.copy(message = message)
    }

    private fun Map<String, ShoppingListMetricsUiModel>.withListMetrics(
        listId: String,
        items: List<ShoppingListItemUiModel>,
    ): Map<String, ShoppingListMetricsUiModel> =
        this + (listId to ShoppingListMetricsUiModel(
            pendingCount = items.count { !it.checked },
            checkedCount = items.count { it.checked },
        ))

    private fun ShoppingListViewState.Data.selectedList(): ShoppingListSummaryUiModel? =
        selectedListId?.let { id -> lists.firstOrNull { it.id == id } }

    private fun ShoppingListViewState.Data.item(id: String) =
        (content.pending + content.checked).first { it.id == id }

    private fun ShoppingListViewState.Data.withCurrent(current: ShoppingListItemUiModel): ShoppingListViewState.Data {
        val items = (content.pending + content.checked).map { item -> if (item.id == current.id) current else item }
        return copy(content = content.copy(pending = items.filterNot { it.checked }, checked = items.filter { it.checked }))
    }
}

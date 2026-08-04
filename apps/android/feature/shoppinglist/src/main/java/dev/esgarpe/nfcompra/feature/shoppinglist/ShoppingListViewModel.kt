package dev.esgarpe.nfcompra.feature.shoppinglist

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
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
                    is ShoppingListAction.CreateList -> createList(data, action.name)
                    is ShoppingListAction.RenameList -> renameList(data, action.name)
                    ShoppingListAction.DeleteSelectedList -> deleteSelectedList(data)
                    ShoppingListAction.DeleteCheckedItems -> deleteCheckedItems(data)
                    is ShoppingListAction.RetryInitialHouseholdLoad -> Unit
                    is ShoppingListAction.AddItem -> data.selectedListId?.let { mutateAfter(data) { repository.createItem(it, action.name) } }
                    is ShoppingListAction.EditItem -> mutateAfter(data) { repository.updateItem(data.item(action.id), name = action.name) }
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
                    if (generation == loadGeneration) mutableState.value = ShoppingListViewState.NoHouseholds
                    return@launch
                }
                val household = context?.let { requested -> households.firstOrNull { it.id == requested.householdId } }
                    ?: households.first()
                val lists = repository.lists(household.id)
                val list = context?.listId?.let { requested -> lists.firstOrNull { it.id == requested } }
                    ?: lists.firstOrNull()
                if (generation != loadGeneration) return@launch
                publishSelection(households, lists, household.id, list?.id, expectedGeneration = generation)
                if (pendingContext == context) pendingContext = null
            } catch (error: ShoppingListApiException) {
                if (generation == loadGeneration) mutableState.value = ShoppingListViewState.Error(error.message)
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

    private suspend fun createList(data: ShoppingListViewState.Data, name: String) {
        val list = repository.createList(data.selectedHouseholdId, name)
        publishSelection(data.households, data.lists + list, data.selectedHouseholdId, list.id)
    }

    private suspend fun renameList(data: ShoppingListViewState.Data, name: String) {
        val current = data.selectedList() ?: return
        val updated = repository.updateList(current, name)
        publishSelection(
            data.households,
            data.lists.map { if (it.id == updated.id) updated else it },
            data.selectedHouseholdId,
            updated.id,
        )
    }

    private suspend fun deleteSelectedList(data: ShoppingListViewState.Data) {
        val current = data.selectedList() ?: return
        repository.deleteList(current)
        val remaining = data.lists.filterNot { it.id == current.id }
        publishSelection(data.households, remaining, data.selectedHouseholdId, remaining.firstOrNull()?.id)
    }

    private suspend fun deleteCheckedItems(data: ShoppingListViewState.Data) {
        val listId = data.selectedListId ?: return
        repository.deleteCheckedItems(listId)
        publishSelection(data.households, data.lists, data.selectedHouseholdId, listId)
    }

    private suspend fun mutateAfter(data: ShoppingListViewState.Data, action: suspend () -> Unit) {
        val listId = data.selectedListId ?: return
        action()
        publishSelection(data.households, data.lists, data.selectedHouseholdId, listId, refreshFromServer = false)
    }

    private suspend fun mutateItem(data: ShoppingListViewState.Data, itemId: String, action: suspend (ShoppingListItemUiModel) -> Unit) {
        val listId = data.selectedListId ?: return
        action(data.item(itemId))
        publishSelection(data.households, data.lists, data.selectedHouseholdId, listId, refreshFromServer = false)
    }

    private suspend fun refresh(data: ShoppingListViewState.Data, listId: String) {
        publishSelection(data.households, data.lists, data.selectedHouseholdId, listId)
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
        )
        observeSelectedList(listId)
    }

    private fun publishNoList(
        households: List<HouseholdUiModel>,
        lists: List<ShoppingListSummaryUiModel>,
        householdId: String,
        expectedGeneration: Int? = null,
    ) {
        if (expectedGeneration != null && expectedGeneration != loadGeneration) return
        itemObservation?.cancel()
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
        )
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
                if (content != current.content) mutableState.value = current.copy(content = content)
            }
        }
    }

    private fun ShoppingListViewState.Data.selectedList(): ShoppingListSummaryUiModel? =
        selectedListId?.let { id -> lists.firstOrNull { it.id == id } }

    private fun ShoppingListViewState.Data.item(id: String) =
        (content.pending + content.checked).first { it.id == id }

    private fun ShoppingListViewState.Data.withCurrent(current: ShoppingListItemUiModel): ShoppingListViewState.Data {
        val items = (content.pending + content.checked).map { item -> if (item.id == current.id) current else item }
        return copy(content = content.copy(pending = items.filterNot { it.checked }, checked = items.filter { it.checked }))
    }
}

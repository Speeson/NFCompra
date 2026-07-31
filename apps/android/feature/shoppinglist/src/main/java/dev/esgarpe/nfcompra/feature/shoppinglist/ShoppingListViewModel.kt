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
                if (action is ShoppingListAction.RetryInitialHouseholdLoad) loadCreatedInitialHousehold(action.household, action.list)
                return@launch
            }
            val data = current as? ShoppingListViewState.Data ?: return@launch
            try {
                when (action) {
                    is ShoppingListAction.SelectHousehold -> selectHousehold(data, action.id)
                    is ShoppingListAction.SelectList -> refresh(data, action.id)
                    is ShoppingListAction.CreateHousehold -> createHousehold(data, action.name)
                    is ShoppingListAction.CreateList -> createList(data, action.name)
                    is ShoppingListAction.RetryInitialHouseholdLoad -> Unit
                    is ShoppingListAction.AddItem -> mutateAfter(data) { repository.createItem(data.selectedListId, action.name) }
                    is ShoppingListAction.EditItem -> mutateAfter(data) { repository.updateItem(data.item(action.id), name = action.name) }
                    is ShoppingListAction.ToggleItem -> mutateItem(data, action.id) { repository.updateItem(it, checked = !it.checked) }
                    is ShoppingListAction.DeleteItem -> mutateAfter(data) { repository.deleteItem(data.item(action.id)) }
                    is ResolveConflict.UseServer -> repository.resolveConflict(action)
                    is ResolveConflict.RetryLocal -> repository.resolveConflict(action)
                    ShoppingListAction.RetryConflict -> data.retryAction?.let(::onAction)
                }
            } catch (error: ShoppingListApiException) {
                val current = error.current
                val conflicted = current?.let { data.withCurrent(it) } ?: data
                mutableState.value = conflicted.copy(message = error.message, conflict = current, retryAction = action)
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
                publish(
                    cached.households,
                    cached.lists,
                    cached.household.id,
                    cached.list.id,
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
                ?: lists.firstOrNull() ?: throw IllegalStateException("El hogar no tiene listas.")
            repository.refreshItems(list.id)
            val items = repository.observeItems(list.id).first()
            if (generation != loadGeneration) return@launch
            mutableState.value = ShoppingListViewState.Data(
                content = ShoppingListUiState(
                    list.name,
                    items.filterNot { it.checked },
                    items.filter { it.checked },
                    repository.isOffline,
                ),
                households = households,
                lists = lists,
                selectedHouseholdId = household.id,
                selectedListId = list.id,
            )
            observeSelectedList(list.id)
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
        val list: ShoppingListSummaryUiModel,
    )

    private suspend fun cachedSelection(context: ShoppingContext?): CachedSelection? {
        val households = repository.cachedHouseholds() ?: return null
        val household = context?.let { requested -> households.firstOrNull { it.id == requested.householdId } }
            ?: households.firstOrNull() ?: return null
        val lists = repository.cachedLists(household.id) ?: return null
        val list = context?.listId?.let { requested -> lists.firstOrNull { it.id == requested } }
            ?: lists.firstOrNull() ?: return null
        return CachedSelection(households, lists, household, list)
    }

    private suspend fun selectHousehold(data: ShoppingListViewState.Data, householdId: String) {
        val lists = repository.lists(householdId)
        val list = lists.firstOrNull() ?: throw IllegalStateException("El hogar no tiene listas.")
        publish(data.households, lists, householdId, list.id)
    }

    private suspend fun createHousehold(data: ShoppingListViewState.Data, name: String) {
        val (household, list) = repository.createHousehold(name)
        publish(data.households + household, listOf(list), household.id, list.id)
    }

    private suspend fun createInitialHousehold(name: String) {
        val created = try {
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
        loadCreatedInitialHousehold(created.first, created.second)
    }

    private suspend fun loadCreatedInitialHousehold(household: HouseholdUiModel, list: ShoppingListSummaryUiModel) {
        try {
            publish(listOf(household), listOf(list), household.id, list.id)
        } catch (error: ShoppingListApiException) {
            mutableState.value = ShoppingListViewState.InitialHouseholdLoadError(
                message = error.message,
                retryAction = ShoppingListAction.RetryInitialHouseholdLoad(household, list),
            )
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            mutableState.value = ShoppingListViewState.InitialHouseholdLoadError(
                message = "No se pudo conectar con el servidor.",
                retryAction = ShoppingListAction.RetryInitialHouseholdLoad(household, list),
            )
        }
    }

    private suspend fun createList(data: ShoppingListViewState.Data, name: String) {
        val list = repository.createList(data.selectedHouseholdId, name)
        publish(data.households, data.lists + list, data.selectedHouseholdId, list.id)
    }

    private suspend fun mutateAfter(data: ShoppingListViewState.Data, action: suspend () -> Unit) {
        action()
        publish(data.households, data.lists, data.selectedHouseholdId, data.selectedListId, refreshFromServer = false)
    }

    private suspend fun mutateItem(data: ShoppingListViewState.Data, itemId: String, action: suspend (ShoppingListItemUiModel) -> Unit) {
        action(data.item(itemId))
        publish(data.households, data.lists, data.selectedHouseholdId, data.selectedListId, refreshFromServer = false)
    }

    private suspend fun refresh(data: ShoppingListViewState.Data, listId: String) {
        publish(data.households, data.lists, data.selectedHouseholdId, listId)
    }

    private suspend fun publish(
        households: List<HouseholdUiModel>,
        lists: List<ShoppingListSummaryUiModel>,
        householdId: String,
        listId: String,
        refreshFromServer: Boolean = true,
        expectedGeneration: Int? = null,
    ) {
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

    private fun ShoppingListViewState.Data.item(id: String) =
        (content.pending + content.checked).first { it.id == id }

    private fun ShoppingListViewState.Data.withCurrent(current: ShoppingListItemUiModel): ShoppingListViewState.Data {
        val items = (content.pending + content.checked).map { item -> if (item.id == current.id) current else item }
        return copy(content = content.copy(pending = items.filterNot { it.checked }, checked = items.filter { it.checked }))
    }
}

package dev.esgarpe.nfcompra.feature.shoppinglist

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

class ShoppingListViewModel(private val repository: ShoppingListRepository) : ViewModel() {
    private val mutableState = MutableStateFlow<ShoppingListViewState>(ShoppingListViewState.Loading)
    val state: StateFlow<ShoppingListViewState> = mutableState.asStateFlow()
    private var pendingContext: ShoppingContext? = null
    private var loadGeneration = 0

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
                    ShoppingListAction.RetryConflict -> data.retryAction?.let(::onAction)
                }
            } catch (error: ShoppingListApiException) {
                val current = error.current
                val conflicted = current?.let { data.withCurrent(it) } ?: data
                mutableState.value = conflicted.copy(message = error.message, conflict = current, retryAction = action)
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

    private fun loadForCurrentIntent() {
        val generation = ++loadGeneration
        val context = pendingContext
        viewModelScope.launch {
        try {
            val households = repository.households()
            if (households.isEmpty()) {
                mutableState.value = ShoppingListViewState.NoHouseholds
                return@launch
            }
            val household = context?.let { requested -> households.firstOrNull { it.id == requested.householdId } }
                ?: households.first()
            val lists = repository.lists(household.id)
            val list = context?.listId?.let { requested -> lists.firstOrNull { it.id == requested } }
                ?: lists.firstOrNull() ?: throw IllegalStateException("El hogar no tiene listas.")
            val items = repository.observeItems(list.id).first()
            if (generation != loadGeneration) return@launch
            mutableState.value = ShoppingListViewState.Data(
                content = ShoppingListUiState(list.name, items.filterNot { it.checked }, items.filter { it.checked }, false),
                households = households,
                lists = lists,
                selectedHouseholdId = household.id,
                selectedListId = list.id,
            )
            if (pendingContext == context) pendingContext = null
        } catch (error: ShoppingListApiException) {
            if (generation == loadGeneration) mutableState.value = ShoppingListViewState.Error(error.message)
        } catch (_: Exception) {
            if (generation == loadGeneration) mutableState.value = ShoppingListViewState.Error("No se pudo conectar con el servidor.")
        }
        }
    }

    private data class ShoppingContext(val householdId: String, val listId: String?)

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
        publish(data.households, data.lists, data.selectedHouseholdId, data.selectedListId)
    }

    private suspend fun mutateItem(data: ShoppingListViewState.Data, itemId: String, action: suspend (ShoppingListItemUiModel) -> Unit) {
        action(data.item(itemId))
        publish(data.households, data.lists, data.selectedHouseholdId, data.selectedListId)
    }

    private suspend fun refresh(data: ShoppingListViewState.Data, listId: String) {
        publish(data.households, data.lists, data.selectedHouseholdId, listId)
    }

    private suspend fun publish(households: List<HouseholdUiModel>, lists: List<ShoppingListSummaryUiModel>, householdId: String, listId: String) {
        val items = repository.observeItems(listId).first()
        val selected = lists.first { it.id == listId }
        mutableState.value = ShoppingListViewState.Data(
            content = ShoppingListUiState(
                title = selected.name,
                pending = items.filterNot { it.checked },
                checked = items.filter { it.checked },
                isOffline = false,
            ),
            households = households,
            lists = lists,
            selectedHouseholdId = householdId,
            selectedListId = listId,
        )
    }

    private fun ShoppingListViewState.Data.item(id: String) =
        (content.pending + content.checked).first { it.id == id }

    private fun ShoppingListViewState.Data.withCurrent(current: ShoppingListItemUiModel): ShoppingListViewState.Data {
        val items = (content.pending + content.checked).map { item -> if (item.id == current.id) current else item }
        return copy(content = content.copy(pending = items.filterNot { it.checked }, checked = items.filter { it.checked }))
    }
}

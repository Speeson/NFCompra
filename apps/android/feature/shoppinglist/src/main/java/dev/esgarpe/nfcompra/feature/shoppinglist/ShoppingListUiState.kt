package dev.esgarpe.nfcompra.feature.shoppinglist

data class ShoppingListItemUiModel(
    val id: String,
    val name: String,
    val quantity: String,
    val checked: Boolean,
    val version: Int = 1,
    val pendingState: String? = null,
    val serverItemJson: String? = null,
    val pendingOperationId: String? = null,
    val pendingOperationType: String? = null,
    val pendingExpectedVersion: Int? = null,
    val pendingIsChecked: Boolean? = null,
    val serverItemName: String? = null,
    val serverItemVersion: Int? = null,
    val serverItemIsChecked: Boolean? = null,
)

data class ShoppingListUiState(
    val title: String,
    val pending: List<ShoppingListItemUiModel>,
    val checked: List<ShoppingListItemUiModel>,
    val isOffline: Boolean,
)

sealed interface ShoppingListAction {
    data class ToggleItem(val id: String) : ShoppingListAction
    data class AddItem(val name: String) : ShoppingListAction
    data class EditItem(val id: String, val name: String) : ShoppingListAction
    data class DeleteItem(val id: String) : ShoppingListAction
    data class SelectHousehold(val id: String) : ShoppingListAction
    data class SelectList(val id: String) : ShoppingListAction
    data class CreateHousehold(val name: String) : ShoppingListAction
    data class CreateList(val name: String) : ShoppingListAction
    data class RenameList(val name: String) : ShoppingListAction
    data object DeleteSelectedList : ShoppingListAction
    data object DeleteCheckedItems : ShoppingListAction
    data class RetryInitialHouseholdLoad(
        val household: HouseholdUiModel,
    ) : ShoppingListAction
    data object RetryConflict : ShoppingListAction
}

sealed interface ShoppingListViewState {
    data object Loading : ShoppingListViewState
    data object NoHouseholds : ShoppingListViewState
    data class InitialHouseholdError(
        val message: String,
        val retryAction: ShoppingListAction.CreateHousehold,
    ) : ShoppingListViewState
    data class InitialHouseholdLoadError(
        val message: String,
        val retryAction: ShoppingListAction.RetryInitialHouseholdLoad,
    ) : ShoppingListViewState
    data class Error(val message: String) : ShoppingListViewState
    data class Data(
        val content: ShoppingListUiState,
        val households: List<HouseholdUiModel>,
        val lists: List<ShoppingListSummaryUiModel>,
        val selectedHouseholdId: String,
        val selectedListId: String?,
        val message: String? = null,
        val conflict: ShoppingListItemUiModel? = null,
        val retryAction: ShoppingListAction? = null,
    ) : ShoppingListViewState
}

fun demoShoppingListUiState(isOffline: Boolean = false) = ShoppingListUiState(
    title = "Compra semanal",
    pending = listOf(ShoppingListItemUiModel("milk", "Leche", "1 litro", checked = false)),
    checked = listOf(ShoppingListItemUiModel("bread", "Pan integral", "1 unidad", checked = true)),
    isOffline = isOffline,
)

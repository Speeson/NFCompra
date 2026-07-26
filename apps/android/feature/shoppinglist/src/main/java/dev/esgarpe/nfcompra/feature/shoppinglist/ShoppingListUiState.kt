package dev.esgarpe.nfcompra.feature.shoppinglist

data class ShoppingListItemUiModel(
    val id: String,
    val name: String,
    val quantity: String,
    val checked: Boolean,
)

data class ShoppingListUiState(
    val title: String,
    val pending: List<ShoppingListItemUiModel>,
    val checked: List<ShoppingListItemUiModel>,
    val isOffline: Boolean,
)

sealed interface ShoppingListAction {
    data class ToggleItem(val id: String) : ShoppingListAction
    data object AddItem : ShoppingListAction
    data object SelectList : ShoppingListAction
}

fun demoShoppingListUiState(isOffline: Boolean = false) = ShoppingListUiState(
    title = "Compra semanal",
    pending = listOf(ShoppingListItemUiModel("milk", "Leche", "1 litro", checked = false)),
    checked = listOf(ShoppingListItemUiModel("bread", "Pan integral", "1 unidad", checked = true)),
    isOffline = isOffline,
)

package dev.esgarpe.nfcompra.feature.shoppinglist

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberTopAppBarState
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import dev.esgarpe.nfcompra.core.designsystem.NFCompraTheme

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShoppingListScreen(
    state: ShoppingListUiState,
    onAction: (ShoppingListAction) -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(state.title) },
                actions = {
                    TextButton(
                        modifier = Modifier.semantics { contentDescription = "Seleccionar lista" },
                        onClick = { onAction(ShoppingListAction.SelectList) },
                    ) { Text("Listas") }
                },
                scrollBehavior = TopAppBarDefaults.pinnedScrollBehavior(rememberTopAppBarState()),
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                modifier = Modifier.semantics { contentDescription = "Añadir producto" },
                onClick = { onAction(ShoppingListAction.AddItem) },
            ) { Text("+") }
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (state.isOffline) {
                item { Text("Sin conexión", color = MaterialTheme.colorScheme.error) }
            }
            item { Text("Pendientes", style = MaterialTheme.typography.titleMedium) }
            if (state.pending.isEmpty()) item { EmptyState("No hay productos pendientes") }
            items(state.pending, key = { it.id }) { item -> ShoppingItem(item, onAction) }
            item { Text("Comprados", style = MaterialTheme.typography.titleMedium) }
            if (state.checked.isEmpty()) item { EmptyState("Aún no has comprado nada") }
            items(state.checked, key = { it.id }) { item -> ShoppingItem(item, onAction) }
        }
    }
}

@Composable
private fun ShoppingItem(item: ShoppingListItemUiModel, onAction: (ShoppingListAction) -> Unit) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Column {
            Text(item.name)
            Text(item.quantity, style = MaterialTheme.typography.bodySmall)
        }
        Checkbox(
            checked = item.checked,
            modifier = Modifier.semantics { contentDescription = "Marcar ${item.name}" },
            onCheckedChange = { onAction(ShoppingListAction.ToggleItem(item.id)) },
        )
    }
}

@Composable
private fun EmptyState(message: String) {
    Text(message, style = MaterialTheme.typography.bodyMedium)
}

private val EmptyListState = ShoppingListUiState("Compra semanal", emptyList(), emptyList(), false)
private val LoadingState = EmptyListState.copy(title = "Cargando lista…")
private val ErrorState = EmptyListState.copy(title = "No se pudo cargar la lista")

@Preview(name = "Lista con datos")
@Composable
private fun ShoppingListDataPreview() = NFCompraTheme { ShoppingListScreen(demoShoppingListUiState(), {}) }

@Preview(name = "Tema oscuro")
@Composable
private fun ShoppingListDarkPreview() = NFCompraTheme(darkTheme = true) { ShoppingListScreen(demoShoppingListUiState(), {}) }

@Preview(name = "Lista vacía")
@Composable
private fun ShoppingListEmptyPreview() = NFCompraTheme { ShoppingListScreen(EmptyListState, {}) }

@Preview(name = "Cargando simulado")
@Composable
private fun ShoppingListLoadingPreview() = NFCompraTheme { ShoppingListScreen(LoadingState, {}) }

@Preview(name = "Error simulado")
@Composable
private fun ShoppingListErrorPreview() = NFCompraTheme { ShoppingListScreen(ErrorState, {}) }

@Preview(name = "Fuente aumentada", fontScale = 1.5f)
@Composable
private fun ShoppingListLargeTextPreview() = NFCompraTheme { ShoppingListScreen(demoShoppingListUiState(), {}) }

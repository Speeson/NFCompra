package dev.esgarpe.nfcompra.feature.shoppinglist

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberTopAppBarState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import dev.esgarpe.nfcompra.core.designsystem.NFCompraTheme

@Composable
fun ShoppingListApp(viewModel: ShoppingListViewModel, onLogout: () -> Unit = {}) {
    val state by viewModel.state.collectAsState()
    LaunchedEffect(viewModel) { viewModel.load() }
    when (state) {
        ShoppingListViewState.Loading -> Text("Cargando lista…")
        ShoppingListViewState.NoHouseholds -> FirstHouseholdSetup(
            onCreate = { viewModel.onAction(ShoppingListAction.CreateHousehold(it)) },
            onLogout = onLogout,
        )
        is ShoppingListViewState.Error -> Text((state as ShoppingListViewState.Error).message, color = MaterialTheme.colorScheme.error)
        is ShoppingListViewState.Data -> {
            val data = state as ShoppingListViewState.Data
            var creatingHousehold by remember { mutableStateOf(false) }
            var creatingList by remember { mutableStateOf(false) }
            Column(modifier = Modifier.fillMaxSize()) {
                Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = onLogout) { Text("Cerrar sesión") }
                }
                Selector("Hogar", data.households.map { it.id to it.name }, data.selectedHouseholdId, { creatingHousehold = true }) {
                    viewModel.onAction(ShoppingListAction.SelectHousehold(it))
                }
                Selector("Lista", data.lists.map { it.id to it.name }, data.selectedListId, { creatingList = true }) {
                    viewModel.onAction(ShoppingListAction.SelectList(it))
                }
                data.message?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(horizontal = 20.dp)) }
                data.conflict?.let { current ->
                    Row(modifier = Modifier.padding(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("El producto ha cambiado: ${current.name}")
                        TextButton(onClick = { viewModel.onAction(ShoppingListAction.RetryConflict) }) { Text("Reintentar") }
                    }
                }
                ShoppingListScreen(data.content, viewModel::onAction)
            }
            if (creatingHousehold) CreateEntityDialog("Crear hogar", "Nombre del hogar", {
                viewModel.onAction(ShoppingListAction.CreateHousehold(it))
                creatingHousehold = false
            }) { creatingHousehold = false }
            if (creatingList) CreateEntityDialog("Crear lista", "Nombre de la lista", {
                viewModel.onAction(ShoppingListAction.CreateList(it))
                creatingList = false
            }) { creatingList = false }
        }
    }
}

@Composable
private fun Selector(
    label: String,
    options: List<Pair<String, String>>,
    selected: String,
    onCreate: () -> Unit,
    onSelect: (String) -> Unit,
) {
    Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("$label:")
        options.forEach { (id, name) ->
            if (id == selected) Button(onClick = {}) { Text(name) }
            else TextButton(onClick = { onSelect(id) }) { Text(name) }
        }
        TextButton(onClick = onCreate) { Text("Crear ${label.lowercase()}") }
    }
}

@Composable
private fun FirstHouseholdSetup(onCreate: (String) -> Unit, onLogout: () -> Unit) {
    var name by remember { mutableStateOf("") }
    Column(modifier = Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        TextButton(onClick = onLogout) { Text("Cerrar sesión") }
        Text("Crea tu hogar", style = MaterialTheme.typography.headlineSmall)
        Text("Necesitas un hogar para organizar tus listas.")
        OutlinedTextField(
            value = name,
            onValueChange = { name = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Nombre del hogar") },
        )
        Button(onClick = { onCreate(name.trim()) }, enabled = name.isNotBlank()) { Text("Crear hogar") }
    }
}

@Composable
private fun CreateEntityDialog(title: String, label: String, onConfirm: (String) -> Unit, onDismiss: () -> Unit) {
    var name by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { OutlinedTextField(name, { name = it }, label = { Text(label) }) },
        confirmButton = {
            TextButton(onClick = { if (name.isNotBlank()) onConfirm(name.trim()) }, enabled = name.isNotBlank()) {
                Text("Crear")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShoppingListScreen(state: ShoppingListUiState, onAction: (ShoppingListAction) -> Unit) {
    var addName by remember { mutableStateOf("") }
    var adding by remember { mutableStateOf(false) }
    Scaffold(
        topBar = { TopAppBar(title = { Text(state.title) }, scrollBehavior = TopAppBarDefaults.pinnedScrollBehavior(rememberTopAppBarState())) },
        floatingActionButton = { FloatingActionButton(modifier = Modifier.semantics { contentDescription = "AÃ±adir producto" }, onClick = { adding = true }) { Text("+") } },
    ) { padding ->
        LazyColumn(modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (state.isOffline) item { Text("Sin conexiÃ³n", color = MaterialTheme.colorScheme.error) }
            item { Text("Pendientes", style = MaterialTheme.typography.titleMedium) }
            if (state.pending.isEmpty()) item { EmptyState("No hay productos pendientes") }
            items(state.pending, key = { it.id }) { item -> ShoppingItem(item, onAction) }
            item { Text("Comprados", style = MaterialTheme.typography.titleMedium) }
            if (state.checked.isEmpty()) item { EmptyState("AÃºn no has comprado nada") }
            items(state.checked, key = { it.id }) { item -> ShoppingItem(item, onAction) }
        }
    }
    if (adding) ItemNameDialog("AÃ±adir producto", addName, { addName = it }, {
        if (addName.isNotBlank()) onAction(ShoppingListAction.AddItem(addName.trim()))
        addName = ""; adding = false
    }) { adding = false }
}

@Composable
private fun ShoppingItem(item: ShoppingListItemUiModel, onAction: (ShoppingListAction) -> Unit) {
    var editing by remember { mutableStateOf(false) }
    var editedName by remember(item.id) { mutableStateOf(item.name) }
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Column { Text(item.name); Text(item.quantity, style = MaterialTheme.typography.bodySmall) }
        Checkbox(checked = item.checked, modifier = Modifier.semantics { contentDescription = "Marcar ${item.name}" }, onCheckedChange = { onAction(ShoppingListAction.ToggleItem(item.id)) })
    }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        TextButton(onClick = { editing = true }) { Text("Editar") }
        TextButton(onClick = { onAction(ShoppingListAction.DeleteItem(item.id)) }) { Text("Borrar") }
    }
    if (editing) ItemNameDialog("Editar producto", editedName, { editedName = it }, {
        if (editedName.isNotBlank()) onAction(ShoppingListAction.EditItem(item.id, editedName.trim()))
        editing = false
    }) { editing = false }
}

@Composable
private fun ItemNameDialog(title: String, value: String, onValueChange: (String) -> Unit, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(onDismissRequest = onDismiss, title = { Text(title) }, text = { OutlinedTextField(value, onValueChange, label = { Text("Nombre") }) }, confirmButton = { TextButton(onClick = onConfirm) { Text("Guardar") } }, dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } })
}

@Composable private fun EmptyState(message: String) = Text(message, style = MaterialTheme.typography.bodyMedium)

private val EmptyListState = ShoppingListUiState("Compra semanal", emptyList(), emptyList(), false)
@Preview @Composable private fun ShoppingListPreview() = NFCompraTheme { ShoppingListScreen(EmptyListState, {}) }

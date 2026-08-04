package dev.esgarpe.nfcompra.feature.shoppinglist

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Category
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.HomeWork
import androidx.compose.material.icons.outlined.ListAlt
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.IconButton
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.esgarpe.nfcompra.core.designsystem.NFCompraTheme

@Composable
fun ShoppingListApp(viewModel: ShoppingListViewModel, onLogout: () -> Unit = {}, onMembers: (String) -> Unit = {}) {
    val state by viewModel.state.collectAsState()
    LaunchedEffect(viewModel) { viewModel.load() }
    when (state) {
        ShoppingListViewState.Loading -> Text("Cargando lista...")
        ShoppingListViewState.NoHouseholds -> FirstHouseholdSetup(
            initialName = "",
            errorMessage = null,
            onCreate = { viewModel.onAction(ShoppingListAction.CreateHousehold(it)) },
            onLogout = onLogout,
        )
        is ShoppingListViewState.InitialHouseholdError -> {
            val error = state as ShoppingListViewState.InitialHouseholdError
            FirstHouseholdSetup(
                initialName = error.retryAction.name,
                errorMessage = error.message,
                onCreate = { viewModel.onAction(ShoppingListAction.CreateHousehold(it)) },
                onLogout = onLogout,
            )
        }
        is ShoppingListViewState.InitialHouseholdLoadError -> {
            val error = state as ShoppingListViewState.InitialHouseholdLoadError
            InitialHouseholdLoadRecovery(
                errorMessage = error.message,
                onRetry = { viewModel.onAction(error.retryAction) },
                onLogout = onLogout,
            )
        }
        is ShoppingListViewState.Error -> Text((state as ShoppingListViewState.Error).message, color = MaterialTheme.colorScheme.error)
        is ShoppingListViewState.Data -> ShoppingListContent(state as ShoppingListViewState.Data, viewModel::onAction, onLogout, onMembers)
    }
}

@Composable
internal fun ShoppingListContent(
    data: ShoppingListViewState.Data,
    onAction: (ShoppingListAction) -> Unit,
    onLogout: () -> Unit,
    onMembers: (String) -> Unit,
) {
    var selectedTab by remember { mutableStateOf(DashboardTab.Home) }
    var creatingHousehold by remember { mutableStateOf(false) }
    var creatingList by remember { mutableStateOf(false) }
    var renamingList by remember { mutableStateOf(false) }
    var deletingList by remember { mutableStateOf(false) }
    var notificationsOpen by remember { mutableStateOf(false) }

    Scaffold(
        bottomBar = {
            FloatingDashboardNavigation(
                selected = selectedTab,
                onSelect = { selectedTab = it },
            )
        },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding).padding(bottom = 16.dp)) {
            ShoppingAppBanner(
                title = selectedTab.label,
                showBack = selectedTab != DashboardTab.Home,
                onBack = { selectedTab = DashboardTab.Home },
                expanded = notificationsOpen,
                onExpandedChange = { notificationsOpen = it },
            )

            data.message?.let {
                Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(horizontal = 20.dp))
            }
            data.conflict?.let { current ->
                Row(modifier = Modifier.padding(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("El producto ha cambiado: ${current.name}")
                    TextButton(onClick = { onAction(ShoppingListAction.RetryConflict) }) { Text("Reintentar") }
                }
            }

            when (selectedTab) {
                DashboardTab.Home -> DashboardHome(data, onAction, { creatingHousehold = true }, { creatingList = true })
                DashboardTab.Households -> HouseholdsPanel(data, onAction, { creatingHousehold = true })
                DashboardTab.Lists -> ListsPanel(data, onAction, { creatingList = true })
                DashboardTab.Catalog -> CatalogPanel()
                DashboardTab.Profile -> ProfilePanel(onLogout)
            }

            if (data.selectedListId != null && selectedTab != DashboardTab.Catalog && selectedTab != DashboardTab.Profile) {
                CurrentListActions(
                    onRename = { renamingList = true },
                    onClearChecked = { onAction(ShoppingListAction.DeleteCheckedItems) },
                    onDelete = { deletingList = true },
                )
                ShoppingListScreen(data.content, onAction)
            }
        }
    }

    if (creatingHousehold) CreateEntityDialog("Crear hogar", "Nombre del hogar", {
        onAction(ShoppingListAction.CreateHousehold(it))
        creatingHousehold = false
    }) { creatingHousehold = false }
    if (creatingList) CreateEntityDialog("Crear lista", "Nombre de la lista", {
        onAction(ShoppingListAction.CreateList(it))
        creatingList = false
    }) { creatingList = false }
    if (renamingList) CreateEntityDialog("Renombrar lista", "Nuevo nombre de la lista", {
        onAction(ShoppingListAction.RenameList(it))
        renamingList = false
    }) { renamingList = false }
    if (deletingList) ConfirmDialog("Eliminar lista", "Se eliminará esta lista y sus productos.", {
        onAction(ShoppingListAction.DeleteSelectedList)
        deletingList = false
    }) { deletingList = false }
}

private enum class DashboardTab(val label: String, val navLabel: String, val icon: ImageVector) {
    Home("Inicio", "Inicio", Icons.Outlined.Home),
    Households("Hogares", "Hogares", Icons.Outlined.HomeWork),
    Lists("Listas", "Listas", Icons.Outlined.ListAlt),
    Catalog("Catálogo", "Catálogo", Icons.Outlined.Category),
    Profile("Perfil", "Perfil", Icons.Outlined.Person),
}

@Composable
private fun ShoppingAppBanner(
    title: String,
    showBack: Boolean,
    onBack: () -> Unit,
    expanded: Boolean,
    onExpandedChange: (Boolean) -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(104.dp)
            .background(
                Brush.linearGradient(
                    colors = listOf(
                        Color(0xFFAEDC81),
                        Color(0xFF6CC51D),
                    ),
                ),
            )
            .padding(horizontal = 20.dp),
        contentAlignment = Alignment.Center,
    ) {
        if (showBack) {
            IconButton(
                onClick = onBack,
                modifier = Modifier
                    .align(Alignment.CenterStart)
                    .size(48.dp)
                    .semantics { contentDescription = "Volver" },
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Outlined.ArrowBack,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(24.dp),
                )
            }
        }

        Text(
            text = title,
            color = Color.White,
            fontSize = 18.sp,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Center,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier
                .align(Alignment.Center)
                .padding(horizontal = 72.dp),
        )

        Box(modifier = Modifier.align(Alignment.CenterEnd)) {
            IconButton(
                onClick = { onExpandedChange(true) },
                modifier = Modifier
                    .size(48.dp)
                    .semantics { contentDescription = "Abrir notificaciones" },
            ) {
                Icon(
                    imageVector = Icons.Outlined.Notifications,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(24.dp),
                )
            }
            DropdownMenu(
                expanded = expanded,
                onDismissRequest = { onExpandedChange(false) },
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Notificaciones", style = MaterialTheme.typography.titleMedium)
                    Text("No hay notificaciones nuevas", style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
}

@Composable
private fun FloatingDashboardNavigation(selected: DashboardTab, onSelect: (DashboardTab) -> Unit) {
    val navItems = DashboardTab.entries
    val selectedIndex = navItems.indexOf(selected).coerceAtLeast(0)

    BoxWithConstraints(
        modifier = Modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .height(112.dp)
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .semantics { contentDescription = "Menú inferior principal" },
    ) {
        val itemWidth = maxWidth / navItems.size
        val bubbleSize = 64.dp
        val activeX by animateDpAsState(
            targetValue = itemWidth * selectedIndex + (itemWidth - bubbleSize) / 2,
            animationSpec = tween(durationMillis = 260),
            label = "floating-nav-active-x",
        )
        val navSurface = MaterialTheme.colorScheme.surface
        val inactiveColor = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.72f)
        val activeColor = MaterialTheme.colorScheme.onSurface

        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .height(68.dp)
                .shadow(18.dp, shape = MaterialTheme.shapes.extraLarge, clip = false)
                .clip(MaterialTheme.shapes.extraLarge)
                .background(navSurface),
        )

        Row(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .height(68.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            navItems.forEach { tab ->
                FloatingDashboardNavigationItem(
                    tab = tab,
                    selected = tab == selected,
                    onClick = { onSelect(tab) },
                    activeColor = activeColor,
                    inactiveColor = inactiveColor,
                    modifier = Modifier.weight(1f),
                )
            }
        }

        Box(
            modifier = Modifier
                .offset(x = activeX, y = 0.dp)
                .size(bubbleSize)
                .shadow(14.dp, shape = androidx.compose.foundation.shape.CircleShape, clip = false)
                .clip(androidx.compose.foundation.shape.CircleShape)
                .background(navSurface)
                .clickable { onSelect(selected) }
                .semantics { contentDescription = "${selected.label} seleccionado" },
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = selected.icon,
                contentDescription = null,
                tint = activeColor,
                modifier = Modifier.size(25.dp),
            )
        }
    }
}

@Composable
private fun FloatingDashboardNavigationItem(
    tab: DashboardTab,
    selected: Boolean,
    onClick: () -> Unit,
    activeColor: androidx.compose.ui.graphics.Color,
    inactiveColor: androidx.compose.ui.graphics.Color,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .height(68.dp)
            .clickable(onClick = onClick)
            .padding(top = 9.dp, bottom = 9.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.SpaceBetween,
    ) {
        Box(
            modifier = Modifier
                .size(26.dp),
            contentAlignment = Alignment.Center,
        ) {
            if (!selected) {
                Icon(
                    imageVector = tab.icon,
                    contentDescription = null,
                    tint = inactiveColor,
                    modifier = Modifier.size(22.dp),
                )
            }
        }
        Text(
            text = tab.navLabel,
            color = if (selected) activeColor else inactiveColor,
            fontSize = 11.sp,
            lineHeight = 12.sp,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Clip,
            softWrap = false,
        )
    }
}

@Composable
private fun DashboardHome(
    data: ShoppingListViewState.Data,
    onAction: (ShoppingListAction) -> Unit,
    onCreateHousehold: () -> Unit,
    onCreateList: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Inicio", style = MaterialTheme.typography.headlineSmall)
        Text("Resumen rápido de tus hogares y listas activas.")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = onCreateHousehold) { Text("Nuevo hogar") }
            Button(onClick = onCreateList) { Text("Crear lista") }
        }
        SummaryCard("Hogares", data.households.size.toString(), if (data.households.size == 1) "hogar activo" else "hogares activos")
        SummaryCard("Listas", data.lists.size.toString(), if (data.lists.size == 1) "lista activa" else "listas activas")
        Text("Tus hogares", style = MaterialTheme.typography.titleMedium)
        data.households.take(3).forEach { household ->
            HouseholdCard(household, data.lists.count { it.householdId == household.id }, household.id == data.selectedHouseholdId) {
                onAction(ShoppingListAction.SelectHousehold(household.id))
            }
        }
        Text("Listas recientes", style = MaterialTheme.typography.titleMedium)
        if (data.lists.isEmpty()) EmptyListForHousehold(onCreateList)
        data.lists.take(3).forEach { list ->
            ShoppingListSummaryCard(list, data.households.firstOrNull { it.id == list.householdId }?.name.orEmpty(), list.id == data.selectedListId) {
                onAction(ShoppingListAction.SelectList(list.id))
            }
        }
    }
}

@Composable
private fun HouseholdsPanel(data: ShoppingListViewState.Data, onAction: (ShoppingListAction) -> Unit, onCreateHousehold: () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Column {
                Text("Tus hogares", style = MaterialTheme.typography.headlineSmall)
                Text("Organiza tus listas por casa, familia o supermercado.")
            }
            Button(onClick = onCreateHousehold) { Text("Nuevo hogar") }
        }
        data.households.forEach { household ->
            HouseholdCard(household, data.lists.count { it.householdId == household.id }, household.id == data.selectedHouseholdId) {
                onAction(ShoppingListAction.SelectHousehold(household.id))
            }
        }
    }
}

@Composable
private fun ListsPanel(data: ShoppingListViewState.Data, onAction: (ShoppingListAction) -> Unit, onCreateList: () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Column {
                Text("Listas activas", style = MaterialTheme.typography.headlineSmall)
                Text("Abre o crea listas dentro del hogar seleccionado.")
            }
            Button(onClick = onCreateList) { Text("Crear lista") }
        }
        if (data.lists.isEmpty()) EmptyListForHousehold(onCreateList)
        data.lists.groupBy { it.householdId }.forEach { (householdId, lists) ->
            Text(data.households.firstOrNull { it.id == householdId }?.name ?: "Hogar", style = MaterialTheme.typography.titleMedium)
            lists.forEach { list ->
                ShoppingListSummaryCard(list, data.households.firstOrNull { it.id == list.householdId }?.name.orEmpty(), list.id == data.selectedListId) {
                    onAction(ShoppingListAction.SelectList(list.id))
                }
            }
        }
    }
}

@Composable
private fun CatalogPanel() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "Categorías",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            color = Color(0xFF181725),
        )
        CatalogSearchBar()
        CatalogCategoriesGrid()
    }
}

@Composable
private fun CatalogSearchBar() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(52.dp)
            .clip(MaterialTheme.shapes.large)
            .background(Color(0xFFF2F3F2))
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(
            imageVector = Icons.Outlined.Search,
            contentDescription = null,
            tint = Color(0xFF181725),
        )
        Text(
            text = "Buscar en catálogo",
            style = MaterialTheme.typography.bodyMedium,
            color = Color(0xFF7C7C7C),
        )
    }
}

@Composable
private fun CatalogCategoriesGrid() {
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        CatalogCategory.entries.chunked(2).forEach { rowCategories ->
            Row(horizontalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.fillMaxWidth()) {
                rowCategories.forEach { category ->
                    CatalogCategoryCard(category = category, modifier = Modifier.weight(1f))
                }
                if (rowCategories.size == 1) {
                    Box(modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun CatalogCategoryCard(category: CatalogCategory, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .height(190.dp)
            .clip(MaterialTheme.shapes.large)
            .background(category.background)
            .clickable { }
            .padding(horizontal = 12.dp, vertical = 18.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.SpaceBetween,
    ) {
        Image(
            painter = painterResource(category.imageRes),
            contentDescription = null,
            modifier = Modifier.height(86.dp).fillMaxWidth(),
            contentScale = ContentScale.Fit,
        )
        Text(
            text = category.title,
            color = Color(0xFF181725),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            lineHeight = 22.sp,
        )
    }
}

private enum class CatalogCategory(
    val title: String,
    val imageRes: Int,
    val background: Color,
) {
    Fruits("Frutas y verduras", R.drawable.catalog_fruits, Color(0xFFEAF6EF)),
    Oils("Aceite y cocina", R.drawable.catalog_oil, Color(0xFFFFF4EA)),
    Meat("Carne y pescado", R.drawable.catalog_meat, Color(0xFFFFECE8)),
    Bakery("Panadería y snacks", R.drawable.catalog_bakery, Color(0xFFF4EAF8)),
    Dairy("Lácteos y huevos", R.drawable.catalog_dairy, Color(0xFFFFF8DF)),
    Beverages("Bebidas", R.drawable.catalog_beverages, Color(0xFFEAF7FD)),
}

@Composable
private fun ProfilePanel(onLogout: () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Perfil", style = MaterialTheme.typography.headlineSmall)
        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
            Column(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Cuenta NFCompra", style = MaterialTheme.typography.titleMedium)
                Text("Acceso rápido a perfil, ajustes y sesión.")
                TextButton(onClick = onLogout) { Text("Cerrar sesión") }
            }
        }
    }
}

@Composable
private fun SummaryCard(title: String, value: String, detail: String) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
        Row(modifier = Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Column {
                Text(title, style = MaterialTheme.typography.titleMedium)
                Text(detail, style = MaterialTheme.typography.bodySmall)
            }
            Text(value, style = MaterialTheme.typography.headlineMedium)
        }
    }
}

@Composable
private fun HouseholdCard(household: HouseholdUiModel, listCount: Int, selected: Boolean, onOpen: () -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = if (selected) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.surfaceVariant)) {
        Row(modifier = Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Column {
                Text(household.name, style = MaterialTheme.typography.titleMedium)
                Text("$listCount listas activas", style = MaterialTheme.typography.bodySmall)
            }
            Button(onClick = onOpen) { Text(if (selected) "Abierto" else "Abrir") }
        }
    }
}

@Composable
private fun ShoppingListSummaryCard(list: ShoppingListSummaryUiModel, householdName: String, selected: Boolean, onOpen: () -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = if (selected) MaterialTheme.colorScheme.tertiaryContainer else MaterialTheme.colorScheme.surfaceVariant)) {
        Row(modifier = Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Column {
                Text(list.name, style = MaterialTheme.typography.titleMedium)
                Text(householdName.ifBlank { "Hogar" }, style = MaterialTheme.typography.bodySmall)
            }
            Button(onClick = onOpen) { Text(if (selected) "Abierta" else "Abrir") }
        }
    }
}

@Composable
private fun EmptyListForHousehold(onCreateList: () -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
        Column(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("No hay listas asociadas a este hogar.")
            Button(onClick = onCreateList) { Text("Crear lista") }
        }
    }
}

@Composable
private fun CurrentListActions(onRename: () -> Unit, onClearChecked: () -> Unit, onDelete: () -> Unit) {
    Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        TextButton(onClick = onRename) { Text("Renombrar") }
        TextButton(onClick = onClearChecked) { Text("Vaciar comprados") }
        TextButton(onClick = onDelete) { Text("Eliminar") }
    }
}

@Composable
private fun InitialHouseholdLoadRecovery(errorMessage: String, onRetry: () -> Unit, onLogout: () -> Unit) {
    Column(modifier = Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        TextButton(onClick = onLogout) { Text("Cerrar sesión") }
        Text("El hogar se ha creado", style = MaterialTheme.typography.headlineSmall)
        Text(errorMessage, color = MaterialTheme.colorScheme.error)
        Button(onClick = onRetry) { Text("Reintentar carga") }
    }
}

@Composable
internal fun FirstHouseholdSetup(
    initialName: String,
    errorMessage: String?,
    onCreate: (String) -> Unit,
    onLogout: () -> Unit,
) {
    var name by remember(initialName) { mutableStateOf(initialName) }
    Column(modifier = Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        TextButton(onClick = onLogout) { Text("Cerrar sesión") }
        Text("Crea tu hogar", style = MaterialTheme.typography.headlineSmall)
        Text("Necesitas un hogar para organizar tus listas.")
        errorMessage?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        OutlinedTextField(
            value = name,
            onValueChange = { name = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Nombre del hogar") },
        )
        Button(onClick = { onCreate(name.trim()) }, enabled = name.isNotBlank()) {
            Text(if (errorMessage == null) "Crear hogar" else "Reintentar")
        }
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

@Composable
private fun ConfirmDialog(title: String, message: String, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(message) },
        confirmButton = { TextButton(onClick = onConfirm) { Text("Confirmar") } },
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
        floatingActionButton = { FloatingActionButton(modifier = Modifier.semantics { contentDescription = "Añadir producto" }, onClick = { adding = true }) { Text("+") } },
    ) { padding ->
        LazyColumn(modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (state.isOffline) item { Text("Sin conexión", color = MaterialTheme.colorScheme.error) }
            item { Text("Pendientes", style = MaterialTheme.typography.titleMedium) }
            if (state.pending.isEmpty()) item { EmptyState("No hay productos pendientes") }
            items(state.pending, key = { it.id }) { item -> ShoppingItem(item, onAction) }
            item { Text("Comprados", style = MaterialTheme.typography.titleMedium) }
            if (state.checked.isEmpty()) item { EmptyState("Aún no has comprado nada") }
            items(state.checked, key = { it.id }) { item -> ShoppingItem(item, onAction) }
        }
    }
    if (adding) ItemNameDialog("Añadir producto", addName, { addName = it }, {
        if (addName.isNotBlank()) onAction(ShoppingListAction.AddItem(addName.trim()))
        addName = ""
        adding = false
    }) { adding = false }
}

@Composable
private fun ShoppingItem(item: ShoppingListItemUiModel, onAction: (ShoppingListAction) -> Unit) {
    var editing by remember { mutableStateOf(false) }
    var editedName by remember(item.id) { mutableStateOf(item.name) }
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Column {
            Text(item.name)
            Text(item.quantity, style = MaterialTheme.typography.bodySmall)
            item.pendingState?.let { state ->
                Text(
                    when (state) {
                        "pending" -> "Pendiente de sincronización"
                        "syncing" -> "Sincronizando"
                        "failed" -> "No se pudo sincronizar; requiere revisión manual"
                        "conflict" -> "Conflicto de versiones"
                        else -> state
                    },
                    style = MaterialTheme.typography.labelMedium,
                    color = if (state == "failed" || state == "conflict") MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                )
            }
        }
        if (item.pendingOperationType != "delete") {
            Checkbox(checked = item.checked, modifier = Modifier.semantics { contentDescription = "Marcar ${item.name}" }, onCheckedChange = { onAction(ShoppingListAction.ToggleItem(item.id)) })
        }
    }
    if (item.pendingOperationType != "delete") {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TextButton(onClick = { editing = true }) { Text("Editar") }
            TextButton(onClick = { onAction(ShoppingListAction.DeleteItem(item.id)) }) { Text("Borrar") }
        }
    }
    val conflictOperationId = item.pendingOperationId.takeIf { item.pendingState == "conflict" }
    if (conflictOperationId != null) {
        val localIntent = when {
            item.pendingOperationType == "delete" -> "Eliminar ${item.serverItemName ?: item.name}"
            item.pendingIsChecked != null -> "${item.name} · ${item.pendingIsChecked.checkedLabel()}"
            else -> item.name
        }
        val serverIntent = buildString {
            append(item.serverItemName ?: "No disponible")
            if (item.pendingIsChecked != null && item.serverItemIsChecked != null) {
                append(" · ")
                append(item.serverItemIsChecked.checkedLabel())
            }
        }
        val localVersion = item.pendingExpectedVersion ?: item.version
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Tu cambio (v$localVersion): $localIntent")
            Text("Servidor (v${item.serverItemVersion ?: "?"}): $serverIntent")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(onClick = { onAction(ResolveConflict.UseServer(conflictOperationId)) }) { Text("Usar versión del servidor") }
                TextButton(onClick = { onAction(ResolveConflict.RetryLocal(conflictOperationId)) }) { Text("Reintentar mi cambio") }
            }
        }
    }
    if (editing) ItemNameDialog("Editar producto", editedName, { editedName = it }, {
        if (editedName.isNotBlank()) onAction(ShoppingListAction.EditItem(item.id, editedName.trim()))
        editing = false
    }) { editing = false }
}

private fun Boolean.checkedLabel(): String = if (this) "Comprado" else "Pendiente"

@Composable
private fun ItemNameDialog(title: String, value: String, onValueChange: (String) -> Unit, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { OutlinedTextField(value, onValueChange, label = { Text("Nombre") }) },
        confirmButton = { TextButton(onClick = onConfirm) { Text("Guardar") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}

@Composable
private fun EmptyState(message: String) = Text(message, style = MaterialTheme.typography.bodyMedium)

private val EmptyListState = ShoppingListUiState("Compra semanal", emptyList(), emptyList(), false)

@Preview
@Composable
private fun ShoppingListPreview() = NFCompraTheme { ShoppingListScreen(EmptyListState, {}) }

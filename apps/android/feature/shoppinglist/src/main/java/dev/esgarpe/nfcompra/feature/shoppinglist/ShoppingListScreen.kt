package dev.esgarpe.nfcompra.feature.shoppinglist

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.ListAlt
import androidx.compose.material.icons.outlined.Category
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.HomeWork
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.IconButton
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.CompositionLocalProvider
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
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.esgarpe.nfcompra.core.designsystem.NFCompraTheme
import kotlinx.coroutines.delay

private val GroceryPrimaryGradient = listOf(Color(0xFFAEDC81), Color(0xFF6CC51D))
private val GroceryPrimaryStrong = Color(0xFF6CC51D)
private val WebPage = Color(0xFFF8FCF9)
private val WebSurface = Color.White
private val WebText = Color(0xFF10271E)
private val WebMuted = Color(0xFF527062)
private val WebPrimary = Color(0xFF1C7144)
private val WebLime = Color(0xFFDCFF72)
private val PendingSurface = Color(0xFFFFF7D7)
private val PendingAccent = Color(0xFFFFC83D)
private val CheckedSurface = Color(0xFFFFE7E1)
private val CheckedAccent = Color(0xFFE2533F)
private val PurchasedGreen = Color(0xFF18864B)
private val ScreenTopPadding = 16.dp
private val ScreenBottomPadding = 24.dp

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
        is ShoppingListViewState.Data -> ShoppingListContent(state as ShoppingListViewState.Data, viewModel::onAction, viewModel::searchProductCatalog, onLogout, onMembers)
    }
}

@Composable
internal fun ShoppingListContent(
    data: ShoppingListViewState.Data,
    onAction: (ShoppingListAction) -> Unit,
    onSearchProducts: suspend (String, Int) -> List<ProductCatalogUiModel>,
    onLogout: () -> Unit,
    onMembers: (String) -> Unit,
) {
    var selectedTab by remember { mutableStateOf(DashboardTab.Home) }
    var creatingHousehold by remember { mutableStateOf(false) }
    var creatingList by remember { mutableStateOf(false) }
    var renamingList by remember { mutableStateOf(false) }
    var deletingList by remember { mutableStateOf(false) }
    var notificationsOpen by remember { mutableStateOf(false) }
    var openedListId by remember { mutableStateOf<String?>(null) }
    val isListDetailOpen = selectedTab == DashboardTab.Lists && data.selectedListId != null && openedListId == data.selectedListId
    val selectedListHouseholdName = data.lists.firstOrNull { it.id == data.selectedListId }
        ?.let { selectedList -> data.households.firstOrNull { it.id == selectedList.householdId }?.name }
        ?: data.households.firstOrNull { it.id == data.selectedHouseholdId }?.name
        ?: "hogar"

    Box(modifier = Modifier.fillMaxSize().background(WebPage)) {
        Column(modifier = Modifier.fillMaxSize().background(WebPage).padding(bottom = 88.dp)) {
            ShoppingAppBanner(
                title = if (isListDetailOpen) data.content.title else selectedTab.label,
                subtitle = if (isListDetailOpen) selectedListHouseholdName else null,
                onTitleEdit = if (isListDetailOpen) ({ renamingList = true }) else null,
                showBack = selectedTab != DashboardTab.Home || isListDetailOpen,
                onBack = {
                    if (isListDetailOpen) {
                        openedListId = null
                    } else {
                        selectedTab = DashboardTab.Home
                    }
                },
                expanded = notificationsOpen,
                onExpandedChange = { notificationsOpen = it },
            )

            CompositionLocalProvider(LocalContentColor provides WebText) {
                data.message?.let {
                    Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(horizontal = 20.dp))
                }
                data.conflict?.let { current ->
                    Row(modifier = Modifier.padding(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("El producto ha cambiado: ${current.name}", color = WebText)
                        TextButton(onClick = { onAction(ShoppingListAction.RetryConflict) }, colors = ButtonDefaults.textButtonColors(contentColor = WebPrimary)) { Text("Reintentar") }
                    }
                }

                if (isListDetailOpen) {
                    ShoppingListScreen(
                        state = data.content,
                        onAction = onAction,
                        onSearchProducts = onSearchProducts,
                        onRename = { renamingList = true },
                        onClearChecked = { onAction(ShoppingListAction.DeleteCheckedItems) },
                        onDelete = { deletingList = true },
                    )
                } else {
                    when (selectedTab) {
                        DashboardTab.Home -> DashboardHome(data, onAction, { creatingHousehold = true }, { creatingList = true }) { listId ->
                            openedListId = listId
                            selectedTab = DashboardTab.Lists
                        }
                        DashboardTab.Households -> HouseholdsPanel(data, onAction, { creatingHousehold = true })
                        DashboardTab.Lists -> ListsPanel(data, onAction, { creatingList = true }) { listId ->
                            openedListId = listId
                        }
                        DashboardTab.Catalog -> CatalogPanel()
                        DashboardTab.Profile -> ProfilePanel(onLogout)
                    }
                }
            }
        }

        Box(modifier = Modifier.align(Alignment.BottomCenter)) {
            FloatingDashboardNavigation(
                selected = selectedTab,
                onSelect = { selectedTab = it },
            )
        }
    }

    if (creatingHousehold) CreateEntityDialog("Crear hogar", "Nombre del hogar", confirmText = "Crear hogar", onConfirm = {
        onAction(ShoppingListAction.CreateHousehold(it))
        creatingHousehold = false
    }) { creatingHousehold = false }
    if (creatingList) CreateListDialog(
        households = data.households,
        selectedHouseholdId = data.selectedHouseholdId,
        onConfirm = { householdId, name ->
            onAction(ShoppingListAction.CreateList(householdId, name))
            creatingList = false
        },
        onDismiss = { creatingList = false },
    )
    if (renamingList) CreateEntityDialog("Renombrar lista", "Nuevo nombre de la lista", confirmText = "Guardar", onConfirm = {
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
    Lists("Listas", "Listas", Icons.AutoMirrored.Outlined.ListAlt),
    Catalog("Catálogo", "Catálogo", Icons.Outlined.Category),
    Profile("Perfil", "Perfil", Icons.Outlined.Person),
}

@Composable
private fun ShoppingAppBanner(
    title: String,
    subtitle: String? = null,
    onTitleEdit: (() -> Unit)? = null,
    showBack: Boolean,
    onBack: () -> Unit,
    expanded: Boolean,
    onExpandedChange: (Boolean) -> Unit,
) {
    val isDetailTitle = subtitle != null || onTitleEdit != null
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(if (isDetailTitle) 68.dp else 56.dp)
            .background(
                Brush.linearGradient(
                    colors = GroceryPrimaryGradient,
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
                    .size(44.dp)
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

        Column(
            modifier = Modifier
                .align(Alignment.Center)
                .padding(horizontal = 72.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center,
            ) {
                Text(
                    text = title,
                    color = Color.White,
                    fontSize = if (isDetailTitle) 22.sp else 18.sp,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (onTitleEdit != null) {
                    IconButton(onClick = onTitleEdit, modifier = Modifier.size(34.dp)) {
                        Icon(
                            imageVector = Icons.Outlined.Edit,
                            contentDescription = "Renombrar lista",
                            tint = Color.White,
                            modifier = Modifier.size(17.dp),
                        )
                    }
                }
            }
            subtitle?.let {
                Text(
                    text = it,
                    color = WebText,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }

        Box(modifier = Modifier.align(Alignment.CenterEnd)) {
            IconButton(
                onClick = { onExpandedChange(true) },
                modifier = Modifier
                    .size(48.dp)
                    .padding(2.dp)
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
            .height(88.dp)
            .padding(horizontal = 16.dp)
            .semantics { contentDescription = "Menú inferior principal" },
    ) {
        val itemWidth = maxWidth / navItems.size
        val bubbleSize = 64.dp
        val activeX by animateDpAsState(
            targetValue = itemWidth * selectedIndex + (itemWidth - bubbleSize) / 2,
            animationSpec = tween(durationMillis = 260),
            label = "floating-nav-active-x",
        )
        val navSurface = Color.White
        val inactiveColor = Color.White.copy(alpha = 0.78f)
        val activeColor = Color.White

        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .height(68.dp)
                .shadow(18.dp, shape = MaterialTheme.shapes.extraLarge, clip = false)
                .clip(MaterialTheme.shapes.extraLarge)
                .background(Brush.linearGradient(GroceryPrimaryGradient)),
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
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                ) { onSelect(selected) }
                .semantics { contentDescription = "${selected.label} seleccionado" },
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = selected.icon,
                contentDescription = null,
                tint = GroceryPrimaryStrong,
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
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick,
            )
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
    onOpenList: (String) -> Unit,
) {
    val selectedList = data.lists.firstOrNull { it.id == data.selectedListId } ?: data.lists.firstOrNull()
    val selectedHousehold = selectedList?.let { list -> data.households.firstOrNull { it.id == list.householdId } }
    val pendingCount = data.content.pending.size
    val checkedCount = data.content.checked.size
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp)
            .padding(top = ScreenTopPadding, bottom = ScreenBottomPadding),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Hola", style = MaterialTheme.typography.headlineSmall, color = WebText, fontWeight = FontWeight.Bold)
            SectionTitle("Acciones rápidas")
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                Button(onClick = onCreateHousehold, modifier = Modifier.weight(1f), colors = webPrimaryButtonColors()) { Text("Crear hogar") }
                Button(onClick = onCreateList, modifier = Modifier.weight(1f), colors = webLimeButtonColors()) { Text("Crear lista") }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
            CompactMetricCard("Hogares", data.households.size.toString(), Modifier.weight(1f))
            CompactMetricCard("Listas", data.lists.size.toString(), Modifier.weight(1f))
            CompactMetricCard("Pendientes", pendingCount.toString(), Modifier.weight(1f))
        }
        SectionTitle("Continuar")
        if (selectedList == null) {
            EmptyListForHousehold(onCreateList)
        } else {
            ContinueListCard(
                list = selectedList,
                householdName = selectedHousehold?.name.orEmpty(),
                pendingCount = pendingCount,
                checkedCount = checkedCount,
            ) {
                onAction(ShoppingListAction.SelectList(selectedList.id))
                onOpenList(selectedList.id)
            }
        }
        SectionTitle("Tus hogares")
        data.households.take(3).forEach { household ->
            HouseholdCard(household, data.lists.count { it.householdId == household.id }, household.id == data.selectedHouseholdId) {
                onAction(ShoppingListAction.SelectHousehold(household.id))
            }
        }
        SectionTitle("Listas recientes")
        if (data.lists.isEmpty()) EmptyListForHousehold(onCreateList)
        data.lists.take(3).forEach { list ->
            ShoppingListSummaryCard(list, data.households.firstOrNull { it.id == list.householdId }?.name.orEmpty(), list.id == data.selectedListId) {
                onAction(ShoppingListAction.SelectList(list.id))
                onOpenList(list.id)
            }
        }
    }
}

@Composable
private fun HouseholdsPanel(data: ShoppingListViewState.Data, onAction: (ShoppingListAction) -> Unit, onCreateHousehold: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp)
            .padding(top = ScreenTopPadding, bottom = ScreenBottomPadding),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Column {
                Text("Organiza tus listas por casa, familia o supermercado.", color = WebMuted, fontWeight = FontWeight.SemiBold)
            }
            Button(onClick = onCreateHousehold, colors = webPrimaryButtonColors()) { Text("Nuevo hogar") }
        }
        data.households.forEach { household ->
            HouseholdCard(household, data.lists.count { it.householdId == household.id }, household.id == data.selectedHouseholdId) {
                onAction(ShoppingListAction.SelectHousehold(household.id))
            }
        }
    }
}

@Composable
private fun ListsPanel(
    data: ShoppingListViewState.Data,
    onAction: (ShoppingListAction) -> Unit,
    onCreateList: () -> Unit,
    onOpenList: (String) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp)
            .padding(top = ScreenTopPadding, bottom = ScreenBottomPadding),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
            Text("Resumen de tus listas guardadas", style = MaterialTheme.typography.headlineSmall, color = WebText, fontWeight = FontWeight.Bold)
            Button(onClick = onCreateList, modifier = Modifier.fillMaxWidth(), colors = webPrimaryButtonColors()) { Text("Crear lista") }
        }
        if (data.lists.isEmpty()) EmptyListForHousehold(onCreateList)
        data.lists.groupBy { it.householdId }.forEach { (householdId, lists) ->
            val householdName = data.households.firstOrNull { it.id == householdId }?.name ?: "Hogar"
            val loadedLists = lists.count { it.id == data.selectedListId }
            val pendingCount = if (loadedLists > 0) data.content.pending.size else 0
            val checkedCount = if (loadedLists > 0) data.content.checked.size else 0
            SectionTitle(householdName)
            Text(
                text = "${lists.size} ${if (lists.size == 1) "lista" else "listas"} · $pendingCount pendientes visibles · $checkedCount comprados visibles",
                style = MaterialTheme.typography.bodySmall,
                color = WebMuted,
                fontWeight = FontWeight.SemiBold,
            )
            lists.chunked(2).forEach { rowLists ->
                Row(horizontalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.fillMaxWidth()) {
                    rowLists.forEach { list ->
                        val isLoadedList = list.id == data.selectedListId
                        ShoppingListGridCard(
                            list = list,
                            selected = list.id == data.selectedListId,
                            pendingCount = data.content.pending.size.takeIf { isLoadedList },
                            checkedCount = data.content.checked.size.takeIf { isLoadedList },
                            modifier = Modifier.weight(1f),
                        ) {
                            onAction(ShoppingListAction.SelectList(list.id))
                            onOpenList(list.id)
                        }
                    }
                    if (rowLists.size == 1) Box(modifier = Modifier.weight(1f))
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
            .padding(horizontal = 24.dp)
            .padding(top = ScreenTopPadding, bottom = ScreenBottomPadding),
        verticalArrangement = Arrangement.spacedBy(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
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
            tint = WebPrimary,
        )
        Text(
            text = "Buscar en catálogo",
            style = MaterialTheme.typography.bodyMedium,
            color = WebMuted,
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
            color = WebText,
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
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp)
            .padding(top = ScreenTopPadding, bottom = ScreenBottomPadding),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Card(colors = CardDefaults.cardColors(containerColor = WebSurface)) {
            Column(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Cuenta NFCompra", style = MaterialTheme.typography.titleMedium, color = WebPrimary, fontWeight = FontWeight.Bold)
                Text("Acceso rápido a perfil, ajustes y sesión.", color = WebMuted)
                TextButton(onClick = onLogout, colors = ButtonDefaults.textButtonColors(contentColor = WebPrimary)) { Text("Cerrar sesión") }
            }
        }
    }
}

@Composable
private fun webPrimaryButtonColors() = ButtonDefaults.buttonColors(
    containerColor = WebPrimary,
    contentColor = Color.White,
)

@Composable
private fun webLimeButtonColors() = ButtonDefaults.buttonColors(
    containerColor = WebLime,
    contentColor = WebText,
)

@Composable
private fun SummaryCard(title: String, value: String, detail: String) {
    Card(colors = CardDefaults.cardColors(containerColor = WebLime)) {
        Row(modifier = Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Column {
                Text(title, style = MaterialTheme.typography.titleMedium, color = WebPrimary, fontWeight = FontWeight.Bold)
                Text(detail, style = MaterialTheme.typography.bodySmall, color = WebMuted, fontWeight = FontWeight.SemiBold)
            }
            Text(value, style = MaterialTheme.typography.headlineMedium, color = WebText, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun SectionTitle(title: String) {
    Text(title, style = MaterialTheme.typography.titleMedium, color = WebPrimary, fontWeight = FontWeight.Bold)
}

@Composable
private fun CompactMetricCard(title: String, value: String, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier.height(92.dp),
        colors = CardDefaults.cardColors(containerColor = WebSurface),
    ) {
        Column(
            modifier = Modifier.fillMaxSize().padding(12.dp),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(title, style = MaterialTheme.typography.bodySmall, color = WebMuted, fontWeight = FontWeight.SemiBold)
            Text(value, style = MaterialTheme.typography.headlineSmall, color = WebPrimary, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun ContinueListCard(
    list: ShoppingListSummaryUiModel,
    householdName: String,
    pendingCount: Int,
    checkedCount: Int,
    onOpen: () -> Unit,
) {
    Card(colors = CardDefaults.cardColors(containerColor = WebLime)) {
        Column(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(list.name, style = MaterialTheme.typography.titleLarge, color = WebText, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(householdName.ifBlank { "Hogar" }, style = MaterialTheme.typography.bodyMedium, color = WebMuted, fontWeight = FontWeight.SemiBold)
                }
                Button(onClick = onOpen, colors = webPrimaryButtonColors()) { Text("Abrir lista") }
            }
            Text("$pendingCount pendientes · $checkedCount comprados", style = MaterialTheme.typography.bodyMedium, color = WebText, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun HouseholdCard(household: HouseholdUiModel, listCount: Int, selected: Boolean, onOpen: () -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = if (selected) WebLime else WebSurface)) {
        Row(modifier = Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Column {
                Text(household.name, style = MaterialTheme.typography.titleMedium, color = WebText, fontWeight = FontWeight.Bold)
                Text("$listCount listas activas", style = MaterialTheme.typography.bodySmall, color = WebMuted, fontWeight = FontWeight.SemiBold)
            }
            Button(onClick = onOpen, colors = webPrimaryButtonColors()) { Text(if (selected) "Abierto" else "Abrir") }
        }
    }
}

@Composable
private fun ShoppingListSummaryCard(list: ShoppingListSummaryUiModel, householdName: String, selected: Boolean, onOpen: () -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = if (selected) WebLime else WebSurface)) {
        Row(modifier = Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Column {
                Text(list.name, style = MaterialTheme.typography.titleMedium, color = WebText, fontWeight = FontWeight.Bold)
                Text(householdName.ifBlank { "Hogar" }, style = MaterialTheme.typography.bodySmall, color = WebMuted, fontWeight = FontWeight.SemiBold)
            }
            Button(onClick = onOpen, colors = webPrimaryButtonColors()) { Text(if (selected) "Abierta" else "Abrir") }
        }
    }
}

@Composable
private fun ShoppingListGridCard(
    list: ShoppingListSummaryUiModel,
    selected: Boolean,
    pendingCount: Int?,
    checkedCount: Int?,
    modifier: Modifier = Modifier,
    onOpen: () -> Unit,
) {
    val totalCount = pendingCount?.let { pending -> checkedCount?.let { checked -> pending + checked } }
    val statusText = when {
        pendingCount == null || checkedCount == null -> "Abrir para ver detalle"
        totalCount == 0 -> "Lista vacía"
        pendingCount == 0 -> "Todo comprado"
        else -> "$pendingCount pendientes"
    }
    Column(
        modifier = modifier
            .height(190.dp)
            .clip(MaterialTheme.shapes.large)
            .background(if (selected) WebLime else WebSurface)
            .clickable(onClick = onOpen)
            .padding(14.dp),
        verticalArrangement = Arrangement.SpaceBetween,
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                text = list.name,
                style = MaterialTheme.typography.titleMedium,
                color = WebText,
                fontWeight = FontWeight.Bold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            ListCardStat("Pendientes", pendingCount?.toString() ?: "—")
            ListCardStat("Comprados", checkedCount?.toString() ?: "—")
            ListCardStat("Total", totalCount?.toString() ?: "—")
            Text(statusText, style = MaterialTheme.typography.bodySmall, color = WebMuted, fontWeight = FontWeight.SemiBold)
        }
        Button(
            onClick = onOpen,
            modifier = Modifier.fillMaxWidth(),
            colors = if (selected) webPrimaryButtonColors() else webLimeButtonColors(),
        ) {
            Text(if (selected) "Abierta" else "Abrir")
        }
    }
}

@Composable
private fun ListCardStat(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = WebMuted)
        Text(value, style = MaterialTheme.typography.bodySmall, color = WebText, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun EmptyListForHousehold(onCreateList: () -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = WebSurface)) {
        Column(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("No hay listas asociadas a este hogar.", color = WebMuted, fontWeight = FontWeight.SemiBold)
            Button(onClick = onCreateList, colors = webPrimaryButtonColors()) { Text("Crear lista") }
        }
    }
}

@Composable
private fun CurrentListActions(onRename: () -> Unit, onClearChecked: () -> Unit, onDelete: () -> Unit) {
    Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        TextButton(onClick = onRename, colors = ButtonDefaults.textButtonColors(contentColor = WebPrimary)) { Text("Renombrar") }
        TextButton(onClick = onClearChecked, colors = ButtonDefaults.textButtonColors(contentColor = WebPrimary)) { Text("Vaciar comprados") }
        TextButton(onClick = onDelete, colors = ButtonDefaults.textButtonColors(contentColor = Color(0xFFB42318))) { Text("Eliminar") }
    }
}

@Composable
private fun InitialHouseholdLoadRecovery(errorMessage: String, onRetry: () -> Unit, onLogout: () -> Unit) {
    Column(modifier = Modifier.fillMaxSize().background(WebPage).padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        TextButton(onClick = onLogout, colors = ButtonDefaults.textButtonColors(contentColor = WebPrimary)) { Text("Cerrar sesión") }
        Text("El hogar se ha creado", style = MaterialTheme.typography.headlineSmall, color = WebPrimary, fontWeight = FontWeight.Bold)
        Text(errorMessage, color = MaterialTheme.colorScheme.error)
        Button(onClick = onRetry, colors = webPrimaryButtonColors()) { Text("Reintentar carga") }
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
    Column(modifier = Modifier.fillMaxSize().background(WebPage).padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        TextButton(onClick = onLogout, colors = ButtonDefaults.textButtonColors(contentColor = WebPrimary)) { Text("Cerrar sesión") }
        Text("Crea tu hogar", style = MaterialTheme.typography.headlineSmall, color = WebPrimary, fontWeight = FontWeight.Bold)
        Text("Necesitas un hogar para organizar tus listas.", color = WebMuted)
        errorMessage?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        OutlinedTextField(
            value = name,
            onValueChange = { name = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Nombre del hogar") },
        )
        Button(onClick = { onCreate(name.trim()) }, enabled = name.isNotBlank(), colors = webPrimaryButtonColors()) {
            Text(if (errorMessage == null) "Crear hogar" else "Reintentar")
        }
    }
}

@Composable
private fun CreateEntityDialog(
    title: String,
    label: String,
    confirmText: String = "Crear",
    onConfirm: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var name by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = WebSurface,
        title = { DialogTitle(title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                Text("Introduce los datos para continuar.", color = WebMuted, fontWeight = FontWeight.SemiBold)
                StyledOutlinedTextField(name, { name = it }, label)
            }
        },
        confirmButton = {
            Button(onClick = { if (name.isNotBlank()) onConfirm(name.trim()) }, enabled = name.isNotBlank(), colors = webPrimaryButtonColors()) {
                Text(confirmText)
            }
        },
        dismissButton = { TextButton(onClick = onDismiss, colors = ButtonDefaults.textButtonColors(contentColor = WebMuted)) { Text("Cancelar") } },
    )
}

@Composable
private fun ConfirmDialog(title: String, message: String, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = WebSurface,
        title = { DialogTitle(title) },
        text = { Text(message, color = WebMuted, fontWeight = FontWeight.SemiBold) },
        confirmButton = { Button(onClick = onConfirm, colors = webPrimaryButtonColors()) { Text("Confirmar") } },
        dismissButton = { TextButton(onClick = onDismiss, colors = ButtonDefaults.textButtonColors(contentColor = WebMuted)) { Text("Cancelar") } },
    )
}

@Composable
private fun CreateListDialog(
    households: List<HouseholdUiModel>,
    selectedHouseholdId: String,
    onConfirm: (String, String) -> Unit,
    onDismiss: () -> Unit,
) {
    var name by remember { mutableStateOf("") }
    var expanded by remember { mutableStateOf(false) }
    var householdId by remember(households, selectedHouseholdId) {
        mutableStateOf(households.firstOrNull { it.id == selectedHouseholdId }?.id ?: households.firstOrNull()?.id.orEmpty())
    }
    val selectedHousehold = households.firstOrNull { it.id == householdId }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = WebSurface,
        title = { DialogTitle("Crear lista") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.fillMaxWidth()) {
                Text("Elige el hogar y asigna un nombre a la lista.", color = WebMuted, fontWeight = FontWeight.SemiBold)
                Box(modifier = Modifier.fillMaxWidth()) {
                    StyledOutlinedTextField(
                        value = selectedHousehold?.name.orEmpty(),
                        onValueChange = {},
                        label = "Hogar",
                        readOnly = true,
                        modifier = Modifier.fillMaxWidth(),
                        trailing = { Text("⌄", color = WebPrimary, fontWeight = FontWeight.Bold) },
                    )
                    Box(modifier = Modifier.fillMaxWidth().height(64.dp).clickable { expanded = true })
                    DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                        households.forEach { household ->
                            DropdownMenuItem(
                                text = { Text(household.name, color = WebText, fontWeight = FontWeight.SemiBold) },
                                onClick = {
                                    householdId = household.id
                                    expanded = false
                                },
                            )
                        }
                    }
                }
                StyledOutlinedTextField(name, { name = it }, "Nombre de la lista")
            }
        },
        confirmButton = {
            Button(
                onClick = { if (name.isNotBlank() && householdId.isNotBlank()) onConfirm(householdId, name.trim()) },
                enabled = name.isNotBlank() && householdId.isNotBlank(),
                colors = webPrimaryButtonColors(),
            ) {
                Text("Crear lista")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss, colors = ButtonDefaults.textButtonColors(contentColor = WebMuted)) { Text("Cancelar") } },
    )
}

@Composable
private fun DialogTitle(title: String) {
    Text(title, color = WebPrimary, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleLarge)
}

@Composable
private fun StyledOutlinedTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier.fillMaxWidth(),
    readOnly: Boolean = false,
    trailing: @Composable (() -> Unit)? = null,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        readOnly = readOnly,
        modifier = modifier,
        label = { Text(label, color = WebPrimary, fontWeight = FontWeight.SemiBold) },
        trailingIcon = trailing,
        singleLine = true,
    )
}

@Composable
fun ShoppingListScreen(
    state: ShoppingListUiState,
    onAction: (ShoppingListAction) -> Unit,
    onSearchProducts: suspend (String, Int) -> List<ProductCatalogUiModel> = { _, _ -> emptyList() },
    onRename: () -> Unit = {},
    onClearChecked: () -> Unit = {},
    onDelete: () -> Unit = {},
) {
    var addName by remember { mutableStateOf("") }
    var quantity by remember { mutableStateOf(1) }
    var cardMode by remember { mutableStateOf(true) }
    var suggestions by remember { mutableStateOf(emptyList<ProductCatalogUiModel>()) }
    var isProductSearchOpen by remember { mutableStateOf(false) }
    var cardQuantities by remember { mutableStateOf(emptyMap<String, Int>()) }
    var waitlist by remember { mutableStateOf(emptyList<PendingProductUiModel>()) }
    var recentlyAddedId by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(addName, cardMode, state.isOffline) {
        val search = addName.trim()
        if (state.isOffline || search.length < 2) {
            suggestions = emptyList()
            return@LaunchedEffect
        }
        delay(if (cardMode) 80 else 150)
        suggestions = onSearchProducts(search, if (cardMode) 12 else 8)
    }

    LaunchedEffect(recentlyAddedId) {
        if (recentlyAddedId != null) {
            delay(450)
            recentlyAddedId = null
        }
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(WebPage)
            .padding(horizontal = 20.dp)
            .padding(top = 8.dp, bottom = ScreenBottomPadding),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            ShoppingListWebHeader(
                isOffline = state.isOffline,
                productName = addName,
                quantity = quantity,
                cardMode = cardMode,
                onProductNameChange = {
                    addName = it
                    isProductSearchOpen = true
                },
                onProductFocus = { isProductSearchOpen = true },
                onQuantityDecrease = { if (quantity > 1) quantity-- },
                onQuantityIncrease = { quantity++ },
                onCardModeChange = {
                    cardMode = it
                    suggestions = emptyList()
                    cardQuantities = emptyMap()
                    isProductSearchOpen = true
                },
                onAdd = {
                    if (addName.isNotBlank()) {
                        onAction(ShoppingListAction.AddItem(addName.trim(), quantity.toDouble()))
                        addName = ""
                        quantity = 1
                        suggestions = emptyList()
                        isProductSearchOpen = false
                    }
                },
                onClearChecked = onClearChecked,
                onDelete = onDelete,
            )
        }
        if (!cardMode && isProductSearchOpen && suggestions.isNotEmpty()) {
            item {
                ProductSuggestionDropdown(
                    suggestions = suggestions,
                    onSelect = { suggestion ->
                        addName = suggestion.name
                        suggestions = emptyList()
                        isProductSearchOpen = false
                    },
                )
            }
        }
        if (cardMode && isProductSearchOpen && suggestions.isNotEmpty()) {
            item {
                ProductCardResults(
                    suggestions = suggestions,
                    quantities = cardQuantities,
                    recentlyAddedId = recentlyAddedId,
                    onQuantityChange = { productId, delta ->
                        cardQuantities = cardQuantities + (productId to ((cardQuantities[productId] ?: 0) + delta).coerceAtLeast(0))
                    },
                    onSelect = { suggestion ->
                        val selectedQuantity = cardQuantities[suggestion.id] ?: 0
                        if (selectedQuantity > 0) {
                            val pending = PendingProductUiModel(
                                catalogProductId = suggestion.id,
                                name = suggestion.name,
                                quantity = selectedQuantity,
                                categoryName = suggestion.categoryName,
                                packageSize = suggestion.packageSize,
                                icon = productIcon(suggestion),
                            )
                            waitlist = waitlist.upsert(pending)
                            recentlyAddedId = suggestion.id
                            cardQuantities = cardQuantities + (suggestion.id to 0)
                        }
                    },
                )
            }
        }
        if (cardMode && waitlist.isNotEmpty()) {
            item {
                PendingProductWaitlist(
                    products = waitlist,
                    onRemove = { productId -> waitlist = waitlist.filterNot { it.catalogProductId == productId } },
                    onCommit = {
                        waitlist.forEach { product ->
                            onAction(ShoppingListAction.AddItem(product.name, product.quantity.toDouble()))
                        }
                        waitlist = emptyList()
                        suggestions = emptyList()
                        cardQuantities = emptyMap()
                        addName = ""
                        isProductSearchOpen = false
                    },
                )
            }
        }
        item {
            ShoppingItemsSection(
                title = "Pendientes",
                count = state.pending.size,
                emptyMessage = "No hay productos pendientes",
                containerColor = PendingSurface,
                accentColor = PendingAccent,
            ) {
                state.pending.forEach { item ->
                    ShoppingItem(item, onAction, accentColor = PendingAccent)
                }
            }
        }
        item {
            ShoppingItemsSection(
                title = "Comprados",
                count = state.checked.size,
                emptyMessage = "Aún no has comprado nada",
                containerColor = CheckedSurface,
                accentColor = CheckedAccent,
            ) {
                state.checked.forEach { item ->
                    ShoppingItem(item, onAction, accentColor = CheckedAccent)
                }
            }
        }
    }
}

@Composable
private fun ShoppingListWebHeader(
    isOffline: Boolean,
    productName: String,
    quantity: Int,
    cardMode: Boolean,
    onProductNameChange: (String) -> Unit,
    onProductFocus: () -> Unit,
    onQuantityDecrease: () -> Unit,
    onQuantityIncrease: () -> Unit,
    onCardModeChange: (Boolean) -> Unit,
    onAdd: () -> Unit,
    onClearChecked: () -> Unit,
    onDelete: () -> Unit,
) {
    Card(colors = CardDefaults.cardColors(containerColor = WebSurface)) {
        Column(modifier = Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                    SquareHeaderButton(
                        contentDescription = "Eliminar lista",
                        background = Color(0xFFFFECE8),
                        contentColor = Color(0xFFB42318),
                        onClick = onDelete,
                    ) {
                        Icon(Icons.Outlined.Delete, contentDescription = null, modifier = Modifier.size(18.dp))
                    }
                    Button(
                        onClick = onClearChecked,
                        modifier = Modifier.height(42.dp),
                        shape = MaterialTheme.shapes.medium,
                        colors = webPrimaryButtonColors(),
                    ) {
                        Text("Vaciar")
                    }
                }
                ViewModeSwitch(cardMode = cardMode, onCardModeChange = onCardModeChange)
            }
            if (isOffline) {
                Text("Sin conexión", color = MaterialTheme.colorScheme.error, fontWeight = FontWeight.SemiBold)
            }
            BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
                val compact = maxWidth < 420.dp
                if (compact) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            CompactInputBlock(label = "Producto", modifier = Modifier.weight(1f)) {
                                CompactProductField(productName, onProductNameChange, Modifier.fillMaxWidth(), onFocus = onProductFocus)
                            }
                            CompactInputBlock(label = "Cantidad", modifier = Modifier.width(118.dp)) {
                                QuantityStepper(quantity, onQuantityDecrease, onQuantityIncrease, modifier = Modifier.fillMaxWidth())
                            }
                        }
                        Button(
                            onClick = onAdd,
                            enabled = productName.isNotBlank(),
                            modifier = Modifier.fillMaxWidth().height(42.dp),
                            shape = MaterialTheme.shapes.medium,
                            colors = webPrimaryButtonColors(),
                        ) {
                            Text("Añadir")
                        }
                    }
                } else {
                    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        CompactInputBlock(label = "Producto", modifier = Modifier.weight(1f)) {
                            CompactProductField(productName, onProductNameChange, Modifier.fillMaxWidth(), onFocus = onProductFocus)
                        }
                        CompactInputBlock(label = "Cantidad", modifier = Modifier.width(126.dp)) {
                            QuantityStepper(quantity, onQuantityDecrease, onQuantityIncrease, modifier = Modifier.fillMaxWidth())
                        }
                        Button(
                            onClick = onAdd,
                            enabled = productName.isNotBlank(),
                            modifier = Modifier.width(92.dp).height(42.dp),
                            shape = MaterialTheme.shapes.medium,
                            colors = webPrimaryButtonColors(),
                        ) {
                            Text("Añadir")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ViewModeSwitch(cardMode: Boolean, onCardModeChange: (Boolean) -> Unit) {
    BoxWithConstraints(
        modifier = Modifier
            .width(88.dp)
            .height(42.dp)
            .clip(MaterialTheme.shapes.medium)
            .background(Color(0xFFF2F8F4))
            .border(1.dp, Color(0xFFCFE4D7), MaterialTheme.shapes.medium)
            .clickable { onCardModeChange(!cardMode) },
    ) {
        val thumbWidth = maxWidth / 2
        val thumbOffset by animateDpAsState(
            targetValue = if (cardMode) thumbWidth else 0.dp,
            animationSpec = tween(durationMillis = 180),
            label = "view-mode-switch",
        )
        Box(
            modifier = Modifier
                .offset(x = thumbOffset)
                .size(width = thumbWidth, height = maxHeight)
                .padding(3.dp)
                .clip(MaterialTheme.shapes.small)
                .background(WebPrimary),
        )
        Row(modifier = Modifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
            Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.Center) {
                Text("☰", color = if (!cardMode) Color.White else WebPrimary, fontWeight = FontWeight.Bold, fontSize = 17.sp)
            }
            Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.Center) {
                Text("▦", color = if (cardMode) Color.White else WebPrimary, fontWeight = FontWeight.Bold, fontSize = 17.sp)
            }
        }
    }
}

@Composable
private fun CompactInputBlock(label: String, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(label, color = WebText, fontWeight = FontWeight.Bold, fontSize = 13.sp)
        content()
    }
}

@Composable
private fun CompactProductField(value: String, onValueChange: (String) -> Unit, modifier: Modifier = Modifier, onFocus: () -> Unit = {}) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier.height(50.dp).onFocusChanged { if (it.isFocused) onFocus() },
        singleLine = true,
    )
}

@Composable
private fun QuantityStepper(
    quantity: Int,
    onDecrease: () -> Unit,
    onIncrease: () -> Unit,
    modifier: Modifier = Modifier,
    accentColor: Color = WebPrimary,
) {
    Row(
        modifier = modifier
            .height(50.dp)
            .clip(MaterialTheme.shapes.medium)
            .border(1.dp, accentColor.copy(alpha = 0.58f), MaterialTheme.shapes.medium)
            .background(accentColor.copy(alpha = 0.08f)),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TextButton(onClick = onDecrease, modifier = Modifier.weight(1f)) { Text("−", color = accentColor, fontWeight = FontWeight.Bold) }
        Text(quantity.toString(), color = WebText, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, modifier = Modifier.weight(0.9f))
        TextButton(onClick = onIncrease, modifier = Modifier.weight(1f)) { Text("+", color = accentColor, fontWeight = FontWeight.Bold) }
    }
}

private data class PendingProductUiModel(
    val catalogProductId: String,
    val name: String,
    val quantity: Int,
    val categoryName: String?,
    val packageSize: String?,
    val icon: String,
)

private fun List<PendingProductUiModel>.upsert(product: PendingProductUiModel): List<PendingProductUiModel> {
    val existing = firstOrNull { it.catalogProductId == product.catalogProductId }
    if (existing == null) return this + product
    return map {
        if (it.catalogProductId == product.catalogProductId) it.copy(quantity = it.quantity + product.quantity) else it
    }
}

@Composable
private fun ProductSuggestionDropdown(
    suggestions: List<ProductCatalogUiModel>,
    onSelect: (ProductCatalogUiModel) -> Unit,
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(max = 330.dp)
            .clip(MaterialTheme.shapes.large)
            .background(WebSurface)
            .border(1.dp, Color(0xFFCFE4D7), MaterialTheme.shapes.large)
            .padding(8.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        items(suggestions, key = { it.id }) { suggestion ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(MaterialTheme.shapes.medium)
                    .clickable { onSelect(suggestion) }
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(productIcon(suggestion), fontSize = 22.sp)
                Column(modifier = Modifier.weight(1f)) {
                    Text(suggestion.name, color = WebText, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(suggestion.metaLabel(), color = WebMuted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

@Composable
private fun ProductCardResults(
    suggestions: List<ProductCatalogUiModel>,
    quantities: Map<String, Int>,
    recentlyAddedId: String?,
    onQuantityChange: (String, Int) -> Unit,
    onSelect: (ProductCatalogUiModel) -> Unit,
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(max = 390.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        items(suggestions.chunked(2)) { rowProducts ->
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                rowProducts.forEach { suggestion ->
                    ProductResultCard(
                        suggestion = suggestion,
                        quantity = quantities[suggestion.id] ?: 0,
                        recentlyAdded = recentlyAddedId == suggestion.id,
                        onQuantityChange = { delta -> onQuantityChange(suggestion.id, delta) },
                        onSelect = { onSelect(suggestion) },
                        modifier = Modifier.weight(1f),
                    )
                }
                if (rowProducts.size == 1) Box(modifier = Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun ProductResultCard(
    suggestion: ProductCatalogUiModel,
    quantity: Int,
    recentlyAdded: Boolean,
    onQuantityChange: (Int) -> Unit,
    onSelect: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val borderColor = if (recentlyAdded) WebPrimary else Color(0xFFCFE4D7)
    Card(
        modifier = modifier.border(1.dp, borderColor, MaterialTheme.shapes.large),
        colors = CardDefaults.cardColors(containerColor = if (recentlyAdded) WebLime.copy(alpha = 0.45f) else WebSurface),
    ) {
        Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Top) {
                Text(productIcon(suggestion), fontSize = 26.sp)
                Column(modifier = Modifier.weight(1f)) {
                    Text(suggestion.name, color = WebText, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Text(suggestion.metaLabel(), color = WebMuted, fontSize = 11.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            }
            Text(
                text = if (quantity > 0) "x$quantity" else "Elige cantidad",
                color = if (quantity > 0) WebPrimary else WebMuted,
                fontWeight = FontWeight.Bold,
                fontSize = 12.sp,
            )
            QuantityStepper(
                quantity = quantity,
                onDecrease = { onQuantityChange(-1) },
                onIncrease = { onQuantityChange(1) },
                modifier = Modifier.fillMaxWidth(),
            )
            Button(
                onClick = onSelect,
                enabled = quantity > 0,
                shape = MaterialTheme.shapes.medium,
                colors = webPrimaryButtonColors(),
                modifier = Modifier.fillMaxWidth().height(42.dp),
            ) {
                Text("Seleccionar")
            }
        }
    }
}

@Composable
private fun PendingProductWaitlist(
    products: List<PendingProductUiModel>,
    onRemove: (String) -> Unit,
    onCommit: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(MaterialTheme.shapes.large)
            .background(WebSurface)
            .border(1.dp, Color(0xFFCFE4D7), MaterialTheme.shapes.large)
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Pendientes de añadir", color = WebText, fontWeight = FontWeight.Bold)
            Button(onClick = onCommit, shape = MaterialTheme.shapes.medium, colors = webPrimaryButtonColors()) {
                Text("Añadir ${products.size} ${if (products.size == 1) "producto" else "productos"}")
            }
        }
        products.forEach { product ->
            var dragAmount by remember(product.catalogProductId) { mutableStateOf(0f) }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(MaterialTheme.shapes.medium)
                    .background(Color(0xFFF8FCF9))
                    .pointerInput(product.catalogProductId) {
                        detectHorizontalDragGestures(
                            onDragEnd = {
                                if (dragAmount < -70f) onRemove(product.catalogProductId)
                                dragAmount = 0f
                            },
                        ) { _, dragDelta -> dragAmount += dragDelta }
                    }
                    .padding(horizontal = 10.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(product.icon, fontSize = 22.sp)
                Column(modifier = Modifier.weight(1f)) {
                    Text(product.name, color = WebText, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(product.metaLabel(), color = WebMuted, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Text("x${product.quantity}", color = WebPrimary, fontWeight = FontWeight.Bold)
                SquareHeaderButton(
                    contentDescription = "Quitar ${product.name} de pendientes de añadir",
                    background = Color(0xFFFFECE8),
                    contentColor = Color(0xFFB42318),
                    onClick = { onRemove(product.catalogProductId) },
                ) {
                    Icon(Icons.Outlined.Close, contentDescription = null, modifier = Modifier.size(18.dp))
                }
            }
        }
        Text("Desliza un producto hacia la izquierda para quitarlo antes de añadirlo.", color = WebMuted, fontSize = 12.sp)
    }
}

private fun ProductCatalogUiModel.metaLabel(): String =
    listOfNotNull(categoryName, packageSize).filter { it.isNotBlank() }.joinToString(" · ")

private fun PendingProductUiModel.metaLabel(): String =
    listOfNotNull(categoryName, packageSize).filter { it.isNotBlank() }.joinToString(" · ")

private fun productIcon(product: ProductCatalogUiModel): String {
    val text = "${product.iconKey} ${product.categoryName.orEmpty()} ${product.name}".normalizedUiSearch()
    return when {
        text.contains("atun") || text.contains("pescado") || text.contains("marisco") || text.contains("fish") -> "🐟"
        text.contains("leche") || text.contains("lacteo") || text.contains("yogur") || text.contains("milk") -> "🥛"
        text.contains("pan") || text.contains("bolleria") || text.contains("bread") -> "🥖"
        text.contains("fruta") || text.contains("manzana") || text.contains("apple") -> "🍎"
        text.contains("verdura") || text.contains("zanahoria") || text.contains("carrot") -> "🥕"
        text.contains("carne") || text.contains("pollo") || text.contains("meat") -> "🥩"
        text.contains("agua") || text.contains("bebida") || text.contains("refresco") || text.contains("bottle") -> "💧"
        text.contains("limpieza") || text.contains("drogueria") -> "🧽"
        text.contains("mascota") || text.contains("perro") || text.contains("gato") -> "🐾"
        text.contains("conserva") -> "🥫"
        else -> "🛒"
    }
}

private fun String.normalizedUiSearch(): String =
    java.text.Normalizer.normalize(this, java.text.Normalizer.Form.NFD)
        .replace("\\p{Mn}+".toRegex(), "")
        .lowercase()

@Composable
private fun ShoppingItemsSection(
    title: String,
    count: Int,
    emptyMessage: String,
    containerColor: Color,
    accentColor: Color,
    content: @Composable () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(MaterialTheme.shapes.large)
            .background(containerColor)
            .border(1.dp, accentColor, MaterialTheme.shapes.large)
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(MaterialTheme.shapes.medium)
                .background(Color.White.copy(alpha = 0.42f))
                .border(1.dp, accentColor.copy(alpha = 0.72f), MaterialTheme.shapes.medium)
                .padding(horizontal = 12.dp, vertical = 10.dp),
        ) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text(title, style = MaterialTheme.typography.titleMedium, color = if (accentColor == CheckedAccent) Color(0xFF9F1D16) else Color(0xFF8A5A00), fontWeight = FontWeight.Bold)
                Text("$count", color = accentColor, fontWeight = FontWeight.Bold)
            }
        }
            if (count == 0) {
                EmptyState(emptyMessage)
            } else {
                content()
            }
    }
}

@Composable
private fun SquareHeaderButton(
    contentDescription: String,
    background: Color,
    contentColor: Color,
    onClick: () -> Unit,
    content: @Composable () -> Unit,
) {
    Box(
        modifier = Modifier
            .size(42.dp)
            .clip(MaterialTheme.shapes.medium)
            .background(background)
            .clickable(onClick = onClick)
            .semantics { this.contentDescription = contentDescription },
        contentAlignment = Alignment.Center,
    ) {
        CompositionLocalProvider(LocalContentColor provides contentColor) {
            content()
        }
    }
}

@Composable
private fun ShoppingItem(item: ShoppingListItemUiModel, onAction: (ShoppingListAction) -> Unit, accentColor: Color) {
    var editing by remember { mutableStateOf(false) }
    var editedName by remember(item.id) { mutableStateOf(item.name) }
    var editedQuantity by remember(item.id) { mutableStateOf(item.quantity.quantityAsInt()) }
    Card(colors = CardDefaults.cardColors(containerColor = WebSurface)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(10.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(34.dp)
                    .clip(MaterialTheme.shapes.small)
                    .border(2.dp, if (item.checked) PurchasedGreen else accentColor, MaterialTheme.shapes.small)
                    .clickable { onAction(ShoppingListAction.ToggleItem(item.id)) }
                    .semantics { contentDescription = "Marcar ${item.name}" },
                contentAlignment = Alignment.Center,
            ) {
                if (item.checked) {
                    Text("✓", color = PurchasedGreen, fontWeight = FontWeight.Bold, fontSize = 20.sp)
                }
            }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    item.name,
                    color = if (item.checked) PurchasedGreen else WebText,
                    fontWeight = FontWeight.Bold,
                    textDecoration = if (item.checked) TextDecoration.LineThrough else TextDecoration.None,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(item.quantity, style = MaterialTheme.typography.bodySmall, color = WebMuted)
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
                        color = if (state == "failed" || state == "conflict") MaterialTheme.colorScheme.error else WebPrimary,
                    )
                }
            }
            if (item.pendingOperationType != "delete") {
                SquareHeaderButton(
                    contentDescription = "Editar ${item.name}",
                    background = WebLime,
                    contentColor = WebText,
                    onClick = { editing = true },
                ) {
                    Icon(Icons.Outlined.Edit, contentDescription = null, modifier = Modifier.size(18.dp))
                }
                SquareHeaderButton(
                    contentDescription = "Borrar ${item.name}",
                    background = Color(0xFFFFECE8),
                    contentColor = Color(0xFFB42318),
                    onClick = { onAction(ShoppingListAction.DeleteItem(item.id)) },
                ) {
                    Icon(Icons.Outlined.Close, contentDescription = null, modifier = Modifier.size(18.dp))
                }
            }
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
            Text("Tu cambio (v$localVersion): $localIntent", color = WebText, fontWeight = FontWeight.SemiBold)
            Text("Servidor (v${item.serverItemVersion ?: "?"}): $serverIntent", color = WebMuted)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(onClick = { onAction(ResolveConflict.UseServer(conflictOperationId)) }, colors = ButtonDefaults.textButtonColors(contentColor = WebPrimary)) { Text("Usar versión del servidor") }
                TextButton(onClick = { onAction(ResolveConflict.RetryLocal(conflictOperationId)) }, colors = ButtonDefaults.textButtonColors(contentColor = WebPrimary)) { Text("Reintentar mi cambio") }
            }
        }
    }
    if (editing) ItemNameDialog(
        title = "Editar producto",
        value = editedName,
        quantity = editedQuantity,
        accentColor = accentColor,
        checked = item.checked,
        onValueChange = { editedName = it },
        onQuantityDecrease = { if (editedQuantity > 1) editedQuantity-- },
        onQuantityIncrease = { editedQuantity++ },
        onConfirm = {
        if (editedName.isNotBlank()) onAction(ShoppingListAction.EditItem(item.id, editedName.trim(), editedQuantity.toDouble()))
        editing = false
    },
        onDismiss = { editing = false },
    )
}

private fun Boolean.checkedLabel(): String = if (this) "Comprado" else "Pendiente"

private fun String.quantityAsInt(): Int =
    substringBefore(" ")
        .replace(',', '.')
        .toDoubleOrNull()
        ?.toInt()
        ?.coerceAtLeast(1)
        ?: 1

@Composable
private fun ItemNameDialog(
    title: String,
    value: String,
    quantity: Int,
    accentColor: Color,
    checked: Boolean,
    onValueChange: (String) -> Unit,
    onQuantityDecrease: () -> Unit,
    onQuantityIncrease: () -> Unit,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    val actionTextColor = if (checked) Color.White else WebText
    AlertDialog(
        onDismissRequest = onDismiss,
        modifier = Modifier.border(2.dp, accentColor, MaterialTheme.shapes.large),
        shape = MaterialTheme.shapes.large,
        containerColor = WebSurface,
        title = { Text(title, color = WebText, fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                CompactInputBlock(label = "Nombre") {
                    CompactProductField(value, onValueChange, Modifier.fillMaxWidth())
                }
                CompactInputBlock(label = "Cantidad") {
                    QuantityStepper(
                        quantity = quantity,
                        onDecrease = onQuantityDecrease,
                        onIncrease = onQuantityIncrease,
                        modifier = Modifier.fillMaxWidth(),
                        accentColor = accentColor,
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = onConfirm,
                shape = MaterialTheme.shapes.medium,
                colors = ButtonDefaults.buttonColors(containerColor = accentColor, contentColor = actionTextColor),
            ) {
                Text("Guardar")
            }
        },
        dismissButton = {
            Button(
                onClick = onDismiss,
                shape = MaterialTheme.shapes.medium,
                colors = ButtonDefaults.buttonColors(containerColor = Color.White, contentColor = WebMuted),
            ) {
                Text("Cancelar")
            }
        },
    )
}

@Composable
private fun EmptyState(message: String) = Text(message, style = MaterialTheme.typography.bodyMedium, color = WebMuted, fontWeight = FontWeight.SemiBold)

private val EmptyListState = ShoppingListUiState("Compra semanal", emptyList(), emptyList(), false)

@Preview
@Composable
private fun ShoppingListPreview() = NFCompraTheme { ShoppingListScreen(EmptyListState, {}) }

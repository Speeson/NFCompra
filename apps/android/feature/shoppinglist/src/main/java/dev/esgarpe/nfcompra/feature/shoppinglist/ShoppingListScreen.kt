package dev.esgarpe.nfcompra.feature.shoppinglist

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.core.app.ActivityCompat
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.ListAlt
import androidx.compose.material.icons.outlined.Category
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.HomeWork
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material.icons.outlined.KeyboardArrowUp
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Logout
import androidx.compose.material.icons.outlined.Mic
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material.icons.outlined.Visibility
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
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathOperation
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.esgarpe.nfcompra.core.designsystem.BottomNavigationStylePreference
import dev.esgarpe.nfcompra.core.designsystem.NFCompraTheme
import dev.esgarpe.nfcompra.core.designsystem.NFCompraUiScaleProvider
import dev.esgarpe.nfcompra.core.designsystem.ThemePreference
import dev.esgarpe.nfcompra.core.designsystem.UiScalePreference
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.util.Locale
import kotlin.math.atan2
import kotlin.math.sqrt

private val GroceryPrimaryGradient = listOf(Color(0xFFAEDC81), Color(0xFF6CC51D))
private val GroceryPrimaryStrong = Color(0xFF6CC51D)
private val OnLime = Color(0xFF10271E)
private val OnLimeMuted = Color(0xFF1C7144)
@Immutable
private data class ShoppingScreenColors(
    val page: Color,
    val surface: Color,
    val text: Color,
    val muted: Color,
    val primary: Color,
    val lime: Color,
    val subtleSurface: Color,
    val border: Color,
    val pendingSurface: Color,
    val pendingAccent: Color,
    val checkedSurface: Color,
    val checkedAccent: Color,
    val purchasedGreen: Color,
    val household: Color,
    val householdSoft: Color,
    val householdBorder: Color,
)

private val LightShoppingScreenColors = ShoppingScreenColors(
    page = Color(0xFFF8FCF9),
    surface = Color.White,
    text = Color(0xFF10271E),
    muted = Color(0xFF527062),
    primary = Color(0xFF1C7144),
    lime = Color(0xFFDCFF72),
    subtleSurface = Color(0xFFF2F8F4),
    border = Color(0xFFCFE4D7),
    pendingSurface = Color(0xFFFFF7D7),
    pendingAccent = Color(0xFFFFC83D),
    checkedSurface = Color(0xFFFFE7E1),
    checkedAccent = Color(0xFFE2533F),
    purchasedGreen = Color(0xFF18864B),
    household = Color(0xFF7653C7),
    householdSoft = Color(0xFFF2EDFC),
    householdBorder = Color(0xFFD8CCF2),
)

private val DarkShoppingScreenColors = ShoppingScreenColors(
    page = Color(0xFF07130D),
    surface = Color(0xFF10231A),
    text = Color(0xFFEAF7EE),
    muted = Color(0xFFA6BDAF),
    primary = Color(0xFF89E5AE),
    lime = Color(0xFFC8F85A),
    subtleSurface = Color(0xFF183426),
    border = Color(0xFF2E5A42),
    pendingSurface = Color(0xFF342A0E),
    pendingAccent = Color(0xFFE9BE35),
    checkedSurface = Color(0xFF351C19),
    checkedAccent = Color(0xFFFF8A76),
    purchasedGreen = Color(0xFF72DBA9),
    household = Color(0xFFC3B2F5),
    householdSoft = Color(0xFF2A2440),
    householdBorder = Color(0xFF4A4170),
)

private val LocalShoppingScreenColors = staticCompositionLocalOf { LightShoppingScreenColors }
private val WebPage: Color @Composable get() = LocalShoppingScreenColors.current.page
private val WebSurface: Color @Composable get() = LocalShoppingScreenColors.current.surface
private val WebText: Color @Composable get() = LocalShoppingScreenColors.current.text
private val WebMuted: Color @Composable get() = LocalShoppingScreenColors.current.muted
private val WebPrimary: Color @Composable get() = LocalShoppingScreenColors.current.primary
private val WebLime: Color @Composable get() = LocalShoppingScreenColors.current.lime
private val WebSubtleSurface: Color @Composable get() = LocalShoppingScreenColors.current.subtleSurface
private val WebBorder: Color @Composable get() = LocalShoppingScreenColors.current.border
private val PendingSurface: Color @Composable get() = LocalShoppingScreenColors.current.pendingSurface
private val PendingAccent: Color @Composable get() = LocalShoppingScreenColors.current.pendingAccent
private val CheckedSurface: Color @Composable get() = LocalShoppingScreenColors.current.checkedSurface
private val CheckedAccent: Color @Composable get() = LocalShoppingScreenColors.current.checkedAccent
private val PurchasedGreen: Color @Composable get() = LocalShoppingScreenColors.current.purchasedGreen
private val WebHousehold: Color @Composable get() = LocalShoppingScreenColors.current.household
private val WebHouseholdSoft: Color @Composable get() = LocalShoppingScreenColors.current.householdSoft
private val WebHouseholdBorder: Color @Composable get() = LocalShoppingScreenColors.current.householdBorder
private val ProductEntryControlHeight = 52.dp
@Composable private fun screenTopPadding(): Dp = (LocalConfiguration.current.screenHeightDp * 0.02f).dp
@Composable private fun screenBottomPadding(): Dp = (LocalConfiguration.current.screenHeightDp * 0.03f).dp
@Composable private fun responsiveDp(fraction: Float): Dp = (LocalConfiguration.current.screenHeightDp * fraction).dp
@Composable private fun responsiveWidthDp(fraction: Float): Dp = (LocalConfiguration.current.screenWidthDp * fraction).dp
@Composable private fun bottomNavigationScrollReserve(): Dp = responsiveDp(0.105f)

@Composable
private fun LoadingLogoScreen() {
    val transition = rememberInfiniteTransition(label = "loading-logo")
    val rotation by transition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1_600, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "loading-ring-rotation",
    )
    val scale by transition.animateFloat(
        initialValue = 0.94f,
        targetValue = 1.05f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 900),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "loading-logo-pulse",
    )
    val pageColor = WebPage
    val primaryColor = WebPrimary
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(pageColor),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier.size(190.dp),
            contentAlignment = Alignment.Center,
        ) {
            Canvas(
                modifier = Modifier
                    .matchParentSize()
                    .graphicsLayer(rotationZ = rotation),
            ) {
                drawCircle(
                    color = primaryColor.copy(alpha = 0.16f),
                    radius = size.minDimension / 2.2f,
                    center = center,
                    style = Stroke(width = 10f),
                )
                drawArc(
                    color = GroceryPrimaryStrong,
                    startAngle = -90f,
                    sweepAngle = 92f,
                    useCenter = false,
                    topLeft = Offset(size.width * 0.08f, size.height * 0.08f),
                    size = Size(size.width * 0.84f, size.height * 0.84f),
                    style = Stroke(width = 12f),
                )
            }
            Image(
                painter = painterResource(R.drawable.nfcompra_logo),
                contentDescription = "Cargando NFCompra",
                modifier = Modifier
                    .size(126.dp)
                    .graphicsLayer(scaleX = scale, scaleY = scale)
                    .clip(MaterialTheme.shapes.extraLarge),
                contentScale = ContentScale.Fit,
            )
        }
    }
}

@Composable
fun ShoppingListApp(
    viewModel: ShoppingListViewModel,
    onLogout: () -> Unit = {},
    onMembers: (String) -> Unit = {},
    onOpenNotifications: (() -> Unit)? = null,
    pendingInvitationNotices: List<HouseholdInvitationNoticeUiModel> = emptyList(),
    invitationsLoading: Boolean = false,
    onAcceptInvitationNotice: (String) -> Unit = {},
    onRejectInvitationNotice: (String) -> Unit = {},
    currentUserId: String? = null,
    openListsRequestKey: Int = 0,
    biometricAccessEnabled: Boolean = false,
    biometricAccessMessage: String? = null,
    onBiometricAccessChange: ((Boolean) -> Unit)? = null,
    uiScalePreference: UiScalePreference = UiScalePreference.Default,
    onUiScalePreferenceChange: (UiScalePreference) -> Unit = {},
    bottomNavigationStylePreference: BottomNavigationStylePreference = BottomNavigationStylePreference.Default,
    onBottomNavigationStylePreferenceChange: (BottomNavigationStylePreference) -> Unit = {},
    themePreference: ThemePreference = ThemePreference.Default,
    onThemePreferenceChange: (ThemePreference) -> Unit = {},
) {
    val state by viewModel.state.collectAsState()
    LaunchedEffect(viewModel) { viewModel.load() }
    when (state) {
        ShoppingListViewState.Loading -> LoadingLogoScreen()
        ShoppingListViewState.NoHouseholds -> ShoppingListContent(
            emptyHouseholdsData(),
            viewModel::onAction,
            viewModel::searchProductCatalog,
            viewModel::setProductFavorite,
            viewModel::createProductCategory,
            viewModel::updateProductCategory,
            viewModel::deleteProductCategory,
            viewModel::createProductCatalogItem,
            viewModel::updateProductCatalogItem,
            viewModel::deleteProductCatalogItem,
            viewModel::updateProfile,
            viewModel::changePassword,
            viewModel::deleteAccount,
            viewModel::refreshProfile,
            viewModel::refreshProductCategories,
            viewModel::warmProductCatalog,
            viewModel::load,
            onLogout,
            onMembers,
            onOpenNotifications = onOpenNotifications,
            pendingInvitationNotices = pendingInvitationNotices,
            invitationsLoading = invitationsLoading,
            onAcceptInvitationNotice = onAcceptInvitationNotice,
            onRejectInvitationNotice = onRejectInvitationNotice,
            currentUserId = currentUserId,
            openListsRequestKey = openListsRequestKey,
            biometricAccessEnabled = biometricAccessEnabled,
            biometricAccessMessage = biometricAccessMessage,
            onBiometricAccessChange = onBiometricAccessChange,
            uiScalePreference = uiScalePreference,
            onUiScalePreferenceChange = onUiScalePreferenceChange,
            bottomNavigationStylePreference = bottomNavigationStylePreference,
            onBottomNavigationStylePreferenceChange = onBottomNavigationStylePreferenceChange,
            themePreference = themePreference,
            onThemePreferenceChange = onThemePreferenceChange,
        )
        is ShoppingListViewState.InitialHouseholdError -> {
            val error = state as ShoppingListViewState.InitialHouseholdError
            ShoppingListContent(
                emptyHouseholdsData(message = error.message, retryAction = error.retryAction),
                viewModel::onAction,
                viewModel::searchProductCatalog,
                viewModel::setProductFavorite,
                viewModel::createProductCategory,
                viewModel::updateProductCategory,
                viewModel::deleteProductCategory,
                viewModel::createProductCatalogItem,
                viewModel::updateProductCatalogItem,
                viewModel::deleteProductCatalogItem,
                viewModel::updateProfile,
                viewModel::changePassword,
                viewModel::deleteAccount,
                viewModel::refreshProfile,
                viewModel::refreshProductCategories,
                viewModel::warmProductCatalog,
                viewModel::load,
                onLogout,
                onMembers,
                onOpenNotifications = onOpenNotifications,
                pendingInvitationNotices = pendingInvitationNotices,
                invitationsLoading = invitationsLoading,
                onAcceptInvitationNotice = onAcceptInvitationNotice,
                onRejectInvitationNotice = onRejectInvitationNotice,
                currentUserId = currentUserId,
                openListsRequestKey = openListsRequestKey,
                biometricAccessEnabled = biometricAccessEnabled,
                biometricAccessMessage = biometricAccessMessage,
                onBiometricAccessChange = onBiometricAccessChange,
                uiScalePreference = uiScalePreference,
                onUiScalePreferenceChange = onUiScalePreferenceChange,
                bottomNavigationStylePreference = bottomNavigationStylePreference,
                onBottomNavigationStylePreferenceChange = onBottomNavigationStylePreferenceChange,
                themePreference = themePreference,
                onThemePreferenceChange = onThemePreferenceChange,
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
        is ShoppingListViewState.Data -> ShoppingListContent(
            state as ShoppingListViewState.Data,
            viewModel::onAction,
            viewModel::searchProductCatalog,
            viewModel::setProductFavorite,
            viewModel::createProductCategory,
            viewModel::updateProductCategory,
            viewModel::deleteProductCategory,
            viewModel::createProductCatalogItem,
            viewModel::updateProductCatalogItem,
            viewModel::deleteProductCatalogItem,
            viewModel::updateProfile,
            viewModel::changePassword,
            viewModel::deleteAccount,
            viewModel::refreshProfile,
            viewModel::refreshProductCategories,
            viewModel::warmProductCatalog,
            viewModel::load,
            onLogout,
            onMembers,
            onOpenNotifications = onOpenNotifications,
            pendingInvitationNotices = pendingInvitationNotices,
            invitationsLoading = invitationsLoading,
            onAcceptInvitationNotice = onAcceptInvitationNotice,
            onRejectInvitationNotice = onRejectInvitationNotice,
            currentUserId = currentUserId,
            openListsRequestKey = openListsRequestKey,
            biometricAccessEnabled = biometricAccessEnabled,
            biometricAccessMessage = biometricAccessMessage,
            onBiometricAccessChange = onBiometricAccessChange,
            uiScalePreference = uiScalePreference,
            onUiScalePreferenceChange = onUiScalePreferenceChange,
            bottomNavigationStylePreference = bottomNavigationStylePreference,
            onBottomNavigationStylePreferenceChange = onBottomNavigationStylePreferenceChange,
            themePreference = themePreference,
            onThemePreferenceChange = onThemePreferenceChange,
        )
    }
}

@Composable
internal fun ShoppingListContent(
    data: ShoppingListViewState.Data,
    onAction: (ShoppingListAction) -> Unit,
    onSearchProducts: suspend (String, Int) -> List<ProductCatalogUiModel> = { _, _ -> emptyList() },
    onSetProductFavorite: suspend (String, Boolean) -> ProductCatalogUiModel? = { _, _ -> null },
    onCreateProductCategory: suspend (String, String) -> ProductCategoryUiModel? = { _, _ -> null },
    onUpdateProductCategory: suspend (ProductCategoryUiModel, String, String) -> ProductCategoryUiModel? = { _, _, _ -> null },
    onDeleteProductCategory: suspend (ProductCategoryUiModel) -> Boolean = { false },
    onCreateProduct: suspend (String, String?, String, String?, String?) -> ProductCatalogUiModel? = { _, _, _, _, _ -> null },
    onUpdateProduct: suspend (ProductCatalogUiModel, String, String?, String, String?, String?) -> ProductCatalogUiModel? = { _, _, _, _, _, _ -> null },
    onDeleteProduct: suspend (ProductCatalogUiModel) -> Boolean = { false },
    onUpdateProfile: suspend (String?, String?, String?) -> ProfileUiModel? = { _, _, _ -> null },
    onChangePassword: suspend (String, String) -> Boolean = { _, _ -> false },
    onDeleteAccount: suspend (String) -> Boolean = { false },
    onRefreshProfile: () -> Unit = {},
    onRefreshProductCategories: () -> Unit = {},
    onWarmProductCatalog: () -> Unit = {},
    onReloadHouseholds: () -> Unit = {},
    onLogout: () -> Unit,
    onMembers: (String) -> Unit,
    onOpenNotifications: (() -> Unit)? = null,
    pendingInvitationNotices: List<HouseholdInvitationNoticeUiModel> = emptyList(),
    invitationsLoading: Boolean = false,
    onAcceptInvitationNotice: (String) -> Unit = {},
    onRejectInvitationNotice: (String) -> Unit = {},
    currentUserId: String? = null,
    openListsRequestKey: Int = 0,
    biometricAccessEnabled: Boolean = false,
    biometricAccessMessage: String? = null,
    onBiometricAccessChange: ((Boolean) -> Unit)? = null,
    uiScalePreference: UiScalePreference = UiScalePreference.Default,
    onUiScalePreferenceChange: (UiScalePreference) -> Unit = {},
    bottomNavigationStylePreference: BottomNavigationStylePreference = BottomNavigationStylePreference.Default,
    onBottomNavigationStylePreferenceChange: (BottomNavigationStylePreference) -> Unit = {},
    themePreference: ThemePreference = ThemePreference.Default,
    onThemePreferenceChange: (ThemePreference) -> Unit = {},
) {
    var selectedTab by remember { mutableStateOf(DashboardTab.Home) }
    var creatingHousehold by remember { mutableStateOf(false) }
    var creatingList by remember { mutableStateOf(false) }
    var renamingList by remember { mutableStateOf(false) }
    var deletingList by remember { mutableStateOf(false) }
    var notificationsOpen by remember { mutableStateOf(false) }
    var openedListId by remember { mutableStateOf<String?>(null) }
    var openedListMode by remember { mutableStateOf(ListOpenMode.Edit) }
    var catalogNested by remember { mutableStateOf(false) }
    var catalogRootRequestKey by remember { mutableStateOf(0) }
    var householdsRootRequestKey by remember { mutableStateOf(0) }
    var navigationMessage by remember { mutableStateOf<String?>(null) }
    var pendingOpenHouseholdId by remember { mutableStateOf<String?>(null) }
    var listTabReloadRequested by remember { mutableStateOf(false) }
    val isAdmin = data.profile?.role == "admin"
    val canManageCatalog = isAdmin || data.selectedHouseholdId != null
    LaunchedEffect(Unit) { onRefreshProfile() }
    LaunchedEffect(openListsRequestKey) {
        if (openListsRequestKey > 0) {
            selectedTab = DashboardTab.Lists
            openedListId = null
        }
    }
    val context = LocalContext.current
    val pinnedPreferences = remember(context) {
        context.getSharedPreferences("nfcompra.ui", Context.MODE_PRIVATE)
    }
    var pinnedListId by remember(pinnedPreferences) {
        mutableStateOf(pinnedPreferences.getString("pinned_list_id", null))
    }
    var displayName by remember(pinnedPreferences) {
        mutableStateOf(pinnedPreferences.getString("display_name", null) ?: "usuario")
    }
    LaunchedEffect(data.displayName) {
        data.displayName?.takeIf { it.isNotBlank() }?.let { resolvedName ->
            displayName = resolvedName
            pinnedPreferences.edit().putString("display_name", resolvedName).apply()
        }
    }
    LaunchedEffect(selectedTab, data.productCategories.isEmpty()) {
        if (selectedTab == DashboardTab.Catalog) {
            if (data.productCategories.isEmpty()) onRefreshProductCategories()
            onWarmProductCatalog()
        }
    }
    val togglePinnedList: (String) -> Unit = { listId ->
        val next = if (pinnedListId == listId) null else listId
        pinnedListId = next
        pinnedPreferences.edit().apply {
            if (next == null) remove("pinned_list_id") else putString("pinned_list_id", next)
        }.apply()
    }
    val hasHouseholds = data.households.isNotEmpty()
    LaunchedEffect(hasHouseholds) {
        if (hasHouseholds) {
            listTabReloadRequested = false
        }
    }
    val isListDetailOpen = selectedTab == DashboardTab.Lists && data.selectedListId != null && openedListId == data.selectedListId
    val selectedListHouseholdName = data.lists.firstOrNull { it.id == data.selectedListId }
        ?.let { selectedList -> data.households.firstOrNull { it.id == selectedList.householdId }?.name }
        ?: data.households.firstOrNull { it.id == data.selectedHouseholdId }?.name
        ?: "hogar"
    LaunchedEffect(isListDetailOpen, data.productCategories.isEmpty()) {
        if (isListDetailOpen) {
            if (data.productCategories.isEmpty()) onRefreshProductCategories()
            onWarmProductCatalog()
        }
    }
    val isRoot = selectedTab == DashboardTab.Home && !isListDetailOpen
    var lastBackPressMs by remember { mutableStateOf(0L) }
    LaunchedEffect(lastBackPressMs) {
        if (lastBackPressMs > 0) {
            delay(2_000)
            lastBackPressMs = 0L
        }
    }
    val shouldInterceptBack = !isRoot || lastBackPressMs == 0L || System.currentTimeMillis() - lastBackPressMs >= 2_000
    fun openTabRoot(tab: DashboardTab) {
        if (tab == DashboardTab.Lists && !hasHouseholds) {
            openedListId = null
            selectedTab = DashboardTab.Lists
            if (!listTabReloadRequested) {
                listTabReloadRequested = true
                onReloadHouseholds()
            } else {
                navigationMessage = "Necesitas pertenecer a un hogar para acceder a tus listas."
            }
            return
        }
        selectedTab = tab
        when (tab) {
            DashboardTab.Home -> {
                openedListId = null
            }
            DashboardTab.Households -> {
                openedListId = null
                householdsRootRequestKey++
            }
            DashboardTab.Lists -> {
                openedListId = null
            }
            DashboardTab.Catalog -> {
                openedListId = null
                catalogRootRequestKey++
            }
            DashboardTab.Profile -> {
                openedListId = null
            }
        }
    }
    LaunchedEffect(data.selectedHouseholdId, pendingOpenHouseholdId) {
        if (pendingOpenHouseholdId != null && data.selectedHouseholdId == pendingOpenHouseholdId) {
            pendingOpenHouseholdId = null
            openTabRoot(DashboardTab.Lists)
        }
    }
    BackHandler(enabled = shouldInterceptBack) {
        if (!isRoot) {
            if (isListDetailOpen) {
                openedListId = null
            } else if (selectedTab == DashboardTab.Catalog && catalogNested) {
                catalogRootRequestKey++
            } else {
                selectedTab = DashboardTab.Home
            }
        } else {
            lastBackPressMs = System.currentTimeMillis()
            Toast.makeText(context, "Pulsa de nuevo atrás para salir", Toast.LENGTH_SHORT).show()
        }
    }

    fun openHouseholdRoot(householdId: String) {
        pendingOpenHouseholdId = householdId
        onAction(ShoppingListAction.SelectHousehold(householdId))
    }

    val contentBottomPadding = when (bottomNavigationStylePreference) {
        BottomNavigationStylePreference.Original -> responsiveDp(0.055f)
        BottomNavigationStylePreference.NavBar -> responsiveDp(0.055f)
    }
    val shoppingColors = if (MaterialTheme.colorScheme.background.luminance() < 0.5f) {
        DarkShoppingScreenColors
    } else {
        LightShoppingScreenColors
    }
    CompositionLocalProvider(LocalShoppingScreenColors provides shoppingColors) {
    Box(modifier = Modifier.fillMaxSize().background(Brush.linearGradient(GroceryPrimaryGradient))) {
        Column(modifier = Modifier.fillMaxSize().statusBarsPadding().background(WebPage).padding(bottom = contentBottomPadding)) {
            ShoppingAppBanner(
                title = if (isListDetailOpen) data.content.title else selectedTabLabel(selectedTab),
                subtitle = if (isListDetailOpen) selectedListHouseholdName else null,
                onTitleEdit = if (isListDetailOpen && openedListMode == ListOpenMode.Edit) ({ renamingList = true }) else null,
                showBack = selectedTab != DashboardTab.Home || isListDetailOpen,
                onBack = {
                    if (isListDetailOpen) {
                        openedListId = null
                    } else if (selectedTab == DashboardTab.Catalog && catalogNested) {
                        catalogRootRequestKey++
                    } else {
                        selectedTab = DashboardTab.Home
                    }
                },
                onOpenNotifications = onOpenNotifications,
            )

            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .background(WebPage),
            ) {
                CompositionLocalProvider(LocalContentColor provides WebText) {
                    data.message?.let {
                        Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(horizontal = responsiveWidthDp(0.051f)))
                    }
                    data.conflict?.let { current ->
                        Row(modifier = Modifier.padding(horizontal = responsiveWidthDp(0.051f)), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("El producto ha cambiado: ${current.name}", color = WebText)
                            TextButton(onClick = { onAction(ShoppingListAction.RetryConflict) }, colors = ButtonDefaults.textButtonColors(contentColor = WebPrimary)) { Text("Reintentar") }
                        }
                    }

                    if (isListDetailOpen) {
                        ShoppingListScreen(
                            state = data.content,
                            onAction = onAction,
                            onSearchProducts = onSearchProducts,
                            onSetProductFavorite = onSetProductFavorite,
                            categories = data.productCategories,
                            onCreateProduct = onCreateProduct,
                            canCreateProduct = data.selectedHouseholdId != null,
                            readOnly = openedListMode == ListOpenMode.View,
                            onRename = { renamingList = true },
                            onClearChecked = { onAction(ShoppingListAction.ClearSelectedList) },
                            onDelete = { deletingList = true },
                        )
                    } else {
                        when (selectedTab) {
                            DashboardTab.Home -> DashboardHome(
                                data,
                                onAction,
                                { creatingHousehold = true },
                                { creatingList = true },
                                displayName = data.displayName ?: displayName,
                                pinnedListId = pinnedListId,
                                onTogglePinned = togglePinnedList,
                                onOpenHouseholds = { openTabRoot(DashboardTab.Households) },
                                onOpenLists = { openTabRoot(DashboardTab.Lists) },
                                pendingInvitationNotices = pendingInvitationNotices,
                                invitationsLoading = invitationsLoading,
                                onOpenInvitations = { onOpenNotifications?.invoke() },
                                onAcceptInvitation = onAcceptInvitationNotice,
                                onRejectInvitation = onRejectInvitationNotice,
                                onOpenHousehold = ::openHouseholdRoot,
                                onEditList = { listId ->
                                    openedListMode = ListOpenMode.Edit
                                    openedListId = listId
                                    selectedTab = DashboardTab.Lists
                                },
                                onViewList = { listId ->
                                    openedListMode = ListOpenMode.View
                                    openedListId = listId
                                    selectedTab = DashboardTab.Lists
                                },
                            )
                            DashboardTab.Households -> HouseholdsPanel(data, onAction, { creatingHousehold = true }, onMembers, onOpenHousehold = ::openHouseholdRoot, currentUserId = currentUserId, rootRequestKey = householdsRootRequestKey)
                            DashboardTab.Lists -> ListsPanel(
                                data,
                                onAction,
                                { creatingList = true },
                                onEditList = { listId ->
                                    openedListMode = ListOpenMode.Edit
                                    openedListId = listId
                                },
                                onViewList = { listId ->
                                    openedListMode = ListOpenMode.View
                                    openedListId = listId
                                },
                                onDeleteList = { listId ->
                                    onAction(ShoppingListAction.SelectList(listId))
                                    deletingList = true
                                },
                                pinnedListId = pinnedListId,
                                onTogglePinned = togglePinnedList,
                            )
                            DashboardTab.Catalog -> CatalogPanel(
                                categories = data.productCategories,
                                onSearchProducts = onSearchProducts,
                                onSetProductFavorite = onSetProductFavorite,
                                onCreateProductCategory = onCreateProductCategory,
                                onUpdateProductCategory = onUpdateProductCategory,
                                onDeleteProductCategory = onDeleteProductCategory,
                                onCreateProduct = onCreateProduct,
                                onUpdateProduct = onUpdateProduct,
                                onDeleteProduct = onDeleteProduct,
                                canManageCatalog = canManageCatalog,
                                rootRequestKey = catalogRootRequestKey,
                                onNestedStateChange = { catalogNested = it },
                            )
                            DashboardTab.Profile -> ProfilePanel(
                                profile = data.profile,
                                displayName = displayName,
                                onUpdateProfile = onUpdateProfile,
                                onChangePassword = onChangePassword,
                                onDeleteAccount = onDeleteAccount,
                                onRefreshProfile = onRefreshProfile,
                                onLogout = onLogout,
                                biometricAccessEnabled = biometricAccessEnabled,
                                biometricAccessMessage = biometricAccessMessage,
                                onBiometricAccessChange = onBiometricAccessChange,
                                uiScalePreference = uiScalePreference,
                                onUiScalePreferenceChange = onUiScalePreferenceChange,
                                bottomNavigationStylePreference = bottomNavigationStylePreference,
                                onBottomNavigationStylePreferenceChange = onBottomNavigationStylePreferenceChange,
                                themePreference = themePreference,
                                onThemePreferenceChange = onThemePreferenceChange,
                            )
                        }
                    }
                }
            }
        }

        Box(modifier = Modifier.align(Alignment.BottomCenter)) {
            DashboardBottomNavigation(
                selected = selectedTab,
                onSelect = ::openTabRoot,
                style = bottomNavigationStylePreference,
            )
        }
    }

    if (creatingHousehold) CreateEntityDialog("Crear hogar", "Nombre del hogar", confirmText = "Crear hogar", onConfirm = {
        onAction(ShoppingListAction.CreateHousehold(it))
        creatingHousehold = false
    }) { creatingHousehold = false }
    if (creatingList && hasHouseholds) CreateListDialog(
        households = data.households,
        selectedHouseholdId = data.selectedHouseholdId,
        onConfirm = { householdId, name ->
            onAction(ShoppingListAction.CreateList(householdId, name))
            creatingList = false
        },
        onDismiss = { creatingList = false },
    )
    navigationMessage?.let { message ->
        AlertDialog(
            onDismissRequest = { navigationMessage = null },
            containerColor = WebSurface,
            title = { DialogTitle("Sin hogar activo") },
            text = { Text(message, color = WebMuted, fontWeight = FontWeight.SemiBold) },
            confirmButton = {
                Button(onClick = { navigationMessage = null }, shape = MaterialTheme.shapes.medium, colors = webPrimaryButtonColors()) {
                    Text("Entendido")
                }
            },
        )
    }
    if (renamingList) CreateEntityDialog("Renombrar lista", "Nuevo nombre de la lista", confirmText = "Guardar", onConfirm = {
        onAction(ShoppingListAction.RenameList(it))
        renamingList = false
    }) { renamingList = false }
    if (deletingList) ConfirmDialog("Eliminar lista", "Se eliminará esta lista y sus productos.", {
        onAction(ShoppingListAction.DeleteSelectedList)
        deletingList = false
    }) { deletingList = false }
}
}

private enum class DashboardTab { Home, Households, Lists, Catalog, Profile }

private fun selectedTabLabel(tab: DashboardTab): String = when (tab) {
    DashboardTab.Home -> "Inicio"
    DashboardTab.Households -> "Hogares"
    DashboardTab.Lists -> "Listas"
    DashboardTab.Catalog -> "Catálogo"
    DashboardTab.Profile -> "Perfil"
}

private fun selectedTabIcon(tab: DashboardTab): ImageVector = when (tab) {
    DashboardTab.Home -> Icons.Outlined.Home
    DashboardTab.Households -> Icons.Outlined.HomeWork
    DashboardTab.Lists -> Icons.AutoMirrored.Outlined.ListAlt
    DashboardTab.Catalog -> Icons.Outlined.Category
    DashboardTab.Profile -> Icons.Outlined.Person
}

private enum class ListOpenMode { Edit, View }

@Immutable
private data class DashboardNavBarColors(
    val bubble: Color,
    val bubbleIcon: Color,
    val active: Color,
    val inactive: Color,
    val shadow: Color,
)

@Composable
private fun ShoppingAppBanner(
    title: String,
    subtitle: String? = null,
    onTitleEdit: (() -> Unit)? = null,
    showBack: Boolean,
    onBack: () -> Unit,
    onOpenNotifications: (() -> Unit)? = null,
) {
    val isDetailTitle = subtitle != null || onTitleEdit != null
    val bannerH = if (isDetailTitle) responsiveDp(0.081f) else responsiveDp(0.067f)
    val bannerPadding = responsiveWidthDp(0.051f)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(bannerH)
            .background(
                Brush.linearGradient(
                    colors = GroceryPrimaryGradient,
                ),
            )
            .padding(horizontal = bannerPadding),
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
                onClick = { onOpenNotifications?.invoke() },
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
        }
    }
}

@Composable
private fun DashboardBottomNavigation(
    selected: DashboardTab,
    onSelect: (DashboardTab) -> Unit,
    style: BottomNavigationStylePreference,
) {
    when (style) {
        BottomNavigationStylePreference.Original -> FloatingDashboardNavigation(selected, onSelect)
        BottomNavigationStylePreference.NavBar -> NotchedDashboardNavigation(selected, onSelect)
    }
}

@Composable
private fun FloatingDashboardNavigation(selected: DashboardTab, onSelect: (DashboardTab) -> Unit) {
    val navItems = enumValues<DashboardTab>().toList()
    val selectedIndex = navItems.indexOf(selected).coerceAtLeast(0)
    val selectedContentDescription = selectedTabLabel(selected) + " seleccionado"
    val navH = responsiveDp(0.114f)
    val barH = responsiveDp(0.081f)
    val bubbleSz = responsiveDp(0.076f)
    val iconSz = responsiveDp(0.030f)
    val navPad = responsiveWidthDp(0.041f)
    BoxWithConstraints(
        modifier = Modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .height(navH)
            .padding(start = navPad, end = navPad, bottom = responsiveDp(0.010f))
            .semantics { contentDescription = "Menú inferior principal" },
    ) {
        val itemWidth = maxWidth / navItems.size
        val bubbleSize = bubbleSz
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
                .height(barH)
                .shadow(18.dp, shape = MaterialTheme.shapes.extraLarge, clip = false)
                .clip(MaterialTheme.shapes.extraLarge)
                .background(Brush.linearGradient(GroceryPrimaryGradient)),
        )

        Row(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .height(barH),
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
                .semantics { contentDescription = selectedContentDescription },
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = selectedTabIcon(selected),
                contentDescription = null,
                tint = GroceryPrimaryStrong,
                modifier = Modifier.size(iconSz),
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
                    imageVector = selectedTabIcon(tab),
                    contentDescription = null,
                    tint = inactiveColor,
                    modifier = Modifier.size(22.dp),
                )
            }
        }
        Text(
            text = selectedTabLabel(tab),
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
    displayName: String,
    pinnedListId: String?,
    onTogglePinned: (String) -> Unit,
    onOpenHouseholds: () -> Unit,
    onOpenLists: () -> Unit,
    pendingInvitationNotices: List<HouseholdInvitationNoticeUiModel> = emptyList(),
    invitationsLoading: Boolean = false,
    onOpenInvitations: () -> Unit = {},
    onAcceptInvitation: (String) -> Unit = {},
    onRejectInvitation: (String) -> Unit = {},
    onOpenHousehold: (String) -> Unit,
    onEditList: (String) -> Unit,
    onViewList: (String) -> Unit,
) {
    if (data.households.isEmpty()) {
        ZeroHouseholdsHome(
            displayName = displayName,
            invitations = pendingInvitationNotices,
            invitationsLoading = invitationsLoading,
            onCreateHousehold = onCreateHousehold,
            onOpenInvitations = onOpenInvitations,
            onAcceptInvitation = onAcceptInvitation,
            onRejectInvitation = onRejectInvitation,
        )
        return
    }
    val selectedList = data.lists.firstOrNull { it.id == data.selectedListId } ?: data.lists.firstOrNull()
    val selectedHousehold = selectedList?.let { list -> data.households.firstOrNull { it.id == list.householdId } }
    val pinnedList = pinnedListId?.let { id -> data.lists.firstOrNull { it.id == id } }
    val pinnedHousehold = pinnedList?.let { list -> data.households.firstOrNull { it.id == list.householdId } }
    val pendingCount = data.content.pending.size
    val checkedCount = data.content.checked.size
    val sectionGap = responsiveDp(0.019f)
    val innerGap = responsiveDp(0.012f)
    val horPad = responsiveWidthDp(0.051f)
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(WebPage)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = horPad)
            .padding(top = screenTopPadding(), bottom = screenBottomPadding()),
        verticalArrangement = Arrangement.spacedBy(sectionGap),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(innerGap)) {
            Text("Hola, $displayName", style = MaterialTheme.typography.headlineSmall, color = WebText, fontWeight = FontWeight.Bold)
            SectionTitle("Acciones rápidas")
            Row(horizontalArrangement = Arrangement.spacedBy(innerGap), modifier = Modifier.fillMaxWidth()) {
                Button(onClick = onCreateHousehold, modifier = Modifier.weight(1f), shape = MaterialTheme.shapes.medium, colors = webPrimaryButtonColors()) { Text("Crear hogar") }
                Button(onClick = onCreateList, modifier = Modifier.weight(1f), shape = MaterialTheme.shapes.medium, colors = webLimeButtonColors()) { Text("Crear lista") }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(innerGap), modifier = Modifier.fillMaxWidth()) {
            CompactMetricCard("Hogares", data.households.size.toString(), Modifier.weight(1f), onClick = onOpenHouseholds)
            CompactMetricCard("Listas", data.lists.size.toString(), Modifier.weight(1f), onClick = onOpenLists)
            PinnedListMetricCard(
                list = pinnedList,
                householdName = pinnedHousehold?.name.orEmpty(),
                modifier = Modifier.weight(1f),
                onClick = {
                    pinnedList?.let {
                        onAction(ShoppingListAction.SelectList(it.id))
                        onViewList(it.id)
                    }
                },
            )
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
                pinned = selectedList.id == pinnedListId,
                onTogglePinned = { onTogglePinned(selectedList.id) },
                onEdit = {
                    onAction(ShoppingListAction.SelectList(selectedList.id))
                    onEditList(selectedList.id)
                },
                onView = {
                    onAction(ShoppingListAction.SelectList(selectedList.id))
                    onViewList(selectedList.id)
                },
            )
        }
        SectionTitle("Tus hogares")
        data.households.take(3).forEach { household ->
            HouseholdCard(
                household = household,
                listCount = data.lists.count { it.householdId == household.id },
                selected = household.id == data.selectedHouseholdId,
                onOpen = { onOpenHousehold(household.id) },
                onOpenLists = { onOpenHousehold(household.id) },
            )
        }
        SectionTitle("Listas recientes")
        if (data.lists.isEmpty()) EmptyListForHousehold(onCreateList)
        data.lists.take(3).forEach { list ->
            ShoppingListSummaryCard(
                list,
                data.households.firstOrNull { it.id == list.householdId }?.name.orEmpty(),
                list.id == data.selectedListId,
                pinned = list.id == pinnedListId,
                onTogglePinned = { onTogglePinned(list.id) },
                onEdit = {
                    onAction(ShoppingListAction.SelectList(list.id))
                    onEditList(list.id)
                },
                onView = {
                    onAction(ShoppingListAction.SelectList(list.id))
                    onViewList(list.id)
                },
            )
        }
        Spacer(modifier = Modifier.height(bottomNavigationScrollReserve()))
    }
}

@Composable
private fun HouseholdsPanel(
    data: ShoppingListViewState.Data,
    onAction: (ShoppingListAction) -> Unit,
    onCreateHousehold: () -> Unit,
    onMembers: (String) -> Unit,
    onOpenHousehold: (String) -> Unit = {},
    currentUserId: String? = null,
    rootRequestKey: Int = 0,
) {
    var expandedHouseholdId by remember(data.households, rootRequestKey) { mutableStateOf<String?>(null) }
    var renamingHousehold by remember { mutableStateOf<HouseholdUiModel?>(null) }
    var deletingHousehold by remember { mutableStateOf<HouseholdUiModel?>(null) }
    var nfcHousehold by remember { mutableStateOf<HouseholdUiModel?>(null) }
    val visibleHouseholds = expandedHouseholdId?.let { id -> data.households.filter { it.id == id } } ?: data.households
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(WebPage)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = responsiveWidthDp(0.051f))
            .padding(top = screenTopPadding(), bottom = screenBottomPadding()),
        verticalArrangement = Arrangement.spacedBy(responsiveDp(0.014f)),
    ) {
        Button(
            onClick = onCreateHousehold,
            modifier = Modifier.fillMaxWidth().height(responsiveDp(0.060f)),
            shape = MaterialTheme.shapes.medium,
            colors = webPrimaryButtonColors(),
        ) {
            Text("+  Crear hogar", fontWeight = FontWeight.Bold)
        }
        SeparatorTitle("Gestiona tus hogares")
        visibleHouseholds.forEach { household ->
            val listCount = data.lists.count { it.householdId == household.id }
            val expanded = household.id == expandedHouseholdId
            HouseholdCard(
                household = household,
                listCount = listCount,
                selected = household.id == data.selectedHouseholdId,
                isOwner = currentUserId != null && household.ownerId == currentUserId,
                expanded = expanded,
                onToggleExpanded = {
                    expandedHouseholdId = if (expanded) null else household.id
                },
                onOpen = { onOpenHousehold(household.id) },
                onOpenLists = { onOpenHousehold(household.id) },
                onRename = { renamingHousehold = household },
                onDelete = { deletingHousehold = household },
                onMembers = { onMembers(household.id) },
                onNfcCode = { nfcHousehold = household },
                onLeave = { onAction(ShoppingListAction.LeaveHousehold(household.id)) },
            )
        }
        Spacer(modifier = Modifier.height(bottomNavigationScrollReserve()))
    }
    renamingHousehold?.let { household ->
        CreateEntityDialog(
            title = "Renombrar hogar",
            label = "Nuevo nombre del hogar",
            confirmText = "Guardar",
            onConfirm = { name ->
                onAction(ShoppingListAction.RenameHousehold(household.id, name))
                renamingHousehold = null
            },
            onDismiss = { renamingHousehold = null },
        )
    }
    deletingHousehold?.let { household ->
        ConfirmDialog(
            title = "Eliminar hogar",
            message = "Se eliminará ${household.name}, sus listas y sus productos.",
            onConfirm = {
                onAction(ShoppingListAction.DeleteHousehold(household.id))
                deletingHousehold = null
                if (expandedHouseholdId == household.id) expandedHouseholdId = null
            },
            onDismiss = { deletingHousehold = null },
        )
    }
    nfcHousehold?.let { household ->
        NfcCodeDialog(
            household = household,
            onDismiss = { nfcHousehold = null },
        )
    }
}

@Composable
private fun ListsPanel(
    data: ShoppingListViewState.Data,
    onAction: (ShoppingListAction) -> Unit,
    onCreateList: () -> Unit,
    onEditList: (String) -> Unit,
    onViewList: (String) -> Unit,
    onDeleteList: (String) -> Unit,
    pinnedListId: String?,
    onTogglePinned: (String) -> Unit,
) {
    val selectedHousehold = data.households.firstOrNull { it.id == data.selectedHouseholdId }
    if (selectedHousehold == null) {
        HouseholdRequiredPanel()
        return
    }
    val householdName = selectedHousehold.name
    val filteredLists = data.lists.filter { it.householdId == selectedHousehold.id }
    val totalLists = filteredLists.size
    val allMetrics = filteredLists.mapNotNull { data.listMetrics[it.id] }
    val totalPending = allMetrics.sumOf { it.pendingCount }
    val totalChecked = allMetrics.sumOf { it.checkedCount }
    val sectionGap = responsiveDp(0.019f)
    val innerGap = responsiveDp(0.012f)
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(WebPage)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = responsiveWidthDp(0.051f))
            .padding(top = screenTopPadding(), bottom = screenBottomPadding()),
        verticalArrangement = Arrangement.spacedBy(sectionGap),
    ) {
        Card(
            colors = CardDefaults.cardColors(containerColor = WebSurface),
            elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        ) {
            Column(modifier = Modifier.fillMaxWidth().padding(sectionGap), verticalArrangement = Arrangement.spacedBy(innerGap)) {
                Text(householdName, style = MaterialTheme.typography.headlineSmall, color = WebText, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
                Button(onClick = onCreateList, modifier = Modifier.fillMaxWidth(), shape = MaterialTheme.shapes.medium, colors = webPrimaryButtonColors()) { Text("Crear lista") }
            }
        }
        if (filteredLists.isNotEmpty()) {
            Row(horizontalArrangement = Arrangement.spacedBy(innerGap), modifier = Modifier.fillMaxWidth()) {
                CompactMetricCard("Listas", totalLists.toString(), Modifier.weight(1f))
                CompactMetricCard("Pendientes", totalPending.toString(), Modifier.weight(1f))
                CompactMetricCard("Comprados", totalChecked.toString(), Modifier.weight(1f))
            }
        }
        if (filteredLists.isEmpty()) EmptyListForHousehold(onCreateList)
        else {
            filteredLists.chunked(2).forEach { rowLists ->
                Row(horizontalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.fillMaxWidth()) {
                    rowLists.forEach { list ->
                        val metrics = data.listMetrics[list.id]
                        ShoppingListGridCard(
                            list = list,
                            selected = list.id == data.selectedListId,
                            pendingCount = metrics?.pendingCount,
                            checkedCount = metrics?.checkedCount,
                            pinned = list.id == pinnedListId,
                            modifier = Modifier.weight(1f),
                            onTogglePinned = { onTogglePinned(list.id) },
                            onEdit = {
                                onAction(ShoppingListAction.SelectList(list.id))
                                onEditList(list.id)
                            },
                            onView = {
                                onAction(ShoppingListAction.SelectList(list.id))
                                onViewList(list.id)
                            },
                            onDelete = { onDeleteList(list.id) },
                        )
                    }
                    if (rowLists.size == 1) Box(modifier = Modifier.weight(1f))
                }
            }
        }
        Spacer(modifier = Modifier.height(bottomNavigationScrollReserve()))
    }
}

@Composable
private fun CatalogPanel(
    categories: List<ProductCategoryUiModel>,
    onSearchProducts: suspend (String, Int) -> List<ProductCatalogUiModel>,
    onSetProductFavorite: suspend (String, Boolean) -> ProductCatalogUiModel?,
    onCreateProductCategory: suspend (String, String) -> ProductCategoryUiModel?,
    onUpdateProductCategory: suspend (ProductCategoryUiModel, String, String) -> ProductCategoryUiModel?,
    onDeleteProductCategory: suspend (ProductCategoryUiModel) -> Boolean,
    onCreateProduct: suspend (String, String?, String, String?, String?) -> ProductCatalogUiModel?,
    onUpdateProduct: suspend (ProductCatalogUiModel, String, String?, String, String?, String?) -> ProductCatalogUiModel?,
    onDeleteProduct: suspend (ProductCatalogUiModel) -> Boolean,
    canManageCatalog: Boolean = false,
    rootRequestKey: Int = 0,
    onNestedStateChange: (Boolean) -> Unit = {},
) {
    var search by remember { mutableStateOf("") }
    var selectedCategory by remember { mutableStateOf<ProductCategoryUiModel?>(null) }
    var selectedFilter by remember { mutableStateOf(CatalogSearchFilter.All) }
    var filterDialogOpen by remember { mutableStateOf(false) }
    var createDialogOpen by remember { mutableStateOf(false) }
    var editingCategory by remember { mutableStateOf<ProductCategoryUiModel?>(null) }
    var editingProduct by remember { mutableStateOf<ProductCatalogUiModel?>(null) }
    var categoryActionsOpen by remember { mutableStateOf(false) }
    var deleteCategory by remember { mutableStateOf<ProductCategoryUiModel?>(null) }
    var deleteProduct by remember { mutableStateOf<ProductCatalogUiModel?>(null) }
    var products by remember { mutableStateOf(emptyList<ProductCatalogUiModel>()) }
    var loading by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var searchGeneration by remember { mutableStateOf(0) }
    var searchJob by remember { mutableStateOf<Job?>(null) }
    val scope = rememberCoroutineScope()

    fun applyFilters(
        source: List<ProductCatalogUiModel>,
        category: ProductCategoryUiModel? = selectedCategory,
        filter: CatalogSearchFilter = selectedFilter,
    ): List<ProductCatalogUiModel> {
        val categoryName = category?.name?.normalizedUiSearch()
        return source.filter { product ->
            val productCategory = product.categoryName?.normalizedUiSearch()
            val matchesSelectedCategory = when {
                category == null -> true
                category.isFavorite -> product.isFavorite
                else -> productCategory == categoryName
            }
            val matchesSelectedFilter = when (filter) {
                CatalogSearchFilter.All -> true
                CatalogSearchFilter.Favorites -> product.isFavorite
                CatalogSearchFilter.Category -> category == null || productCategory == categoryName
            }
            matchesSelectedCategory && matchesSelectedFilter
        }
    }

    fun loadProducts(query: String = search, category: ProductCategoryUiModel? = selectedCategory) {
        val cleanQuery = query.trim()
        if (cleanQuery.length < 3 && category == null) {
            searchJob?.cancel()
            searchJob = null
            searchGeneration++
            products = emptyList()
            message = null
            loading = false
            return
        }
        val generation = ++searchGeneration
        searchJob?.cancel()
        searchJob = scope.launch {
            loading = true
            message = null
            try {
                val lookup = cleanQuery.ifBlank { if (category?.isFavorite == true) "" else category?.name.orEmpty() }
                val result = onSearchProducts(lookup, 30)
                if (generation == searchGeneration) {
                    products = applyFilters(result, category)
                    message = if (products.isEmpty()) "No hay productos para mostrar." else null
                }
            } catch (error: CancellationException) {
                throw error
            } catch (_: Throwable) {
                if (generation == searchGeneration) {
                    products = emptyList()
                    message = "No se pudo cargar el catálogo."
                }
            } finally {
                if (generation == searchGeneration) loading = false
            }
        }
    }

    fun resetToCatalog() {
        searchJob?.cancel()
        searchJob = null
        searchGeneration++
        selectedCategory = null
        selectedFilter = CatalogSearchFilter.All
        search = ""
        products = emptyList()
        message = null
        loading = false
    }

    fun refreshVisibleProducts() {
        loadProducts()
    }

    LaunchedEffect(rootRequestKey) {
        if (rootRequestKey > 0) resetToCatalog()
    }

    LaunchedEffect(selectedCategory, search) {
        onNestedStateChange(selectedCategory != null || search.trim().length >= 3)
    }

    LaunchedEffect(search, selectedFilter) {
        delay(350)
        loadProducts()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(WebPage)
            .padding(horizontal = 24.dp)
            .padding(top = screenTopPadding(), bottom = screenBottomPadding()),
        verticalArrangement = Arrangement.spacedBy(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        CatalogSearchBar(
            search = search,
            onSearchChange = { search = it },
            onOpenFilters = { filterDialogOpen = true },
            trailingAction = {
                if (!canManageCatalog) return@CatalogSearchBar
                if (selectedCategory == null) {
                    CatalogHeaderButton(
                        contentDescription = "Crear en catalogo",
                        onClick = { createDialogOpen = true },
                    ) {
                        Icon(Icons.Outlined.Add, contentDescription = null, tint = OnLime, modifier = Modifier.size(25.dp))
                    }
                } else if (selectedCategory?.canEdit == true) {
                    Box {
                        CatalogHeaderButton(
                            contentDescription = "Opciones de categoria",
                            onClick = { categoryActionsOpen = true },
                        ) {
                            Text("...", color = WebPrimary, fontSize = 24.sp, lineHeight = 18.sp, fontWeight = FontWeight.Black)
                        }
                        CatalogActionsMenu(
                            expanded = categoryActionsOpen,
                            editLabel = "Editar categoria",
                            deleteLabel = "Eliminar categoria",
                            onEdit = {
                                categoryActionsOpen = false
                                selectedCategory?.takeUnless { it.isFavorite }?.let { editingCategory = it }
                            },
                            onDelete = {
                                categoryActionsOpen = false
                                selectedCategory?.takeUnless { it.isFavorite }?.let { deleteCategory = it }
                            },
                            onDismiss = { categoryActionsOpen = false },
                        )
                    }
                }
            },
        )
        if (selectedCategory == null && search.trim().length < 3) {
            Column(modifier = Modifier.weight(1f).verticalScroll(rememberScrollState())) {
                CatalogCategoriesGrid(
                    categories = categories,
                    onCategorySelected = { category ->
                        selectedCategory = category
                        selectedFilter = if (category.isFavorite) CatalogSearchFilter.Favorites else CatalogSearchFilter.Category
                        loadProducts(category = category)
                    },
                )
                Spacer(modifier = Modifier.height(bottomNavigationScrollReserve()))
            }
        } else {
            CatalogProductsView(
                title = selectedCategory?.name ?: "Resultados",
                products = products,
                loading = loading,
                message = message,
                onToggleFavorite = { product ->
                    val nextFavorite = !product.isFavorite
                    products = applyFilters(products.map { if (it.id == product.id) it.copy(isFavorite = nextFavorite) else it })
                    scope.launch {
                        val updated = onSetProductFavorite(product.id, nextFavorite)
                        if (updated != null) {
                            val visibleProduct = if (updated.name.isBlank()) product.copy(isFavorite = updated.isFavorite) else updated
                            products = applyFilters(products.map { if (it.id == visibleProduct.id) visibleProduct else it })
                        } else {
                            products = applyFilters(products.map { if (it.id == product.id) product else it })
                        }
                    }
                },
                onEditProduct = { editingProduct = it },
                onDeleteProduct = { deleteProduct = it },
                canManageCatalog = canManageCatalog,
                modifier = Modifier.weight(1f),
            )
        }
    }
    if (filterDialogOpen) {
        CatalogFilterDialog(
            selected = selectedFilter,
            onSelected = {
                selectedFilter = it
                filterDialogOpen = false
            },
            onDismiss = { filterDialogOpen = false },
        )
    }
    if (createDialogOpen) {
        CatalogMutationDialog(
            categories = categories,
            selectedCategory = selectedCategory,
            onDismiss = { createDialogOpen = false },
            onSubmitCategory = { name, icon ->
                scope.launch {
                    val created = onCreateProductCategory(name, icon)
                    if (created != null) {
                        createDialogOpen = false
                        resetToCatalog()
                    }
                }
            },
            onSubmitProduct = { name, categoryId, icon, brand, packageSize ->
                scope.launch {
                    val created = onCreateProduct(name, categoryId, icon, brand, packageSize)
                    if (created != null) {
                        createDialogOpen = false
                        refreshVisibleProducts()
                    }
                }
            },
        )
    }
    editingCategory?.let { category ->
        CatalogMutationDialog(
            categories = categories,
            editingCategory = category,
            selectedCategory = category,
            onDismiss = { editingCategory = null },
            onSubmitCategory = { name, icon ->
                scope.launch {
                    val updated = onUpdateProductCategory(category, name, icon)
                    if (updated != null) {
                        editingCategory = null
                        selectedCategory = updated
                        refreshVisibleProducts()
                    }
                }
            },
            onSubmitProduct = { _, _, _, _, _ -> },
        )
    }
    editingProduct?.let { product ->
        CatalogMutationDialog(
            categories = categories,
            editingProduct = product,
            selectedCategory = selectedCategory,
            onDismiss = { editingProduct = null },
            onSubmitCategory = { _, _ -> },
            onSubmitProduct = { name, categoryId, icon, brand, packageSize ->
                scope.launch {
                    val updated = onUpdateProduct(product, name, categoryId, icon, brand, packageSize)
                    if (updated != null) {
                        editingProduct = null
                        products = applyFilters(products.map { if (it.id == updated.id) updated else it })
                    }
                }
            },
        )
    }
    deleteCategory?.let { category ->
        ConfirmDialog("Eliminar categoria", "Se eliminara esta categoria del catalogo.", {
            scope.launch {
                if (onDeleteProductCategory(category)) {
                    deleteCategory = null
                    resetToCatalog()
                }
            }
        }, { deleteCategory = null })
    }
    deleteProduct?.let { product ->
        ConfirmDialog("Eliminar producto", "Se eliminara este producto del catalogo.", {
            scope.launch {
                if (onDeleteProduct(product)) {
                    deleteProduct = null
                    products = products.filterNot { it.id == product.id }
                }
            }
        }, { deleteProduct = null })
    }
}

@Composable
private fun HouseholdRequiredPanel() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(WebPage)
            .padding(horizontal = responsiveWidthDp(0.051f))
            .padding(top = screenTopPadding(), bottom = screenBottomPadding()),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Card(colors = CardDefaults.cardColors(containerColor = WebSurface), shape = MaterialTheme.shapes.large) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Icon(Icons.AutoMirrored.Outlined.ListAlt, contentDescription = null, tint = WebPrimary, modifier = Modifier.size(40.dp))
                Text("Sin hogar activo", color = WebText, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleLarge)
                Text(
                    "Necesitas pertenecer a un hogar para acceder a tus listas.",
                    color = WebMuted,
                    fontWeight = FontWeight.SemiBold,
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}

@Composable
private fun ZeroHouseholdsHome(
    displayName: String,
    invitations: List<HouseholdInvitationNoticeUiModel>,
    invitationsLoading: Boolean,
    onCreateHousehold: () -> Unit,
    onOpenInvitations: () -> Unit,
    onAcceptInvitation: (String) -> Unit,
    onRejectInvitation: (String) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(WebPage)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = responsiveWidthDp(0.051f))
            .padding(top = screenTopPadding(), bottom = screenBottomPadding()),
        verticalArrangement = Arrangement.spacedBy(responsiveDp(0.018f)),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("Hola, $displayName", style = MaterialTheme.typography.headlineSmall, color = WebText, fontWeight = FontWeight.Bold, modifier = Modifier.fillMaxWidth())
        Card(
            colors = CardDefaults.cardColors(containerColor = WebSurface),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
            shape = MaterialTheme.shapes.large,
        ) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(responsiveDp(0.022f)),
                verticalArrangement = Arrangement.spacedBy(14.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(
                    modifier = Modifier
                        .size(70.dp)
                        .clip(CircleShape)
                        .background(WebLime.copy(alpha = 0.8f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Outlined.HomeWork, contentDescription = null, tint = WebPrimary, modifier = Modifier.size(36.dp))
                }
                Text(
                    if (invitations.isNotEmpty()) "Tienes una invitación pendiente" else "Empieza con NFCompra",
                    color = WebText,
                    fontWeight = FontWeight.Bold,
                    style = MaterialTheme.typography.titleLarge,
                    textAlign = TextAlign.Center,
                )
                Text(
                    if (invitations.isNotEmpty()) "Puedes aceptar una invitación o crear tu propio hogar."
                    else "Para empezar, puedes crear un hogar nuevo o revisar si alguien te ha invitado a uno.",
                    color = WebMuted,
                    fontWeight = FontWeight.SemiBold,
                    textAlign = TextAlign.Center,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                    Button(onClick = onCreateHousehold, modifier = Modifier.weight(1f), shape = MaterialTheme.shapes.medium, colors = webPrimaryButtonColors()) {
                        Text("+ Crear hogar")
                    }
                    Button(onClick = onOpenInvitations, modifier = Modifier.weight(1f), shape = MaterialTheme.shapes.medium, colors = webLimeButtonColors()) {
                        Text("Ver invitaciones")
                    }
                }
            }
        }
        when {
            invitationsLoading -> Text("Cargando invitaciones...", color = WebMuted, fontWeight = FontWeight.SemiBold)
            invitations.isNotEmpty() -> {
                SectionTitle("Invitaciones")
                invitations.forEach { invitation ->
                    InvitationNoticeCard(
                        invitation = invitation,
                        onAccept = { onAcceptInvitation(invitation.invitationId) },
                        onReject = { onRejectInvitation(invitation.notificationId) },
                    )
                }
            }
            else -> {
                Card(colors = CardDefaults.cardColors(containerColor = WebLime.copy(alpha = 0.45f)), shape = MaterialTheme.shapes.large) {
                    Text(
                        "Los hogares te permiten compartir listas de compra con otras personas.",
                        color = WebPrimary,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.fillMaxWidth().padding(16.dp),
                        textAlign = TextAlign.Center,
                    )
                }
            }
        }
        Spacer(modifier = Modifier.height(bottomNavigationScrollReserve()))
    }
}

@Composable
private fun InvitationNoticeCard(
    invitation: HouseholdInvitationNoticeUiModel,
    onAccept: () -> Unit,
    onReject: () -> Unit,
) {
    Card(colors = CardDefaults.cardColors(containerColor = WebSurface), shape = MaterialTheme.shapes.large, elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)) {
        Column(modifier = Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(invitation.title, color = WebText, fontWeight = FontWeight.Bold)
            Text(invitation.body, color = WebMuted, fontWeight = FontWeight.SemiBold)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                Button(onClick = onAccept, modifier = Modifier.weight(1f), shape = MaterialTheme.shapes.medium, colors = webPrimaryButtonColors()) {
                    Text("Aceptar")
                }
                Button(onClick = onReject, modifier = Modifier.weight(1f), shape = MaterialTheme.shapes.medium, colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFFEF2F2), contentColor = Color(0xFFDC2626))) {
                    Text("Rechazar")
                }
            }
        }
    }
}

private fun emptyHouseholdsData(message: String? = null, retryAction: ShoppingListAction? = null) = ShoppingListViewState.Data(
    content = ShoppingListUiState("Sin hogar", emptyList(), emptyList(), isOffline = false),
    households = emptyList(),
    lists = emptyList(),
    selectedHouseholdId = null,
    selectedListId = null,
    message = message,
    retryAction = retryAction,
)

@Composable
private fun CatalogSearchBar(
    search: String,
    onSearchChange: (String) -> Unit,
    onOpenFilters: () -> Unit,
    trailingAction: @Composable () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(54.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(
            modifier = Modifier
                .weight(1f)
                .height(52.dp)
                .padding(horizontal = 2.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Icon(
                imageVector = Icons.Outlined.Search,
                contentDescription = null,
                tint = WebPrimary,
            )
            OutlinedTextField(
                value = search,
                onValueChange = onSearchChange,
                modifier = Modifier.weight(1f),
                placeholder = { Text("Buscar en catálogo", color = WebMuted, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                singleLine = true,
                textStyle = MaterialTheme.typography.bodyMedium.copy(color = WebText),
            )
        }
        IconButton(
            onClick = onOpenFilters,
            modifier = Modifier
                .size(52.dp)
                .clip(MaterialTheme.shapes.large)
                .background(WebLime.copy(alpha = 0.95f)),
        ) {
            Icon(
                imageVector = Icons.Outlined.Tune,
                contentDescription = "Abrir filtros de búsqueda",
                tint = OnLime,
            )
        }
        trailingAction()
    }
}

@Composable
private fun CatalogHeaderButton(
    contentDescription: String,
    onClick: () -> Unit,
    content: @Composable () -> Unit,
) {
    IconButton(
        onClick = onClick,
        modifier = Modifier
            .size(52.dp)
            .clip(MaterialTheme.shapes.large)
            .background(WebLime.copy(alpha = 0.95f))
            .semantics { this.contentDescription = contentDescription },
    ) {
        content()
    }
}

@Composable
private fun CatalogActionsMenu(
    expanded: Boolean,
    editLabel: String,
    deleteLabel: String,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onDismiss: () -> Unit,
) {
    DropdownMenu(expanded = expanded, onDismissRequest = onDismiss) {
        DropdownMenuItem(
            text = { Text(editLabel, color = WebText, fontWeight = FontWeight.SemiBold) },
            leadingIcon = { Icon(Icons.Outlined.Edit, contentDescription = null, tint = WebPrimary) },
            onClick = onEdit,
        )
        DropdownMenuItem(
            text = { Text(deleteLabel, color = Color(0xFFB42318), fontWeight = FontWeight.SemiBold) },
            leadingIcon = { Icon(Icons.Outlined.Delete, contentDescription = null, tint = Color(0xFFB42318)) },
            onClick = onDelete,
        )
    }
}

private enum class CatalogMutationType { Category, Product }

private data class CatalogIconOption(val key: String, val label: String, val glyph: String)

private val CatalogIconOptions = listOf(
    CatalogIconOption("star", "Favorito", "\u2605"),
    CatalogIconOption("fruit", "Fruta", "\uD83C\uDF4E"),
    CatalogIconOption("vegetable", "Verdura", "\uD83E\uDD6C"),
    CatalogIconOption("meat", "Carne", "\uD83E\uDD69"),
    CatalogIconOption("cold-cuts", "Charcuteria", "\uD83E\uDD53"),
    CatalogIconOption("fish", "Pescado", "\uD83D\uDC1F"),
    CatalogIconOption("milk", "Lácteos", "\uD83E\uDD5B"),
    CatalogIconOption("cheese", "Queso", "\uD83E\uDDC0"),
    CatalogIconOption("egg", "Huevos", "\uD83E\uDD5A"),
    CatalogIconOption("bread", "Pan", "\uD83E\uDD56"),
    CatalogIconOption("rice", "Arroz", "\uD83C\uDF5A"),
    CatalogIconOption("pasta", "Pasta", "\uD83C\uDF5D"),
    CatalogIconOption("beans", "Legumbres", "\uD83E\uDED8"),
    CatalogIconOption("oil", "Aceite", "\uD83E\uDED2"),
    CatalogIconOption("sauce", "Salsas", "\uD83E\uDED9"),
    CatalogIconOption("coffee", "Café", "\u2615"),
    CatalogIconOption("cocoa", "Cacao", "\uD83C\uDF6B"),
    CatalogIconOption("water", "Agua", "\uD83D\uDCA7"),
    CatalogIconOption("bottle", "Botella", "\uD83D\uDCA7"),
    CatalogIconOption("soft-drink", "Refrescos", "\uD83E\uDD64"),
    CatalogIconOption("drink", "Bebidas", "\uD83E\uDD64"),
    CatalogIconOption("juice", "Zumo", "\uD83E\uDDC3"),
    CatalogIconOption("beer", "Cerveza", "\uD83C\uDF7A"),
    CatalogIconOption("wine", "Bodega", "\uD83C\uDF77"),
    CatalogIconOption("snack", "Aperitivos", "\uD83E\uDD68"),
    CatalogIconOption("chocolate", "Chocolate", "\uD83C\uDF6B"),
    CatalogIconOption("candy", "Dulces", "\uD83C\uDF6C"),
    CatalogIconOption("cookie", "Galletas", "\uD83C\uDF6A"),
    CatalogIconOption("can", "Conservas", "\uD83E\uDD6B"),
    CatalogIconOption("frozen", "Congelados", "\uD83E\uDDCA"),
    CatalogIconOption("pizza", "Pizza", "\uD83C\uDF55"),
    CatalogIconOption("detergent", "Detergente", "\uD83E\uDDFC"),
    CatalogIconOption("paper", "Papel", "\uD83E\uDDFB"),
    CatalogIconOption("clean", "Limpieza", "\uD83E\uDDFD"),
    CatalogIconOption("hygiene", "Higiene", "\uD83E\uDDF4"),
    CatalogIconOption("hair-care", "Cuidado capilar", "\uD83E\uDDF4"),
    CatalogIconOption("makeup", "Maquillaje", "\uD83D\uDC84"),
    CatalogIconOption("first-aid", "Parafarmacia", "\uD83E\uDE79"),
    CatalogIconOption("supplement", "Suplementos", "\uD83D\uDC8A"),
    CatalogIconOption("eye-care", "Ojos", "\uD83D\uDC41"),
    CatalogIconOption("condom", "Protección", "\uD83D\uDEE1"),
    CatalogIconOption("repellent", "Repelente", "\uD83E\uDD9F"),
    CatalogIconOption("antiseptic", "Antiséptico", "\uD83E\uDDEA"),
    CatalogIconOption("bandage", "Curas", "\uD83E\uDE79"),
    CatalogIconOption("cotton", "Algodón", "\u2601"),
    CatalogIconOption("baby", "Bebé", "\uD83C\uDF7C"),
    CatalogIconOption("diaper", "Pañales", "\uD83E\uDDF7"),
    CatalogIconOption("care", "Cuidado", "\uD83E\uDDF4"),
    CatalogIconOption("pet", "Mascotas", "\uD83D\uDC3E"),
    CatalogIconOption("cart", "General", "\uD83D\uDED2"),
)

@Composable
private fun CatalogMutationDialog(
    categories: List<ProductCategoryUiModel>,
    selectedCategory: ProductCategoryUiModel? = null,
    editingCategory: ProductCategoryUiModel? = null,
    editingProduct: ProductCatalogUiModel? = null,
    initialProductName: String = "",
    productOnly: Boolean = false,
    onDismiss: () -> Unit,
    onSubmitCategory: (String, String) -> Unit,
    onSubmitProduct: (String, String?, String, String?, String?) -> Unit,
) {
    val editableCategories = categories.filterNot { it.isFavorite }
    var type by remember(editingCategory, editingProduct) {
        mutableStateOf(if (editingProduct != null || productOnly) CatalogMutationType.Product else CatalogMutationType.Category)
    }
    val effectiveType = when {
        editingCategory != null -> CatalogMutationType.Category
        editingProduct != null || productOnly -> CatalogMutationType.Product
        else -> type
    }
    var categoryName by remember(editingCategory) { mutableStateOf(editingCategory?.name.orEmpty()) }
    var categoryIcon by remember(editingCategory) { mutableStateOf(editingCategory?.iconKey ?: selectedCategory?.iconKey ?: "cart") }
    var productName by remember(editingProduct, initialProductName) { mutableStateOf(editingProduct?.name ?: initialProductName.trim()) }
    var productCategoryId by remember(editingProduct, selectedCategory) {
        mutableStateOf(editingProduct?.categoryId ?: selectedCategory?.takeUnless { it.isFavorite }?.id ?: editableCategories.firstOrNull()?.id.orEmpty())
    }
    var productIcon by remember(editingProduct) { mutableStateOf(editingProduct?.iconKey ?: "cart") }
    var productBrand by remember(editingProduct) { mutableStateOf(editingProduct?.brand.orEmpty()) }
    var productPackage by remember(editingProduct) { mutableStateOf(editingProduct?.packageSize.orEmpty()) }
    val isEditing = editingCategory != null || editingProduct != null
    val maxTextHeight = (LocalConfiguration.current.screenHeightDp.dp * 0.62f).coerceAtMost(420.dp)

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = WebSurface,
        shape = RoundedCornerShape(26.dp),
        title = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    if (productOnly && !isEditing) "Crear producto" else if (isEditing) "Editar" else "Crear",
                    color = WebText,
                    fontWeight = FontWeight.Bold,
                    modifier = if (productOnly && !isEditing) Modifier.fillMaxWidth() else Modifier,
                    textAlign = if (productOnly && !isEditing) TextAlign.Center else TextAlign.Start,
                )
                if (!isEditing && !productOnly) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(MaterialTheme.shapes.large)
                            .background(WebSubtleSurface)
                            .padding(4.dp),
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        CatalogTypeChip("Categoria", type == CatalogMutationType.Category, Modifier.weight(1f)) { type = CatalogMutationType.Category }
                        CatalogTypeChip("Producto", type == CatalogMutationType.Product, Modifier.weight(1f)) { type = CatalogMutationType.Product }
                    }
                }
            }
        },
        text = {
            Column(
                modifier = Modifier
                    .heightIn(max = maxTextHeight)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (effectiveType == CatalogMutationType.Category) {
                    OutlinedTextField(
                        value = categoryName,
                        onValueChange = { categoryName = it },
                        label = { Text("Nombre de categoria") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    CatalogIconPicker("Icono", categoryIcon, onSelected = { categoryIcon = it })
                } else {
                    OutlinedTextField(
                        value = productName,
                        onValueChange = { productName = it },
                        label = { Text("Nombre del producto") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    CatalogCategoryPicker(
                        categories = editableCategories,
                        selectedCategoryId = productCategoryId,
                        onSelected = { productCategoryId = it },
                    )
                    CatalogIconPicker("Icono", productIcon, onSelected = { productIcon = it })
                    OutlinedTextField(
                        value = productBrand,
                        onValueChange = { productBrand = it },
                        label = { Text("Marca") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = productPackage,
                        onValueChange = { productPackage = it },
                        label = { Text("Tamano") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (effectiveType == CatalogMutationType.Category) {
                        onSubmitCategory(categoryName.trim(), categoryIcon)
                    } else {
                        onSubmitProduct(
                            productName.trim(),
                            productCategoryId.ifBlank { null },
                            productIcon,
                            productBrand.trim().ifBlank { null },
                            productPackage.trim().ifBlank { null },
                        )
                    }
                },
                enabled = if (effectiveType == CatalogMutationType.Category) categoryName.isNotBlank() else productName.isNotBlank(),
                colors = webPrimaryButtonColors(),
            ) {
                Text(if (isEditing) "Guardar" else "Crear")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancelar", color = WebPrimary, fontWeight = FontWeight.Bold) }
        },
    )
}

@Composable
private fun CatalogTypeChip(text: String, selected: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(
        modifier = modifier
            .height(40.dp)
            .clip(MaterialTheme.shapes.medium)
            .background(if (selected) WebLime else Color.Transparent)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, color = if (selected) OnLime else WebPrimary, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun CatalogIconPicker(label: String, selectedIconKey: String, onSelected: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    val selected = CatalogIconOptions.firstOrNull { it.key == selectedIconKey } ?: CatalogIconOptions.last()
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(label, color = WebText, fontWeight = FontWeight.Bold, fontSize = 13.sp)
        Box {
            Button(
                onClick = { expanded = true },
                modifier = Modifier.fillMaxWidth().height(48.dp),
                shape = MaterialTheme.shapes.medium,
                colors = ButtonDefaults.buttonColors(containerColor = WebSubtleSurface, contentColor = WebText),
            ) {
                Text("${selected.glyph}  ${selected.label}", maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                CatalogIconOptions.forEach { option ->
                    DropdownMenuItem(
                        text = { Text("${option.glyph}  ${option.label}") },
                        onClick = {
                            onSelected(option.key)
                            expanded = false
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun CatalogCategoryPicker(
    categories: List<ProductCategoryUiModel>,
    selectedCategoryId: String,
    onSelected: (String) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val selected = categories.firstOrNull { it.id == selectedCategoryId }
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text("Categoria", color = WebText, fontWeight = FontWeight.Bold, fontSize = 13.sp)
        Box {
            Button(
                onClick = { expanded = true },
                modifier = Modifier.fillMaxWidth().height(48.dp),
                shape = MaterialTheme.shapes.medium,
                colors = ButtonDefaults.buttonColors(containerColor = WebSubtleSurface, contentColor = WebText),
            ) {
                Text(selected?.let { "${categoryEmoji(it)}  ${it.name}" } ?: "Sin categoria", maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                DropdownMenuItem(
                    text = { Text("Sin categoria") },
                    onClick = {
                        onSelected("")
                        expanded = false
                    },
                )
                categories.forEach { category ->
                    DropdownMenuItem(
                        text = { Text("${categoryEmoji(category)}  ${category.name}") },
                        onClick = {
                            onSelected(category.id)
                            expanded = false
                        },
                    )
                }
            }
        }
    }
}

private enum class CatalogSearchFilter(val label: String, val description: String) {
    All("Todos los productos", "Busca en todo el catálogo."),
    Favorites("Favoritos", "Muestra solo tus productos guardados."),
    Category("Categoría seleccionada", "Limita la búsqueda a la categoría abierta."),
}

@Composable
private fun CatalogFilterDialog(
    selected: CatalogSearchFilter,
    onSelected: (CatalogSearchFilter) -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = WebSurface,
        shape = RoundedCornerShape(26.dp),
        title = {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Filtro", color = WebPrimary, fontSize = 12.sp, fontWeight = FontWeight.Black)
                Text("Filtro de búsqueda", color = WebText, fontWeight = FontWeight.Bold, lineHeight = 25.sp)
            }
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                enumValues<CatalogSearchFilter>().forEach { option ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(18.dp))
                            .background(if (selected == option) WebLime.copy(alpha = 0.4f) else WebPage)
                            .border(1.dp, if (selected == option) WebPrimary.copy(alpha = 0.35f) else Color(0xFFE3E8E4), RoundedCornerShape(18.dp))
                            .clickable { onSelected(option) }
                            .padding(horizontal = 10.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        RadioButton(
                            selected = selected == option,
                            onClick = { onSelected(option) },
                            colors = RadioButtonDefaults.colors(selectedColor = WebPrimary),
                        )
                        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(option.label, color = WebText, fontWeight = FontWeight.Bold)
                            Text(option.description, color = WebMuted, fontSize = 12.sp, lineHeight = 15.sp)
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Cerrar", color = WebPrimary, fontWeight = FontWeight.Bold) }
        },
    )
}

@Composable
private fun EmptyCatalogCategories() {
    Card(colors = CardDefaults.cardColors(containerColor = WebSurface)) {
        Text(
            text = "No hay categorías cargadas en el catálogo.",
            modifier = Modifier.fillMaxWidth().padding(18.dp),
            color = WebMuted,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun CatalogProductsView(
    title: String,
    products: List<ProductCatalogUiModel>,
    loading: Boolean,
    message: String?,
    onToggleFavorite: (ProductCatalogUiModel) -> Unit,
    onEditProduct: (ProductCatalogUiModel) -> Unit,
    onDeleteProduct: (ProductCatalogUiModel) -> Unit,
    canManageCatalog: Boolean = false,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text(title, color = WebText, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        when {
            loading -> Text("Cargando productos...", color = WebMuted, fontWeight = FontWeight.SemiBold)
            message != null -> Text(message, color = WebMuted, fontWeight = FontWeight.SemiBold)
            else -> CatalogProductGrid(
                products = products,
                onToggleFavorite = onToggleFavorite,
                onEditProduct = onEditProduct,
                onDeleteProduct = onDeleteProduct,
                canManageCatalog = canManageCatalog,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun CatalogProductGrid(
    products: List<ProductCatalogUiModel>,
    onToggleFavorite: (ProductCatalogUiModel) -> Unit,
    onEditProduct: (ProductCatalogUiModel) -> Unit,
    onDeleteProduct: (ProductCatalogUiModel) -> Unit,
    canManageCatalog: Boolean = false,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        products.chunked(2).forEach { rowProducts ->
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                rowProducts.forEach { product ->
                    CatalogProductCard(
                        product = product,
                        onToggleFavorite = { onToggleFavorite(product) },
                        onEditProduct = { onEditProduct(product) },
                        onDeleteProduct = { onDeleteProduct(product) },
                        canManageCatalog = canManageCatalog,
                        modifier = Modifier.weight(1f),
                    )
                }
                if (rowProducts.size == 1) Box(modifier = Modifier.weight(1f))
            }
        }
        Spacer(modifier = Modifier.height(bottomNavigationScrollReserve()))
    }
}

@Composable
private fun CatalogProductCard(
    product: ProductCatalogUiModel,
    onToggleFavorite: () -> Unit,
    onEditProduct: () -> Unit,
    onDeleteProduct: () -> Unit,
    canManageCatalog: Boolean = false,
    modifier: Modifier = Modifier,
) {
    var actionsOpen by remember { mutableStateOf(false) }
    val isHouseholdProduct = product.scope == "household"
    Card(
        modifier = modifier
            .height(150.dp)
            .border(1.dp, if (isHouseholdProduct) WebHouseholdBorder else WebBorder, MaterialTheme.shapes.large),
        colors = CardDefaults.cardColors(containerColor = if (isHouseholdProduct) WebHouseholdSoft else WebSurface),
    ) {
        Row(
            modifier = Modifier.fillMaxSize().padding(10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Box(
                    modifier = Modifier
                        .size(44.dp)
                        .clip(MaterialTheme.shapes.medium)
                        .background(WebSubtleSurface),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(productIcon(product), fontSize = 23.sp, lineHeight = 23.sp)
                }
                CompactFavoriteButton(favorite = product.isFavorite, onClick = onToggleFavorite)
                if (canManageCatalog && product.canEdit) {
                    Box {
                        CatalogMiniActionButton(contentDescription = "Opciones de producto", onClick = { actionsOpen = true }) {
                            Text("...", color = WebPrimary, fontSize = 18.sp, lineHeight = 12.sp, fontWeight = FontWeight.Black)
                        }
                        CatalogActionsMenu(
                            expanded = actionsOpen,
                            editLabel = "Editar producto",
                            deleteLabel = "Eliminar producto",
                            onEdit = {
                                actionsOpen = false
                                onEditProduct()
                            },
                            onDelete = {
                                actionsOpen = false
                                onDeleteProduct()
                            },
                            onDismiss = { actionsOpen = false },
                        )
                    }
                }
            }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.Center) {
                Text(
                    text = product.name,
                    color = WebText,
                    fontWeight = FontWeight.Bold,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.bodyLarge,
                    lineHeight = 20.sp,
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    val meta = product.metaLabel()
                    if (meta.isNotBlank()) {
                        Text(
                            meta,
                            color = WebMuted,
                            fontSize = 11.sp,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                            lineHeight = 14.sp,
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }
        }
    }
}
@Composable
private fun HouseholdsMiniDashboard(
    householdCount: Int,
    listCount: Int,
    onCreateHousehold: () -> Unit,
) {
    Card(colors = CardDefaults.cardColors(containerColor = WebSurface)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            MiniDashboardMetric("Hogares", householdCount.toString(), Modifier.weight(1f))
            MiniDashboardMetric("Listas", listCount.toString(), Modifier.weight(1f))
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(MaterialTheme.shapes.medium)
                    .background(WebPrimary)
                    .clickable(onClick = onCreateHousehold),
                contentAlignment = Alignment.Center,
            ) {
                Text("+", color = Color.White, fontSize = 28.sp, lineHeight = 28.sp, fontWeight = FontWeight.Black)
            }
        }
    }
}

@Composable
private fun MiniDashboardMetric(label: String, value: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .clip(MaterialTheme.shapes.medium)
            .background(WebSubtleSurface)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(label, color = WebMuted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
        Text(value, color = WebPrimary, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun CatalogCategoriesGrid(
    categories: List<ProductCategoryUiModel>,
    onCategorySelected: (ProductCategoryUiModel) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        val favoriteCategory = categories.firstOrNull { it.isFavorite } ?: ProductCategoryUiModel(
            id = "favorites",
            name = "Favoritos",
            normalizedName = "favoritos",
            iconKey = "star",
            isFavorite = true,
        )
        val normalCategories = categories.filterNot { it.isFavorite }
        FavoriteCatalogCategoryCard(favoriteCategory, Modifier.fillMaxWidth(), onClick = { onCategorySelected(favoriteCategory) })
        normalCategories.chunked(2).forEach { rowCategories ->
            Row(horizontalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.fillMaxWidth()) {
                rowCategories.forEach { category ->
                    CatalogCategoryCard(category = category, modifier = Modifier.weight(1f), onClick = { onCategorySelected(category) })
                }
                if (rowCategories.size == 1) {
                    Box(modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun FavoriteCatalogCategoryCard(category: ProductCategoryUiModel, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Row(
        modifier = modifier
            .height(96.dp)
            .clip(MaterialTheme.shapes.large)
            .background(WebLime.copy(alpha = 0.9f))
            .border(1.dp, WebPrimary.copy(alpha = 0.25f), MaterialTheme.shapes.large)
            .clickable(onClick = onClick)
            .padding(horizontal = 18.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(
            modifier = Modifier
                .size(54.dp)
                .clip(MaterialTheme.shapes.large)
                .background(Color.White.copy(alpha = 0.44f)),
            contentAlignment = Alignment.Center,
        ) {
            Text("\u2605", color = OnLimeMuted, fontSize = 30.sp, fontWeight = FontWeight.Black)
        }
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(category.name, color = OnLime, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text("Tus productos recurrentes", color = OnLimeMuted, fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
        }
    }
}

@Composable
private fun CatalogCategoryCard(category: ProductCategoryUiModel, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Column(
        modifier = modifier
            .height(190.dp)
            .clip(MaterialTheme.shapes.large)
            .background(categoryBackground(category))
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 18.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.SpaceBetween,
    ) {
        CategoryIllustration(category)
        Text(
            text = category.name,
            color = OnLime,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            lineHeight = 22.sp,
        )
    }
}

@Composable
private fun CategoryIllustration(category: ProductCategoryUiModel) {
    Box(
        modifier = Modifier
            .height(88.dp)
            .fillMaxWidth(),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .size(78.dp)
                .clip(MaterialTheme.shapes.extraLarge)
                .background(Color.White.copy(alpha = 0.72f)),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = categoryEmoji(category),
                fontSize = 42.sp,
                lineHeight = 44.sp,
                textAlign = TextAlign.Center,
            )
        }
    }
}

private fun categoryBackground(category: ProductCategoryUiModel): Color {
    val palette = listOf(
        Color(0xFFEAF6EF),
        Color(0xFFFFF4EA),
        Color(0xFFFFECE8),
        Color(0xFFF4EAF8),
        Color(0xFFFFF8DF),
        Color(0xFFEAF7FD),
        Color(0xFFF0F7E6),
        Color(0xFFFDECEC),
    )
    val index = kotlin.math.abs(category.id.hashCode()) % palette.size
    return palette[index]
}

private fun categoryEmoji(category: ProductCategoryUiModel): String {
    val text = "${category.iconKey} ${category.name}".normalizedUiSearch()
    return when {
        text.contains("favorito") || text.contains("star") -> "\u2605"
        text.contains("fruta") || text.contains("fruit") -> "\uD83C\uDF4E"
        text.contains("verdura") || text.contains("vegetable") -> "\uD83E\uDD6C"
        text.contains("aceite") || text.contains("oil") -> "\uD83E\uDED2"
        text.contains("salsa") || text.contains("especia") || text.contains("sauce") -> "\uD83E\uDED9"
        text.contains("zumo") || text.contains("jugo") || text.contains("juice") -> "\uD83E\uDDC3"
        text.contains("refresco") || text.contains("soft-drink") -> "\uD83E\uDD64"
        text.contains("agua") || text.contains("water") || text.contains("bottle") -> "\uD83D\uDCA7"
        text.contains("bebida") || text.contains("drink") -> "\uD83E\uDD64"
        text.contains("cerveza") || text.contains("beer") -> "\uD83C\uDF7A"
        text.contains("vino") || text.contains("bodega") || text.contains("wine") -> "\uD83C\uDF77"
        text.contains("carne") || text.contains("meat") -> "\uD83E\uDD69"
        text.contains("charcuteria") || text.contains("embutido") || text.contains("cold-cuts") -> "\uD83E\uDD53"
        text.contains("pescado") || text.contains("marisco") || text.contains("fish") -> "\uD83D\uDC1F"
        text.contains("pan") || text.contains("pasteleria") || text.contains("bread") -> "\uD83E\uDD56"
        text.contains("queso") || text.contains("cheese") -> "\uD83E\uDDC0"
        text.contains("huevo") || text.contains("egg") -> "\uD83E\uDD5A"
        text.contains("leche") || text.contains("yogur") || text.contains("lacteo") || text.contains("milk") -> "\uD83E\uDD5B"
        text.contains("congelado") || text.contains("frozen") -> "\uD83E\uDDCA"
        text.contains("mascota") || text.contains("pet") -> "\uD83D\uDC3E"
        text.contains("detergente") || text.contains("detergent") -> "\uD83E\uDDFC"
        text.contains("papel") || text.contains("paper") -> "\uD83E\uDDFB"
        text.contains("limpieza") || text.contains("hogar") || text.contains("clean") -> "\uD83E\uDDFD"
        text.contains("bebe") || text.contains("baby") -> "\uD83C\uDF7C"
        text.contains("cafe") || text.contains("infusion") || text.contains("coffee") -> "\u2615"
        text.contains("cacao") || text.contains("chocolate") -> "\uD83C\uDF6B"
        text.contains("arroz") || text.contains("rice") -> "\uD83C\uDF5A"
        text.contains("pasta") -> "\uD83C\uDF5D"
        text.contains("legumbre") || text.contains("beans") -> "\uD83E\uDED8"
        text.contains("galleta") || text.contains("cereal") || text.contains("cookie") -> "\uD83C\uDF6A"
        text.contains("caramelo") || text.contains("candy") -> "\uD83C\uDF6C"
        text.contains("postre") || text.contains("dessert") -> "\uD83C\uDF6E"
        text.contains("hair-care") || text.contains("cabello") || text.contains("capilar") -> "\uD83E\uDDF4"
        text.contains("cuidado") || text.contains("higiene") || text.contains("hygiene") || text.contains("care") -> "\uD83E\uDDF4"
        text.contains("maquillaje") || text.contains("makeup") -> "\uD83D\uDC84"
        text.contains("panal") || text.contains("panales") || text.contains("diaper") -> "\uD83E\uDDF7"
        text.contains("first-aid") || text.contains("fitoterapia") || text.contains("parafarmacia") -> "\uD83E\uDE79"
        text.contains("supplement") || text.contains("vitamina") || text.contains("mineral") -> "\uD83D\uDC8A"
        text.contains("eye-care") -> "\uD83D\uDC41"
        text.contains("condom") -> "\uD83D\uDEE1"
        text.contains("repellent") -> "\uD83E\uDD9F"
        text.contains("antiseptic") -> "\uD83E\uDDEA"
        text.contains("bandage") -> "\uD83E\uDE79"
        text.contains("cotton") -> "\u2601"
        text.contains("aperitivo") || text.contains("snack") -> "\uD83E\uDD68"
        text.contains("pizza") || text.contains("preparado") -> "\uD83C\uDF55"
        text.contains("conserva") || text.contains("caldo") || text.contains("crema") || text.contains("can") || text.contains("soup") -> "\uD83E\uDD6B"
        else -> "\uD83D\uDED2"
    }
}

@Composable
private fun ProfilePanel(
    profile: ProfileUiModel?,
    displayName: String,
    onUpdateProfile: suspend (String?, String?, String?) -> ProfileUiModel?,
    onChangePassword: suspend (String, String) -> Boolean,
    onDeleteAccount: suspend (String) -> Boolean,
    onRefreshProfile: () -> Unit,
    onLogout: () -> Unit,
    biometricAccessEnabled: Boolean = false,
    biometricAccessMessage: String? = null,
    onBiometricAccessChange: ((Boolean) -> Unit)? = null,
    uiScalePreference: UiScalePreference = UiScalePreference.Default,
    onUiScalePreferenceChange: (UiScalePreference) -> Unit = {},
    bottomNavigationStylePreference: BottomNavigationStylePreference = BottomNavigationStylePreference.Default,
    onBottomNavigationStylePreferenceChange: (BottomNavigationStylePreference) -> Unit = {},
    themePreference: ThemePreference = ThemePreference.Default,
    onThemePreferenceChange: (ThemePreference) -> Unit = {},
) {
    var personalDataExpanded by remember { mutableStateOf(false) }
    var settingsExpanded by remember { mutableStateOf(false) }
    var showLogoutConfirm by remember { mutableStateOf(false) }
    var editingField by remember { mutableStateOf<ProfileField?>(null) }
    var changingPassword by remember { mutableStateOf(false) }
    var deletingAccount by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) { onRefreshProfile() }
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(WebPage)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = responsiveWidthDp(0.051f))
            .padding(top = screenTopPadding(), bottom = screenBottomPadding()),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Card(
            colors = CardDefaults.cardColors(containerColor = WebSurface),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        ) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(20.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Box(
                    modifier = Modifier
                        .size(72.dp)
                        .clip(CircleShape)
                        .background(Brush.linearGradient(GroceryPrimaryGradient)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Outlined.Person, contentDescription = "Avatar", tint = Color.White, modifier = Modifier.size(36.dp))
                }
                Text(displayName, style = MaterialTheme.typography.titleLarge, color = WebText, fontWeight = FontWeight.Bold)
                Text(profile?.email.orEmpty(), color = WebMuted, fontSize = 13.sp, textAlign = TextAlign.Center)
            }
        }

        ProfileExpandableSection(
            title = "Datos personales",
            expanded = personalDataExpanded,
            onToggle = { personalDataExpanded = !personalDataExpanded },
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(WebSubtleSurface)
                    .border(1.dp, WebBorder, RoundedCornerShape(16.dp)),
            ) {
                ProfileRow("Email", profile?.email.orEmpty(), readOnly = true)
                ProfileRow("Nombre", profile?.firstName.orEmpty(), emptyText = "Sin nombre") { editingField = ProfileField.FirstName }
                ProfileRow("Apellidos", profile?.lastName.orEmpty(), emptyText = "Sin apellidos") { editingField = ProfileField.LastName }
                ProfileRow("Usuario", profile?.username.orEmpty(), emptyText = "Sin username") { editingField = ProfileField.Username }
                ProfileRow("Contrase\u00f1a", "********", actionText = "Cambiar") { changingPassword = true }
            }
        }

        ProfileExpandableSection(
            title = "Ajustes",
            expanded = settingsExpanded,
            onToggle = { settingsExpanded = !settingsExpanded },
        ) {
            SettingsInlineContent(
                biometricAccessEnabled = biometricAccessEnabled,
                biometricAccessMessage = biometricAccessMessage,
                onBiometricAccessChange = onBiometricAccessChange,
                uiScalePreference = uiScalePreference,
                onUiScalePreferenceChange = onUiScalePreferenceChange,
                bottomNavigationStylePreference = bottomNavigationStylePreference,
                onBottomNavigationStylePreferenceChange = onBottomNavigationStylePreferenceChange,
                themePreference = themePreference,
                onThemePreferenceChange = onThemePreferenceChange,
                onDeleteAccount = { deletingAccount = true },
            )
        }
        Button(
            onClick = { showLogoutConfirm = true },
            modifier = Modifier.fillMaxWidth().height(56.dp),
            shape = MaterialTheme.shapes.medium,
            colors = ButtonDefaults.buttonColors(containerColor = CheckedSurface, contentColor = CheckedAccent),
        ) {
            Icon(Icons.Outlined.Logout, contentDescription = null, modifier = Modifier.size(20.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Text("Cerrar sesi\u00f3n", fontWeight = FontWeight.Bold)
        }
        Spacer(modifier = Modifier.height(bottomNavigationScrollReserve()))
    }

    editingField?.let { field ->
        ProfileFieldDialog(
            field = field,
            profile = profile,
            onDismiss = { editingField = null },
            onSave = { firstName, lastName, username, done ->
                scope.launch {
                    val saved = onUpdateProfile(firstName, lastName, username)
                    done(saved != null)
                    if (saved != null) editingField = null
                }
            },
        )
    }
    if (changingPassword) PasswordChangeDialog(
        onDismiss = { changingPassword = false },
        onSave = { currentPassword, newPassword, done ->
            scope.launch {
                val saved = onChangePassword(currentPassword, newPassword)
                done(saved)
                if (saved) changingPassword = false
            }
        },
    )
    if (deletingAccount) DeleteAccountDialog(
        onDismiss = { deletingAccount = false },
        onDelete = { currentPassword, done ->
            scope.launch {
                val deleted = onDeleteAccount(currentPassword)
                done(deleted)
                if (deleted) {
                    deletingAccount = false
                    onLogout()
                }
            }
        },
    )
    if (showLogoutConfirm) AlertDialog(
        onDismissRequest = { showLogoutConfirm = false },
        title = { Text("Cerrar sesi\u00f3n", fontWeight = FontWeight.Bold, color = WebText) },
        text = { Text("\u00bfEst\u00e1s seguro de que quieres cerrar sesi\u00f3n? Deber\u00e1s iniciar sesi\u00f3n de nuevo para acceder a tu cuenta.", color = WebMuted) },
        confirmButton = {
            Button(
                onClick = { showLogoutConfirm = false; onLogout() },
                colors = ButtonDefaults.buttonColors(containerColor = CheckedAccent, contentColor = Color.White),
                shape = RoundedCornerShape(8.dp),
            ) { Text("Cerrar sesi\u00f3n", fontWeight = FontWeight.Bold) }
        },
        dismissButton = {
            Button(
                onClick = { showLogoutConfirm = false },
                colors = ButtonDefaults.buttonColors(containerColor = WebSurface, contentColor = WebText),
                shape = RoundedCornerShape(8.dp),
            ) { Text("Cancelar") }
        },
    )
}

@Composable
private fun ProfileRow(
    label: String,
    value: String,
    emptyText: String = "Sin datos",
    actionText: String = "Editar",
    readOnly: Boolean = false,
    onClick: (() -> Unit)? = null,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(label.uppercase(), color = WebPrimary, fontSize = 11.sp, fontWeight = FontWeight.Black)
            Text(
                value.ifBlank { emptyText },
                color = if (value.isBlank()) WebMuted else WebText,
                fontWeight = FontWeight.SemiBold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (readOnly) Text("Solo lectura", color = WebMuted, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        else Button(
            onClick = { onClick?.invoke() },
            colors = ButtonDefaults.buttonColors(containerColor = WebLime, contentColor = OnLime),
            shape = RoundedCornerShape(10.dp),
        ) {
            Text(actionText, fontWeight = FontWeight.Bold)
        }
    }
}

private enum class ProfileField(val title: String) {
    FirstName("Nombre"),
    LastName("Apellidos"),
    Username("Usuario"),
}

@Composable
private fun ProfileFieldDialog(
    field: ProfileField,
    profile: ProfileUiModel?,
    onDismiss: () -> Unit,
    onSave: (String?, String?, String?, (Boolean) -> Unit) -> Unit,
) {
    val initialValue = when (field) {
        ProfileField.FirstName -> profile?.firstName
        ProfileField.LastName -> profile?.lastName
        ProfileField.Username -> profile?.username
    }.orEmpty()
    var value by remember(field, profile) { mutableStateOf(initialValue) }
    var error by remember { mutableStateOf<String?>(null) }
    var saving by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Editar ${field.title}", color = WebPrimary, fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = value,
                    onValueChange = { value = it },
                    label = { Text(field.title) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                error?.let { Text(it, color = CheckedAccent, fontSize = 12.sp, fontWeight = FontWeight.Bold) }
            }
        },
        confirmButton = {
            Button(
                enabled = !saving,
                onClick = {
                    val trimmed = value.trim()
                    if (field == ProfileField.FirstName && trimmed.isBlank()) {
                        error = "El nombre no puede estar vac\u00edo."
                        return@Button
                    }
                    if (field == ProfileField.Username && trimmed.isNotBlank() && !Regex("^[a-zA-Z0-9._-]{3,30}$").matches(trimmed)) {
                        error = "Usa entre 3 y 30 caracteres."
                        return@Button
                    }
                    saving = true
                    val nextValue = trimmed.ifBlank { null }
                    onSave(
                        if (field == ProfileField.FirstName) nextValue else profile?.firstName,
                        if (field == ProfileField.LastName) nextValue else profile?.lastName,
                        if (field == ProfileField.Username) nextValue else profile?.username,
                    ) { ok ->
                        saving = false
                        if (!ok) error = "No se pudo guardar."
                    }
                },
                colors = ButtonDefaults.buttonColors(containerColor = WebLime, contentColor = OnLime),
                shape = RoundedCornerShape(8.dp),
            ) { Text(if (saving) "Guardando..." else "Guardar", fontWeight = FontWeight.Bold) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}

@Composable
private fun PasswordChangeDialog(
    onDismiss: () -> Unit,
    onSave: (String, String, (Boolean) -> Unit) -> Unit,
) {
    var currentPassword by remember { mutableStateOf("") }
    var newPassword by remember { mutableStateOf("") }
    var repeatPassword by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var saving by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Cambiar contrase\u00f1a", color = WebPrimary, fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(currentPassword, { currentPassword = it }, label = { Text("Contrase\u00f1a actual") }, singleLine = true, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
                OutlinedTextField(newPassword, { newPassword = it }, label = { Text("Nueva contrase\u00f1a") }, singleLine = true, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
                OutlinedTextField(repeatPassword, { repeatPassword = it }, label = { Text("Repetir contrase\u00f1a") }, singleLine = true, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
                error?.let { Text(it, color = CheckedAccent, fontSize = 12.sp, fontWeight = FontWeight.Bold) }
            }
        },
        confirmButton = {
            Button(
                enabled = !saving,
                onClick = {
                    if (newPassword.length < 8) {
                        error = "La nueva contrase\u00f1a debe tener al menos 8 caracteres."
                        return@Button
                    }
                    if (newPassword != repeatPassword) {
                        error = "Las contrase\u00f1as no coinciden."
                        return@Button
                    }
                    saving = true
                    onSave(currentPassword, newPassword) { ok ->
                        saving = false
                        if (!ok) error = "No se pudo cambiar la contrase\u00f1a."
                    }
                },
                colors = ButtonDefaults.buttonColors(containerColor = WebLime, contentColor = OnLime),
                shape = RoundedCornerShape(8.dp),
            ) { Text(if (saving) "Guardando..." else "Cambiar", fontWeight = FontWeight.Bold) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}

@Composable
private fun ProfileExpandableSection(
    title: String,
    expanded: Boolean,
    onToggle: () -> Unit,
    content: @Composable () -> Unit,
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = WebSurface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        shape = RoundedCornerShape(18.dp),
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(onClick = onToggle)
                    .padding(horizontal = 16.dp, vertical = 15.dp),
            ) {
                Text(
                    title,
                    modifier = Modifier
                        .fillMaxWidth()
                        .align(Alignment.Center),
                    color = WebText,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Black,
                    textAlign = TextAlign.Center,
                )
                Icon(
                    imageVector = if (expanded) Icons.Outlined.KeyboardArrowUp else Icons.Outlined.KeyboardArrowDown,
                    contentDescription = null,
                    tint = WebPrimary,
                    modifier = Modifier
                        .size(24.dp)
                        .align(Alignment.CenterEnd),
                )
            }
            AnimatedVisibility(visible = expanded) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(1.dp, WebBorder.copy(alpha = 0.65f), RoundedCornerShape(bottomStart = 18.dp, bottomEnd = 18.dp))
                        .padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    content()
                }
            }
        }
    }
}

private data class SelectorOption<T>(
    val value: T,
    val label: String,
)

@Composable
private fun <T> SegmentedPreferenceSelector(
    options: List<SelectorOption<T>>,
    selected: T,
    onSelected: (T) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(46.dp)
            .clip(RoundedCornerShape(14.dp))
            .border(1.dp, WebBorder, RoundedCornerShape(14.dp))
            .background(WebSubtleSurface)
            .padding(3.dp),
        horizontalArrangement = Arrangement.spacedBy(3.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        options.forEach { option ->
            val active = option.value == selected
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxSize()
                    .clip(RoundedCornerShape(11.dp))
                    .background(if (active) WebLime else Color.Transparent)
                    .clickable { onSelected(option.value) },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    option.label,
                    color = if (active) OnLime else WebText,
                    fontWeight = FontWeight.Black,
                    fontSize = 13.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun SettingsSubsection(
    title: String,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(WebSubtleSurface)
            .border(1.dp, WebBorder, RoundedCornerShape(16.dp))
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(title, color = WebPrimary, fontWeight = FontWeight.Black, style = MaterialTheme.typography.titleSmall)
        content()
    }
}

@Composable
private fun SettingsInlineContent(
    biometricAccessEnabled: Boolean = false,
    biometricAccessMessage: String? = null,
    onBiometricAccessChange: ((Boolean) -> Unit)? = null,
    uiScalePreference: UiScalePreference = UiScalePreference.Default,
    onUiScalePreferenceChange: (UiScalePreference) -> Unit = {},
    bottomNavigationStylePreference: BottomNavigationStylePreference = BottomNavigationStylePreference.Default,
    onBottomNavigationStylePreferenceChange: (BottomNavigationStylePreference) -> Unit = {},
    themePreference: ThemePreference = ThemePreference.Default,
    onThemePreferenceChange: (ThemePreference) -> Unit = {},
    onDeleteAccount: () -> Unit = {},
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SettingsSubsection("Tema") {
            SegmentedPreferenceSelector(
                options = listOf(
                    SelectorOption(ThemePreference.Light, "Claro"),
                    SelectorOption(ThemePreference.Dark, "Oscuro"),
                    SelectorOption(ThemePreference.System, "Sistema"),
                ),
                selected = themePreference,
                onSelected = onThemePreferenceChange,
            )
        }

        SettingsSubsection("Accesibilidad visual") {
            Text("Tama\u00f1o de la interfaz", color = WebText, fontWeight = FontWeight.Bold)
            SegmentedPreferenceSelector(
                options = listOf(
                    SelectorOption(UiScalePreference.Small, "Peque\u00f1o"),
                    SelectorOption(UiScalePreference.Normal, "Normal"),
                    SelectorOption(UiScalePreference.Large, "Grande"),
                ),
                selected = uiScalePreference,
                onSelected = onUiScalePreferenceChange,
            )
            Button(
                onClick = { onUiScalePreferenceChange(UiScalePreference.System) },
                modifier = Modifier.fillMaxWidth().height(46.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (uiScalePreference == UiScalePreference.System) WebLime else WebSurface,
                    contentColor = if (uiScalePreference == UiScalePreference.System) OnLime else WebText,
                ),
            ) {
                Text("Sistema - Tama\u00f1o Android", fontWeight = FontWeight.Black)
            }
            Text("Men\u00fa inferior", color = WebText, fontWeight = FontWeight.Bold)
            SegmentedPreferenceSelector(
                options = listOf(
                    SelectorOption(BottomNavigationStylePreference.Original, "Original"),
                    SelectorOption(BottomNavigationStylePreference.NavBar, "NavBar"),
                ),
                selected = bottomNavigationStylePreference,
                onSelected = onBottomNavigationStylePreferenceChange,
            )
        }

        if (onBiometricAccessChange != null) {
            SettingsSubsection("Seguridad") {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        Icons.Outlined.Lock,
                        contentDescription = null,
                        tint = WebPrimary,
                        modifier = Modifier.size(22.dp),
                    )
                    Column(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        Text("Acceso con biometr\u00eda", color = WebText, fontWeight = FontWeight.Bold)
                        Text(
                            if (biometricAccessEnabled) "Activado para este dispositivo" else "Desactivado",
                            color = WebMuted,
                            fontSize = 12.sp,
                        )
                    }
                    Switch(
                        checked = biometricAccessEnabled,
                        onCheckedChange = onBiometricAccessChange,
                    )
                }
                biometricAccessMessage?.let {
                    Text(it, color = WebMuted, fontSize = 12.sp)
                }
            }
        }

        SettingsSubsection("Cuenta") {
            Button(
                onClick = onDeleteAccount,
                modifier = Modifier.fillMaxWidth().height(48.dp),
                colors = ButtonDefaults.buttonColors(containerColor = CheckedAccent, contentColor = Color.White),
                shape = RoundedCornerShape(12.dp),
            ) {
                Icon(Icons.Outlined.Delete, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text("Eliminar cuenta", fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun SettingsDialog(
    onDismiss: () -> Unit,
    biometricAccessEnabled: Boolean = false,
    biometricAccessMessage: String? = null,
    onBiometricAccessChange: ((Boolean) -> Unit)? = null,
    uiScalePreference: UiScalePreference = UiScalePreference.Default,
    onUiScalePreferenceChange: (UiScalePreference) -> Unit = {},
    bottomNavigationStylePreference: BottomNavigationStylePreference = BottomNavigationStylePreference.Default,
    onBottomNavigationStylePreferenceChange: (BottomNavigationStylePreference) -> Unit = {},
    themePreference: ThemePreference = ThemePreference.Default,
    onThemePreferenceChange: (ThemePreference) -> Unit = {},
    onDeleteAccount: () -> Unit = {},
) {
    val limeButtonColors = ButtonDefaults.buttonColors(containerColor = WebLime, contentColor = OnLime)
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            NFCompraUiScaleProvider(uiScalePreference) {
                Text("Ajustes", color = WebPrimary, fontWeight = FontWeight.Bold)
            }
        },
        text = {
            NFCompraUiScaleProvider(uiScalePreference) {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                SectionTitle("Tema")
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    enumValues<ThemePreference>().forEach { option ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(10.dp))
                                .clickable { onThemePreferenceChange(option) }
                                .padding(horizontal = 8.dp, vertical = 6.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            RadioButton(
                                selected = themePreference == option,
                                onClick = { onThemePreferenceChange(option) },
                                colors = RadioButtonDefaults.colors(selectedColor = WebPrimary),
                            )
                            Text(option.label, color = WebText, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }

                Spacer(modifier = Modifier.height(4.dp))
                SectionTitle("Accesibilidad visual")
                Text("Tamaño de la interfaz", color = WebText, fontWeight = FontWeight.Bold)
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    enumValues<UiScalePreference>().forEach { option ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(10.dp))
                                .clickable { onUiScalePreferenceChange(option) }
                                .padding(horizontal = 8.dp, vertical = 6.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            RadioButton(
                                selected = uiScalePreference == option,
                                onClick = { onUiScalePreferenceChange(option) },
                                colors = RadioButtonDefaults.colors(selectedColor = WebPrimary),
                            )
                            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(option.label, color = WebText, fontWeight = FontWeight.SemiBold)
                                option.supportingText?.let {
                                    Text(it, color = WebMuted, fontSize = 12.sp)
                                }
                            }
                        }
                    }
                }
                Text("Menú inferior", color = WebText, fontWeight = FontWeight.Bold)
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    enumValues<BottomNavigationStylePreference>().forEach { option ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(10.dp))
                                .clickable { onBottomNavigationStylePreferenceChange(option) }
                                .padding(horizontal = 8.dp, vertical = 6.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            RadioButton(
                                selected = bottomNavigationStylePreference == option,
                                onClick = { onBottomNavigationStylePreferenceChange(option) },
                                colors = RadioButtonDefaults.colors(selectedColor = WebPrimary),
                            )
                            Text(option.label, color = WebText, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
                if (onBiometricAccessChange != null) {
                    Spacer(modifier = Modifier.height(4.dp))
                    SectionTitle("Seguridad")
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            Icons.Outlined.Lock,
                            contentDescription = null,
                            tint = WebPrimary,
                            modifier = Modifier.size(22.dp),
                        )
                        Column(
                            modifier = Modifier.weight(1f),
                            verticalArrangement = Arrangement.spacedBy(2.dp),
                        ) {
                            Text("Acceso con biometria", color = WebText, fontWeight = FontWeight.Bold)
                            Text(
                                "Usa la biometria de tu dispositivo para acceder",
                                color = WebMuted,
                                fontSize = 12.sp,
                            )
                        }
                        Switch(
                            checked = biometricAccessEnabled,
                            onCheckedChange = onBiometricAccessChange,
                        )
                    }
                    biometricAccessMessage?.let {
                        Text(it, color = WebMuted, fontSize = 12.sp)
                    }
                }

                Spacer(modifier = Modifier.height(4.dp))
                SectionTitle("Cuenta")
                Button(
                    onClick = onDeleteAccount,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = CheckedAccent, contentColor = Color.White),
                    shape = RoundedCornerShape(8.dp),
                ) {
                    Icon(Icons.Outlined.Delete, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Eliminar cuenta", fontWeight = FontWeight.Bold)
                }
            }
            }
        },
        confirmButton = {
            NFCompraUiScaleProvider(uiScalePreference) {
            Button(
                onClick = onDismiss,
                colors = limeButtonColors,
            ) {
                Text("Cerrar", fontWeight = FontWeight.Bold)
            }
            }
        },
    )
}

@Composable
private fun NotchedDashboardNavigation(selected: DashboardTab, onSelect: (DashboardTab) -> Unit) {
    val navItems = enumValues<DashboardTab>().toList()
    val selectedIndex = navItems.indexOf(selected).coerceAtLeast(0)
    val selectedContentDescription = selectedTabLabel(selected) + " seleccionado"
    val colors = DashboardNavBarColors(
        bubble = WebSurface,
        bubbleIcon = WebPrimary,
        active = Color.White,
        inactive = Color.White.copy(alpha = 0.82f),
        shadow = Color(0x33000000),
    )
    val barH = 64.dp
    val bubbleSize = 58.dp
    val overhang = bubbleSize / 2
    val navPad = responsiveWidthDp(0.047f)
    val hPad = 8.dp

    BoxWithConstraints(
        modifier = Modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .height(barH + overhang + 14.dp)
            .padding(start = navPad, end = navPad, bottom = 10.dp)
            .semantics { contentDescription = "Menú inferior principal" },
    ) {
        val slot = (maxWidth - hPad * 2) / navItems.size
        fun centerOf(index: Int): Dp = hPad + slot * (index + 0.5f)
        val activeCenterX by animateFloatAsState(
            targetValue = centerOf(selectedIndex).value,
            animationSpec = tween(durationMillis = 420, easing = FastOutSlowInEasing),
            label = "notched-nav-active-x",
        )
        val activeCenterXDp = activeCenterX.dp

        Canvas(
            modifier = Modifier
                .fillMaxWidth()
                .height(barH)
                .align(Alignment.BottomCenter),
        ) {
            val path = notchedDashboardBarPath(size, activeCenterXDp.toPx())
            drawDashboardNavShadow(path, colors.shadow)
            drawPath(path, Brush.linearGradient(GroceryPrimaryGradient))
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(barH)
                .align(Alignment.BottomCenter)
                .padding(horizontal = hPad),
            verticalAlignment = Alignment.Bottom,
        ) {
            navItems.forEachIndexed { index, tab ->
                val active = index == selectedIndex
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxSize()
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                        ) { onSelect(tab) }
                        .padding(bottom = 10.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Bottom,
                ) {
                    if (!active) {
                        Icon(
                            imageVector = selectedTabIcon(tab),
                            contentDescription = null,
                            tint = colors.inactive,
                            modifier = Modifier.size(22.dp),
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                    }
                    Text(
                        text = selectedTabLabel(tab),
                        color = if (active) colors.active else colors.inactive,
                        fontSize = 11.sp,
                        lineHeight = 12.sp,
                        fontWeight = if (active) FontWeight.Bold else FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Clip,
                        softWrap = false,
                    )
                }
            }
        }

        Box(
            modifier = Modifier
                .offset(x = activeCenterXDp - bubbleSize / 2)
                .size(bubbleSize)
                .shadow(10.dp, CircleShape, clip = false)
                .clip(CircleShape)
                .background(colors.bubble)
                .border(1.dp, Brush.linearGradient(GroceryPrimaryGradient), CircleShape)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                ) { onSelect(selected) }
                .semantics { contentDescription = selectedContentDescription },
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = selectedTabIcon(selected),
                contentDescription = null,
                tint = colors.bubbleIcon,
                modifier = Modifier.size(25.dp),
            )
        }
    }
}

private fun DrawScope.notchedDashboardBarPath(size: Size, centerX: Float): Path {
    val radius = 22.dp.toPx()
    val cutRadius = 35.dp.toPx()
    val fillet = 20.dp.toPx()
    val bar = Path().apply {
        addRoundRect(RoundRect(Rect(0f, 0f, size.width, size.height), CornerRadius(radius, radius)))
    }
    val tangentOffset = sqrt(cutRadius * cutRadius + 2f * cutRadius * fillet)
    val tangentRatio = cutRadius / (cutRadius + fillet)
    val tangentX = tangentRatio * tangentOffset
    val tangentY = tangentRatio * fillet
    val sweep = Math.toDegrees(atan2((tangentY - fillet).toDouble(), (tangentOffset - tangentX).toDouble())).toFloat() + 90f

    val circle = Path().apply { addOval(Rect(Offset(centerX, 0f), cutRadius)) }
    val left = Path().apply {
        moveTo(centerX - tangentOffset, 0f)
        arcTo(Rect(Offset(centerX - tangentOffset, fillet), fillet), -90f, sweep, false)
        lineTo(centerX, tangentY)
        lineTo(centerX, -fillet)
        lineTo(centerX - tangentOffset, -fillet)
        close()
    }
    val right = Path().apply {
        moveTo(centerX + tangentOffset, 0f)
        arcTo(Rect(Offset(centerX + tangentOffset, fillet), fillet), -90f, -sweep, false)
        lineTo(centerX, tangentY)
        lineTo(centerX, -fillet)
        lineTo(centerX + tangentOffset, -fillet)
        close()
    }
    val hole = Path().apply {
        op(circle, left, PathOperation.Union)
        op(this, right, PathOperation.Union)
    }
    return Path().apply { op(bar, hole, PathOperation.Difference) }
}

private fun DrawScope.drawDashboardNavShadow(path: Path, color: Color) {
    drawIntoCanvas { canvas ->
        val paint = Paint()
        paint.asFrameworkPaint().apply {
            isAntiAlias = true
            this.color = android.graphics.Color.TRANSPARENT
            setShadowLayer(9.dp.toPx(), 0f, 6.dp.toPx(), color.toArgb())
        }
        canvas.drawPath(path, paint)
    }
}

@Composable
private fun DeleteAccountDialog(
    onDismiss: () -> Unit,
    onDelete: (String, (Boolean) -> Unit) -> Unit,
) {
    var currentPassword by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var saving by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = { if (!saving) onDismiss() },
        title = { Text("Eliminar cuenta", color = CheckedAccent, fontWeight = FontWeight.Bold) },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text("Esta accion es permanente y no se puede deshacer.", color = CheckedAccent, fontWeight = FontWeight.Bold)
                Text("Se eliminara tu cuenta y tus datos personales.", color = WebMuted, fontSize = 13.sp)
                Text("Dejaras de pertenecer a todos tus hogares.", color = WebMuted, fontSize = 13.sp)
                Text("Si eres propietario de algun hogar, la propiedad se transferira automaticamente a otro miembro.", color = WebMuted, fontSize = 13.sp)
                Text("Si eres el unico miembro de un hogar, ese hogar se eliminara.", color = WebMuted, fontSize = 13.sp)
                OutlinedTextField(
                    value = currentPassword,
                    onValueChange = { currentPassword = it },
                    label = { Text("Contrase\u00f1a actual") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    modifier = Modifier.fillMaxWidth(),
                )
                error?.let { Text(it, color = CheckedAccent, fontSize = 12.sp, fontWeight = FontWeight.Bold) }
            }
        },
        confirmButton = {
            Button(
                enabled = !saving,
                onClick = {
                    if (currentPassword.isBlank()) {
                        error = "Introduce tu contrase\u00f1a actual."
                        return@Button
                    }
                    saving = true
                    error = null
                    onDelete(currentPassword) { ok ->
                        saving = false
                        if (!ok) error = "La contrase\u00f1a actual no es correcta o no se pudo eliminar la cuenta."
                    }
                },
                colors = ButtonDefaults.buttonColors(containerColor = CheckedAccent, contentColor = Color.White),
                shape = RoundedCornerShape(8.dp),
            ) { Text(if (saving) "Eliminando..." else "Eliminar mi cuenta", fontWeight = FontWeight.Bold) }
        },
        dismissButton = {
            TextButton(enabled = !saving, onClick = onDismiss) { Text("Cancelar") }
        },
    )
}

@Composable
private fun webPrimaryButtonColors() = ButtonDefaults.buttonColors(
    containerColor = WebPrimary,
    contentColor = Color.White,
)

@Composable
private fun webLimeButtonColors() = ButtonDefaults.buttonColors(
    containerColor = WebLime,
    contentColor = OnLime,
)

@Composable
private fun SummaryCard(title: String, value: String, detail: String) {
    Card(colors = CardDefaults.cardColors(containerColor = WebLime)) {
        Row(modifier = Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Column {
                Text(title, style = MaterialTheme.typography.titleMedium, color = OnLimeMuted, fontWeight = FontWeight.Bold)
                Text(detail, style = MaterialTheme.typography.bodySmall, color = OnLimeMuted, fontWeight = FontWeight.SemiBold)
            }
            Text(value, style = MaterialTheme.typography.headlineMedium, color = OnLime, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun SectionTitle(title: String) {
    Text(title, style = MaterialTheme.typography.titleMedium, color = WebPrimary, fontWeight = FontWeight.Bold)
}

@Composable
private fun SeparatorTitle(title: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(modifier = Modifier.weight(1f).height(1.dp).background(WebPrimary.copy(alpha = 0.18f)))
        Text(title, color = WebPrimary, fontWeight = FontWeight.Black, fontSize = 13.sp)
        Box(modifier = Modifier.weight(1f).height(1.dp).background(WebPrimary.copy(alpha = 0.18f)))
    }
}

@Composable
private fun CompactMetricCard(title: String, value: String, modifier: Modifier = Modifier, onClick: () -> Unit = {}) {
    Card(
        modifier = modifier.height(92.dp).clickable(onClick = onClick),
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
private fun PinnedListMetricCard(
    list: ShoppingListSummaryUiModel?,
    householdName: String,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Card(
        modifier = modifier.height(92.dp).clickable(enabled = list != null, onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = if (list == null) WebSurface else WebLime.copy(alpha = 0.85f)),
    ) {
        Column(
            modifier = Modifier.fillMaxSize().padding(10.dp),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Icon(Icons.Outlined.PushPin, contentDescription = null, tint = WebPrimary, modifier = Modifier.size(18.dp))
            Text(list?.name ?: "Sin fijar", color = if (list == null) WebText else OnLime, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(if (list == null) "Fija una lista" else householdName.ifBlank { "Hogar" }, color = if (list == null) WebMuted else OnLimeMuted, fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun ContinueListCard(
    list: ShoppingListSummaryUiModel,
    householdName: String,
    pendingCount: Int,
    checkedCount: Int,
    pinned: Boolean,
    onTogglePinned: () -> Unit,
    onEdit: () -> Unit,
    onView: () -> Unit,
) {
    Card(colors = CardDefaults.cardColors(containerColor = WebLime)) {
        Column(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Row(modifier = Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    PinButton(pinned = pinned, onClick = onTogglePinned)
                    Column(modifier = Modifier.weight(1f)) {
                        Text(list.name, style = MaterialTheme.typography.titleLarge, color = OnLime, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(householdName.ifBlank { "Hogar" }, style = MaterialTheme.typography.bodyMedium, color = OnLimeMuted, fontWeight = FontWeight.SemiBold)
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    SquareIconActionButton(Icons.Outlined.Add, "Añadir productos", onEdit)
                    SquareIconActionButton(Icons.Outlined.Visibility, "Ver lista", onView)
                }
            }
        }
    }
}

@Composable
private fun HouseholdCard(
    household: HouseholdUiModel,
    listCount: Int,
    selected: Boolean,
    isOwner: Boolean = false,
    onOpen: () -> Unit,
    onOpenLists: () -> Unit = {},
    expanded: Boolean = false,
    onToggleExpanded: () -> Unit = {},
    onRename: () -> Unit = {},
    onDelete: () -> Unit = {},
    onLeave: () -> Unit = {},
    onMembers: () -> Unit = {},
    onNfcCode: () -> Unit = {},
) {
    Card(colors = CardDefaults.cardColors(containerColor = if (selected) WebLime.copy(alpha = 0.85f) else WebSurface)) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(onClick = onToggleExpanded)
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(household.name, style = MaterialTheme.typography.titleMedium, color = if (selected) OnLime else WebText, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text("$listCount ${if (listCount == 1) "lista activa" else "listas activas"}", style = MaterialTheme.typography.bodySmall, color = if (selected) OnLimeMuted else WebMuted, fontWeight = FontWeight.SemiBold)
                }
                Button(
                    onClick = if (selected) onOpenLists else onOpen,
                    shape = MaterialTheme.shapes.medium,
                    colors = webPrimaryButtonColors(),
                ) { Text(if (selected) "Acceder" else "Abrir") }
                IconButton(onClick = onToggleExpanded) {
                    Icon(
                        imageVector = if (expanded) Icons.Outlined.KeyboardArrowUp else Icons.Outlined.KeyboardArrowDown,
                        contentDescription = if (expanded) "Compactar hogar" else "Desplegar hogar",
                        tint = if (selected) OnLimeMuted else WebPrimary,
                    )
                }
            }
            if (expanded) {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            if (isOwner) {
                                Text("Dueño del hogar", style = MaterialTheme.typography.titleLarge, color = if (selected) OnLime else WebPrimary, fontWeight = FontWeight.Black, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            } else {
                                Text("Miembro del hogar", color = if (selected) OnLime else WebMuted, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                            }
                            Text(if (selected) "Hogar abierto" else "Hogar disponible", color = if (selected) OnLime else WebMuted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                        }
                        if (isOwner) {
                            SquareSmallActionButton(Icons.Outlined.Edit, "Editar hogar", if (selected) OnLime else WebPrimary, onRename)
                            SquareSmallActionButton(Icons.Outlined.Delete, "Eliminar hogar", Color(0xFFB91C1C), onDelete)
                        } else {
                            SquareSmallActionButton(Icons.Outlined.Edit, "Solo el dueño puede editar", WebMuted, {})
                            SquareSmallActionButton(Icons.Outlined.Logout, "Salir del hogar", Color(0xFFB91C1C), onLeave)
                        }
                    }
                    Button(
                        onClick = onMembers,
                        modifier = Modifier.fillMaxWidth().height(48.dp),
                        shape = MaterialTheme.shapes.medium,
                        colors = webPrimaryButtonColors(),
                    ) {
                        Icon(Icons.Outlined.Person, contentDescription = null, modifier = Modifier.size(18.dp))
                        Text("  Miembros")
                    }
                    Button(
                        onClick = onNfcCode,
                        modifier = Modifier.fillMaxWidth().height(48.dp),
                        shape = MaterialTheme.shapes.medium,
                        colors = ButtonDefaults.buttonColors(containerColor = WebSurface, contentColor = WebPrimary),
                    ) {
                        Icon(Icons.Outlined.ContentCopy, contentDescription = null, modifier = Modifier.size(18.dp))
                        Text("  Codigo NFC")
                    }
                }
            }
        }
    }
}

@Composable
private fun NfcCodeDialog(household: HouseholdUiModel, onDismiss: () -> Unit) {
    val clipboard = LocalClipboardManager.current
    val context = LocalContext.current
    val nfcUrl = remember(household.id) { "https://nfcompra.esgarpe.dev/household/${household.id}/lists" }
    AlertDialog(
        onDismissRequest = onDismiss,
        shape = MaterialTheme.shapes.large,
        containerColor = WebSurface,
        title = { DialogTitle("Codigo NFC") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(household.name, color = WebText, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                StyledOutlinedTextField(
                    value = nfcUrl,
                    onValueChange = {},
                    label = "Codigo URL / URI",
                    readOnly = true,
                    trailing = {
                        IconButton(
                            onClick = {
                                clipboard.setText(AnnotatedString(nfcUrl))
                                Toast.makeText(context, "Codigo NFC copiado", Toast.LENGTH_SHORT).show()
                            },
                        ) {
                            Icon(Icons.Outlined.ContentCopy, contentDescription = "Copiar codigo NFC", tint = WebPrimary)
                        }
                    },
                )
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    clipboard.setText(AnnotatedString(nfcUrl))
                    Toast.makeText(context, "Codigo NFC copiado", Toast.LENGTH_SHORT).show()
                },
                shape = MaterialTheme.shapes.medium,
                colors = webPrimaryButtonColors(),
            ) {
                Icon(Icons.Outlined.ContentCopy, contentDescription = null, modifier = Modifier.size(18.dp))
                Text("  Copiar")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, colors = ButtonDefaults.textButtonColors(contentColor = WebMuted)) {
                Text("Cerrar")
            }
        },
    )
}

@Composable
private fun SquareSmallActionButton(icon: ImageVector, contentDescription: String, color: Color, onClick: () -> Unit) {
    IconButton(
        onClick = onClick,
        modifier = Modifier
            .size(42.dp)
            .clip(MaterialTheme.shapes.medium)
            .border(1.dp, color.copy(alpha = 0.45f), MaterialTheme.shapes.medium)
            .background(color.copy(alpha = 0.08f)),
    ) {
        Icon(icon, contentDescription = contentDescription, tint = color, modifier = Modifier.size(20.dp))
    }
}

@Composable
private fun ShoppingListSummaryCard(
    list: ShoppingListSummaryUiModel,
    householdName: String,
    selected: Boolean,
    pinned: Boolean,
    onTogglePinned: () -> Unit,
    onEdit: () -> Unit,
    onView: () -> Unit,
) {
    Card(colors = CardDefaults.cardColors(containerColor = if (selected) WebLime else WebSurface)) {
        Column(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Row(modifier = Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    PinButton(pinned = pinned, onClick = onTogglePinned)
                    Column(modifier = Modifier.weight(1f)) {
                        Text(list.name, style = MaterialTheme.typography.titleMedium, color = if (selected) OnLime else WebText, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(householdName.ifBlank { "Hogar" }, style = MaterialTheme.typography.bodySmall, color = if (selected) OnLimeMuted else WebMuted, fontWeight = FontWeight.SemiBold)
                    }
                }
                Text(if (selected) "Activa" else "", color = if (selected) OnLimeMuted else WebPrimary, fontWeight = FontWeight.Bold)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                WideIconActionButton(Icons.Outlined.Add, "Añadir", Modifier.weight(1f), onEdit)
                WideIconActionButton(Icons.Outlined.Visibility, "Ver lista", Modifier.weight(1f), onView)
            }
        }
    }
}

@Composable
private fun ShoppingListGridCard(
    list: ShoppingListSummaryUiModel,
    selected: Boolean,
    pendingCount: Int?,
    checkedCount: Int?,
    pinned: Boolean,
    modifier: Modifier = Modifier,
    onTogglePinned: () -> Unit,
    onEdit: () -> Unit,
    onView: () -> Unit,
    onDelete: () -> Unit,
) {
    Column(
        modifier = modifier
            .height(190.dp)
            .clip(MaterialTheme.shapes.large)
            .background(if (pinned) WebLime else WebSurface)
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(5.dp), modifier = Modifier.weight(1f, fill = false)) {
            Text(
                text = list.name,
                style = MaterialTheme.typography.titleMedium,
                color = if (pinned) OnLime else WebText,
                fontWeight = FontWeight.Bold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            ListCardStat("Pendientes", pendingCount?.toString() ?: "—")
            ListCardStat("Comprados", checkedCount?.toString() ?: "—")
        }
        Column(verticalArrangement = Arrangement.spacedBy(5.dp), modifier = Modifier.fillMaxWidth()) {
            Row(horizontalArrangement = Arrangement.spacedBy(5.dp), modifier = Modifier.fillMaxWidth()) {
                WideIconActionButton(
                    icon = Icons.Outlined.PushPin,
                    contentDescription = if (pinned) "Desfijar lista" else "Fijar lista",
                    modifier = Modifier.weight(1f),
                    onClick = onTogglePinned,
                    containerColor = if (pinned) Color.White else WebPrimary.copy(alpha = 0.72f),
                    iconTint = if (pinned) Color.Black else Color.White,
                    height = 34.dp,
                )
                WideIconActionButton(
                    icon = Icons.Outlined.Delete,
                    contentDescription = "Eliminar lista",
                    modifier = Modifier.weight(1f),
                    onClick = onDelete,
                    containerColor = Color(0xFFB42318).copy(alpha = 0.82f),
                    height = 34.dp,
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(5.dp), modifier = Modifier.fillMaxWidth()) {
                WideIconActionButton(
                    icon = Icons.Outlined.Edit,
                    contentDescription = "Editar lista",
                    modifier = Modifier.weight(1f),
                    onClick = onEdit,
                    containerColor = WebPrimary.copy(alpha = 0.82f),
                    height = 34.dp,
                )
                WideIconActionButton(
                    icon = Icons.Outlined.Visibility,
                    contentDescription = "Ver lista",
                    modifier = Modifier.weight(1f),
                    onClick = onView,
                    containerColor = WebPrimary.copy(alpha = 0.82f),
                    height = 34.dp,
                )
            }
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
private fun PinButton(pinned: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(34.dp)
            .clip(MaterialTheme.shapes.medium)
            .background(if (pinned) WebPrimary else Color(0xFFEAF6EF))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            Icons.Outlined.PushPin,
            contentDescription = if (pinned) "Desfijar lista" else "Fijar lista",
            tint = if (pinned) Color.White else WebPrimary,
            modifier = Modifier.size(18.dp),
        )
    }
}

@Composable
private fun SquareIconActionButton(icon: ImageVector, contentDescription: String, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(46.dp)
            .clip(MaterialTheme.shapes.medium)
            .background(WebPrimary)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = contentDescription, tint = Color.White, modifier = Modifier.size(20.dp))
    }
}

@Composable
private fun WideIconActionButton(
    icon: ImageVector,
    contentDescription: String,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
    containerColor: Color = WebPrimary,
    iconTint: Color = Color.White,
    height: Dp = 44.dp,
) {
    Box(
        modifier = modifier
            .height(height)
            .clip(MaterialTheme.shapes.medium)
            .background(containerColor)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = contentDescription, tint = iconTint, modifier = Modifier.size(20.dp))
    }
}

@Composable
private fun EmptyListForHousehold(onCreateList: () -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = WebSurface)) {
        Column(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("No hay listas asociadas a este hogar.", color = WebMuted, fontWeight = FontWeight.SemiBold)
            Button(onClick = onCreateList, shape = MaterialTheme.shapes.medium, colors = webPrimaryButtonColors()) { Text("Crear lista") }
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
        Button(onClick = onRetry, shape = MaterialTheme.shapes.medium, colors = webPrimaryButtonColors()) { Text("Reintentar carga") }
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
        Button(onClick = { onCreate(name.trim()) }, enabled = name.isNotBlank(), shape = MaterialTheme.shapes.medium, colors = webPrimaryButtonColors()) {
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
            Button(onClick = { if (name.isNotBlank()) onConfirm(name.trim()) }, enabled = name.isNotBlank(), shape = MaterialTheme.shapes.medium, colors = webPrimaryButtonColors()) {
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
        confirmButton = { Button(onClick = onConfirm, shape = MaterialTheme.shapes.medium, colors = webPrimaryButtonColors()) { Text("Confirmar") } },
        dismissButton = { TextButton(onClick = onDismiss, colors = ButtonDefaults.textButtonColors(contentColor = WebMuted)) { Text("Cancelar") } },
    )
}

@Composable
private fun ClearShoppingListConfirmDialog(title: String, message: String, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = WebSurface,
        title = { DialogTitle(title) },
        text = { Text(message, color = WebMuted, fontWeight = FontWeight.SemiBold) },
        confirmButton = { Button(onClick = onConfirm, shape = MaterialTheme.shapes.medium, colors = webPrimaryButtonColors()) { Text("Vaciar") } },
        dismissButton = { TextButton(onClick = onDismiss, colors = ButtonDefaults.textButtonColors(contentColor = WebMuted)) { Text("Cancelar") } },
    )
}

@Composable
private fun CreateListDialog(
    households: List<HouseholdUiModel>,
    selectedHouseholdId: String?,
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
                        trailing = { Text("▼", color = WebPrimary, fontWeight = FontWeight.Bold) },
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
                shape = MaterialTheme.shapes.medium,
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
    onSetProductFavorite: suspend (String, Boolean) -> ProductCatalogUiModel? = { _, _ -> null },
    categories: List<ProductCategoryUiModel> = emptyList(),
    onCreateProduct: suspend (String, String?, String, String?, String?) -> ProductCatalogUiModel? = { _, _, _, _, _ -> null },
    canCreateProduct: Boolean = true,
    readOnly: Boolean = false,
    onRename: () -> Unit = {},
    onClearChecked: () -> Unit = {},
    onDelete: () -> Unit = {},
) {
    var addName by remember { mutableStateOf("") }
    var cardMode by remember { mutableStateOf(true) }
    var suggestions by remember { mutableStateOf(emptyList<ProductCatalogUiModel>()) }
    var isProductSearchOpen by remember { mutableStateOf(false) }
    var cardQuantities by remember { mutableStateOf(emptyMap<String, Int>()) }
    var activeListProductId by remember { mutableStateOf<String?>(null) }
    var waitlist by remember { mutableStateOf(emptyList<PendingProductUiModel>()) }
    var recentlyAddedId by remember { mutableStateOf<String?>(null) }
    var createProductDialogOpen by remember { mutableStateOf(false) }
    var clearListDialogOpen by remember { mutableStateOf(false) }
    val searchScope = rememberCoroutineScope()
    val voiceSearch = rememberProductVoiceSearch(
        enabled = !state.isOffline,
        onResult = {
            addName = it
            isProductSearchOpen = true
        },
    )
    fun queueProduct(suggestion: ProductCatalogUiModel) {
        val selectedQuantity = cardQuantities[suggestion.id] ?: 0
        if (selectedQuantity <= 0) return
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
        activeListProductId = null
        suggestions = emptyList()
        addName = ""
        isProductSearchOpen = false
    }
    suspend fun refreshSuggestions(query: String = addName, mode: Boolean = cardMode, createdProduct: ProductCatalogUiModel? = null) {
        val search = query.trim()
        if (state.isOffline || search.length < 2) {
            suggestions = emptyList()
            return
        }
        val loaded = onSearchProducts(search, if (mode) 12 else 8)
        suggestions = if (createdProduct != null && createdProduct.matchesSearch(search)) {
            (listOf(createdProduct) + loaded).distinctBy { it.id }
        } else {
            loaded
        }
    }
    val toggleFavorite: (ProductCatalogUiModel) -> Unit = { product ->
        val nextFavorite = !product.isFavorite
        suggestions = suggestions.map { if (it.id == product.id) it.copy(isFavorite = nextFavorite) else it }
        searchScope.launch {
            val updated = onSetProductFavorite(product.id, nextFavorite)
            if (updated != null) {
                val visibleProduct = if (updated.name.isBlank()) product.copy(isFavorite = updated.isFavorite) else updated
                suggestions = suggestions.map { if (it.id == visibleProduct.id) visibleProduct else it }
            } else {
                suggestions = suggestions.map { if (it.id == product.id) product else it }
            }
        }
    }

    LaunchedEffect(addName, cardMode, state.isOffline) {
        val search = addName.trim()
        if (state.isOffline || search.length < 2) {
            suggestions = emptyList()
            return@LaunchedEffect
        }
        delay(if (cardMode) 80 else 150)
        refreshSuggestions(search, cardMode)
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
            .padding(horizontal = responsiveWidthDp(0.051f))
            .padding(top = 8.dp, bottom = screenBottomPadding()),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        if (!readOnly) {
            item {
                ShoppingListWebHeader(
                    isOffline = state.isOffline,
                    productName = addName,
                    cardMode = cardMode,
                    voiceSearchAvailable = voiceSearch.available,
                    voiceSearchListening = voiceSearch.listening,
                    onProductNameChange = {
                        addName = it
                        isProductSearchOpen = true
                    },
                    onProductFocus = { isProductSearchOpen = true },
                    onVoiceSearch = voiceSearch.start,
                    onCardModeChange = {
                        cardMode = it
                        isProductSearchOpen = true
                    },
                    canCreateProduct = canCreateProduct,
                    onCreateProduct = { createProductDialogOpen = true },
                    onClearChecked = { clearListDialogOpen = true },
                )
            }
        }
        if (!readOnly && !cardMode && isProductSearchOpen && suggestions.isNotEmpty()) {
            item {
                ProductSuggestionDropdown(
                    suggestions = suggestions,
                    quantities = cardQuantities,
                    activeProductId = activeListProductId,
                    onToggleFavorite = toggleFavorite,
                    onQuantityChange = { productId, delta ->
                        cardQuantities = cardQuantities + (productId to ((cardQuantities[productId] ?: 0) + delta).coerceAtLeast(0))
                    },
                    onSelect = { suggestion ->
                        if (activeListProductId != suggestion.id) {
                            activeListProductId = suggestion.id
                        } else {
                            queueProduct(suggestion)
                        }
                    },
                )
            }
        }
        if (!readOnly && cardMode && isProductSearchOpen && suggestions.isNotEmpty()) {
            item {
                ProductCardResults(
                    suggestions = suggestions,
                    quantities = cardQuantities,
                    recentlyAddedId = recentlyAddedId,
                    onToggleFavorite = toggleFavorite,
                    onQuantityChange = { productId, delta ->
                        cardQuantities = cardQuantities + (productId to ((cardQuantities[productId] ?: 0) + delta).coerceAtLeast(0))
                    },
                    onSelect = { suggestion -> queueProduct(suggestion) },
                )
            }
        }
        if (!readOnly && waitlist.isNotEmpty()) {
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
                        activeListProductId = null
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
                    ShoppingItem(item, onAction, accentColor = PendingAccent, readOnly = readOnly)
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
                    ShoppingItem(item, onAction, accentColor = CheckedAccent, readOnly = readOnly)
                }
            }
        }
        item {
            Spacer(modifier = Modifier.height(bottomNavigationScrollReserve()))
        }
    }
    if (createProductDialogOpen) {
        CatalogMutationDialog(
            categories = categories,
            selectedCategory = categories.firstOrNull { !it.isFavorite },
            initialProductName = addName,
            productOnly = true,
            onDismiss = { createProductDialogOpen = false },
            onSubmitCategory = { _, _ -> },
            onSubmitProduct = { name, categoryId, icon, brand, packageSize ->
                searchScope.launch {
                    val created = onCreateProduct(name, categoryId, icon, brand, packageSize)
                    if (created != null) {
                        createProductDialogOpen = false
                        addName = created.name
                        activeListProductId = created.id
                        cardQuantities = cardQuantities + (created.id to (cardQuantities[created.id] ?: 0))
                        isProductSearchOpen = true
                        refreshSuggestions(query = created.name, createdProduct = created)
                    }
                }
            },
        )
    }
    if (clearListDialogOpen) {
        ClearShoppingListConfirmDialog(
            title = "Vaciar lista",
            message = "¿Seguro que quieres vaciar esta lista? Se eliminarán los productos comprados.",
            onConfirm = {
                clearListDialogOpen = false
                onClearChecked()
            },
            onDismiss = { clearListDialogOpen = false },
        )
    }
}

private data class ProductVoiceSearchState(
    val available: Boolean,
    val listening: Boolean,
    val start: () -> Unit,
)

object ProductVoiceSearchPermissionRegistry {
    private const val RECORD_AUDIO_PERMISSION_REQUEST_CODE = 73
    private var onPermissionGranted: (() -> Unit)? = null

    fun request(activity: Activity, onGranted: () -> Unit) {
        onPermissionGranted = onGranted
        ActivityCompat.requestPermissions(
            activity,
            arrayOf(Manifest.permission.RECORD_AUDIO),
            RECORD_AUDIO_PERMISSION_REQUEST_CODE,
        )
    }

    fun onRequestPermissionsResult(requestCode: Int, grantResults: IntArray): Boolean {
        if (requestCode != RECORD_AUDIO_PERMISSION_REQUEST_CODE) return false
        val onGranted = onPermissionGranted
        onPermissionGranted = null
        if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
            onGranted?.invoke()
        }
        return true
    }

    fun clearPending() {
        onPermissionGranted = null
    }
}

@Composable
private fun rememberProductVoiceSearch(
    enabled: Boolean,
    onResult: (String) -> Unit,
): ProductVoiceSearchState {
    val context = LocalContext.current
    var listening by remember { mutableStateOf(false) }
    var recognizer by remember { mutableStateOf<SpeechRecognizer?>(null) }
    val available = remember(context) { SpeechRecognizer.isRecognitionAvailable(context) }
    fun stopRecognizer() {
        recognizer?.cancel()
        recognizer?.destroy()
        recognizer = null
        listening = false
    }
    fun startListening() {
        if (!enabled || !available || listening || recognizer != null) return
        val speechRecognizer = SpeechRecognizer.createSpeechRecognizer(context)
        recognizer = speechRecognizer
        speechRecognizer.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) = Unit
            override fun onBeginningOfSpeech() = Unit
            override fun onRmsChanged(rmsdB: Float) = Unit
            override fun onBufferReceived(buffer: ByteArray?) = Unit
            override fun onEndOfSpeech() = Unit
            override fun onPartialResults(partialResults: Bundle?) = Unit
            override fun onEvent(eventType: Int, params: Bundle?) = Unit
            override fun onError(error: Int) {
                stopRecognizer()
            }
            override fun onResults(results: Bundle?) {
                val text = results
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull()
                    ?.trim()
                if (!text.isNullOrBlank()) onResult(text)
                stopRecognizer()
            }
        })
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault().toLanguageTag())
            .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        listening = true
        speechRecognizer.startListening(intent)
    }
    DisposableEffect(Unit) {
        onDispose {
            stopRecognizer()
            ProductVoiceSearchPermissionRegistry.clearPending()
        }
    }
    val start: () -> Unit = {
        if (!enabled || !available || listening) {
            Unit
        } else if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            startListening()
        } else {
            val activity = context.findActivity()
            if (activity != null) {
                ProductVoiceSearchPermissionRegistry.request(activity, ::startListening)
            } else {
                Toast.makeText(context, "No se pudo pedir permiso para usar el micrófono.", Toast.LENGTH_SHORT).show()
            }
        }
    }
    return ProductVoiceSearchState(available = available, listening = listening, start = start)
}

private tailrec fun Context.findActivity(): Activity? =
    when (this) {
        is Activity -> this
        is ContextWrapper -> baseContext.findActivity()
        else -> null
    }

@Composable
private fun ShoppingListWebHeader(
    isOffline: Boolean,
    productName: String,
    cardMode: Boolean,
    voiceSearchAvailable: Boolean,
    voiceSearchListening: Boolean,
    onProductNameChange: (String) -> Unit,
    onProductFocus: () -> Unit,
    onVoiceSearch: () -> Unit,
    onCardModeChange: (Boolean) -> Unit,
    canCreateProduct: Boolean,
    onCreateProduct: () -> Unit,
    onClearChecked: () -> Unit,
) {
    Card(colors = CardDefaults.cardColors(containerColor = WebSurface)) {
        Column(modifier = Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                    Button(
                        onClick = onClearChecked,
                        modifier = Modifier.height(42.dp),
                        shape = MaterialTheme.shapes.medium,
                        colors = webPrimaryButtonColors(),
                    ) {
                        Text("Vaciar")
                    }
                }
                Spacer(modifier = Modifier.weight(1f))
                Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.CenterEnd) {
                    ViewModeSwitch(cardMode = cardMode, onCardModeChange = onCardModeChange)
                }
            }
            if (isOffline) {
                Text("Sin conexión", color = MaterialTheme.colorScheme.error, fontWeight = FontWeight.SemiBold)
            }
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                CompactInputBlock(label = "Producto", modifier = Modifier.weight(1f)) {
                    CompactProductField(productName, onProductNameChange, Modifier.fillMaxWidth(), onFocus = onProductFocus)
                }
                SquareHeaderButton(
                    contentDescription = if (voiceSearchListening) "Escuchando" else "Buscar producto por voz",
                    background = if (voiceSearchListening) WebPrimary else WebSubtleSurface,
                    contentColor = if (voiceSearchListening) Color.White else WebPrimary,
                    enabled = voiceSearchAvailable && !isOffline,
                    size = ProductEntryControlHeight,
                    onClick = onVoiceSearch,
                ) {
                    Icon(Icons.Outlined.Mic, contentDescription = null, modifier = Modifier.size(20.dp))
                }
                if (canCreateProduct) {
                    QuickCreateProductButton(onClick = onCreateProduct, enabled = !isOffline, size = ProductEntryControlHeight)
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
            .background(WebSubtleSurface)
            .border(1.dp, WebBorder, MaterialTheme.shapes.medium)
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
                ListModeGlyph(color = if (!cardMode) Color.White else WebPrimary)
            }
            Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.Center) {
                GridModeGlyph(color = if (cardMode) Color.White else WebPrimary)
            }
        }
    }
}

@Composable
private fun ListModeGlyph(color: Color) {
    Canvas(modifier = Modifier.size(22.dp)) {
        val startX = size.width * 0.24f
        val endX = size.width * 0.76f
        for (fraction in listOf(0.28f, 0.5f, 0.72f)) {
            val y = size.height * fraction
            drawLine(color = color, start = Offset(startX, y), end = Offset(endX, y), strokeWidth = 2.8f)
        }
    }
}

@Composable
private fun GridModeGlyph(color: Color) {
    Canvas(modifier = Modifier.size(22.dp)) {
        val cell = size.width * 0.28f
        val gap = size.width * 0.12f
        val left = size.width * 0.16f
        val top = size.height * 0.16f
        repeat(2) { row ->
            repeat(2) { col ->
                drawRoundRect(
                    color = color,
                    topLeft = Offset(left + col * (cell + gap), top + row * (cell + gap)),
                    size = Size(cell, cell),
                    cornerRadius = androidx.compose.ui.geometry.CornerRadius(2.6f, 2.6f),
                    style = Stroke(width = 2.4f),
                )
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
        modifier = modifier.height(ProductEntryControlHeight).onFocusChanged { if (it.isFocused) onFocus() },
        singleLine = true,
        textStyle = TextStyle(fontSize = 16.sp, lineHeight = 20.sp),
        shape = MaterialTheme.shapes.medium,
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = WebLime,
            unfocusedBorderColor = WebLime,
            disabledBorderColor = WebLime.copy(alpha = 0.45f),
            cursorColor = WebPrimary,
            focusedContainerColor = WebPage,
            unfocusedContainerColor = WebPage,
            disabledContainerColor = WebPage.copy(alpha = 0.65f),
        ),
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
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxSize()
                .clickable(onClick = onDecrease),
            contentAlignment = Alignment.Center,
        ) {
            Text("−", color = accentColor, fontWeight = FontWeight.Black, fontSize = 24.sp, lineHeight = 24.sp)
        }
        Text(quantity.toString(), color = WebText, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, modifier = Modifier.weight(0.9f))
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxSize()
                .clickable(onClick = onIncrease),
            contentAlignment = Alignment.Center,
        ) {
            Text("+", color = accentColor, fontWeight = FontWeight.Black, fontSize = 24.sp, lineHeight = 24.sp)
        }
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
    quantities: Map<String, Int>,
    activeProductId: String?,
    onToggleFavorite: (ProductCatalogUiModel) -> Unit,
    onQuantityChange: (String, Int) -> Unit,
    onSelect: (ProductCatalogUiModel) -> Unit,
) {
    val keyboardDismissScroll = keyboardDismissNestedScroll()
    LazyColumn(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(max = 330.dp)
            .nestedScroll(keyboardDismissScroll)
            .clip(MaterialTheme.shapes.large)
            .background(WebSurface)
            .border(1.dp, Color(0xFFCFE4D7), MaterialTheme.shapes.large)
            .padding(8.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        items(suggestions, key = { it.id }) { suggestion ->
            val active = activeProductId == suggestion.id
            val quantity = quantities[suggestion.id] ?: 0
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(MaterialTheme.shapes.medium)
                    .clickable { onSelect(suggestion) }
                    .background(
                        when {
                            active -> WebLime.copy(alpha = 0.28f)
                            suggestion.scope == "household" -> WebHouseholdSoft.copy(alpha = 0.7f)
                            else -> Color.Transparent
                        },
                    )
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                if (!active) {
                    CompactFavoriteButton(
                        favorite = suggestion.isFavorite,
                        onClick = { onToggleFavorite(suggestion) },
                    )
                }
                Column(modifier = Modifier.weight(1f, fill = true)) {
                    Text(suggestion.name, color = WebText, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(suggestion.metaLabel(), color = WebMuted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                if (active) {
                    QuantityStepper(
                        quantity = quantity,
                        onDecrease = { onQuantityChange(suggestion.id, -1) },
                        onIncrease = { onQuantityChange(suggestion.id, 1) },
                        modifier = Modifier.width(132.dp).height(42.dp),
                    )
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
    onToggleFavorite: (ProductCatalogUiModel) -> Unit,
    onQuantityChange: (String, Int) -> Unit,
    onSelect: (ProductCatalogUiModel) -> Unit,
) {
    val keyboardDismissScroll = keyboardDismissNestedScroll()
    LazyColumn(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(max = 390.dp)
            .nestedScroll(keyboardDismissScroll),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        items(suggestions.chunked(2)) { rowProducts ->
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                rowProducts.forEach { suggestion ->
                    ProductResultCard(
                        suggestion = suggestion,
                        quantity = quantities[suggestion.id] ?: 0,
                        recentlyAdded = recentlyAddedId == suggestion.id,
                        onToggleFavorite = { onToggleFavorite(suggestion) },
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
private fun keyboardDismissNestedScroll(): NestedScrollConnection {
    val keyboardController = LocalSoftwareKeyboardController.current
    val focusManager = LocalFocusManager.current
    return remember(keyboardController, focusManager) {
        object : NestedScrollConnection {
            override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset {
                if (available.y != 0f) {
                    keyboardController?.hide()
                    focusManager.clearFocus()
                }
                return Offset.Zero
            }
        }
    }
}

@Composable
private fun FavoriteButton(favorite: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(38.dp)
            .clip(MaterialTheme.shapes.medium)
            .background(if (favorite) WebLime else WebSubtleSurface)
            .border(
                width = 1.dp,
                color = if (favorite) OnLimeMuted else WebBorder,
                shape = MaterialTheme.shapes.medium,
            )
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = if (favorite) "\u2605" else "\u2606",
            color = if (favorite) OnLimeMuted else WebPrimary,
            fontWeight = FontWeight.Black,
            fontSize = 21.sp,
            lineHeight = 21.sp,
        )
    }
}

@Composable
private fun CompactFavoriteButton(favorite: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(30.dp)
            .clip(MaterialTheme.shapes.small)
            .background(if (favorite) WebLime else WebSubtleSurface)
            .border(
                width = 1.dp,
                color = if (favorite) OnLimeMuted else WebBorder,
                shape = MaterialTheme.shapes.small,
            )
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = if (favorite) "\u2605" else "\u2606",
            color = if (favorite) OnLimeMuted else WebPrimary,
            fontWeight = FontWeight.Black,
            fontSize = 16.sp,
            lineHeight = 16.sp,
        )
    }
}

@Composable
private fun QuickCreateProductButton(onClick: () -> Unit, enabled: Boolean = true, size: Dp = 42.dp) {
    IconButton(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier
            .size(size)
            .clip(MaterialTheme.shapes.medium)
            .background(WebLime.copy(alpha = 0.95f))
            .semantics { contentDescription = "Crear producto" },
    ) {
        Icon(Icons.Outlined.Add, contentDescription = null, tint = Color.White, modifier = Modifier.size(24.dp))
    }
}

@Composable
private fun CatalogMiniActionButton(
    contentDescription: String,
    onClick: () -> Unit,
    content: @Composable () -> Unit,
) {
    Box(
        modifier = Modifier
            .size(30.dp)
            .clip(MaterialTheme.shapes.small)
            .background(WebSubtleSurface)
            .border(1.dp, WebBorder, MaterialTheme.shapes.small)
            .clickable(onClick = onClick)
            .semantics { this.contentDescription = contentDescription },
        contentAlignment = Alignment.Center,
    ) {
        content()
    }
}

@Composable
private fun ProductResultCard(
    suggestion: ProductCatalogUiModel,
    quantity: Int,
    recentlyAdded: Boolean,
    onToggleFavorite: () -> Unit,
    onQuantityChange: (Int) -> Unit,
    onSelect: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val isHousehold = suggestion.scope == "household"
    val borderColor = when {
        recentlyAdded -> WebPrimary
        isHousehold -> WebHouseholdBorder
        else -> WebBorder
    }
    Card(
        modifier = modifier
            .defaultMinSize(minHeight = 210.dp)
            .border(1.dp, borderColor, MaterialTheme.shapes.large),
        colors = CardDefaults.cardColors(
            containerColor = when {
                recentlyAdded -> WebLime.copy(alpha = 0.45f)
                isHousehold -> WebHouseholdSoft
                else -> WebSurface
            },
        ),
    ) {
        Column(
            modifier = Modifier.padding(10.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(
                text = suggestion.name,
                color = if (recentlyAdded) OnLime else WebText,
                fontWeight = FontWeight.Bold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.titleMedium,
                minLines = 2,
            )
            Text(
                suggestion.metaLabel(),
                color = if (recentlyAdded) OnLimeMuted else WebMuted,
                fontSize = 11.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            QuantityStepper(
                quantity = quantity,
                onDecrease = { onQuantityChange(-1) },
                onIncrease = { onQuantityChange(1) },
                modifier = Modifier.fillMaxWidth(),
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Button(
                    onClick = onSelect,
                    enabled = quantity > 0,
                    shape = MaterialTheme.shapes.medium,
                    colors = webPrimaryButtonColors(),
                    modifier = Modifier.weight(1f).height(40.dp),
                ) {
                    Text("Añadir")
                }
                CompactFavoriteButton(
                    favorite = suggestion.isFavorite,
                    onClick = onToggleFavorite,
                )
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

private fun ProductCatalogUiModel.matchesSearch(search: String): Boolean {
    val query = search.normalizedUiSearch()
    if (query.isBlank()) return true
    val name = normalizedName.ifBlank { name.normalizedUiSearch() }
    return name.startsWith(query) ||
        name.split(' ').any { it.startsWith(query) } ||
        name.contains(query) ||
        categoryName.orEmpty().normalizedUiSearch().contains(query)
}

private fun PendingProductUiModel.metaLabel(): String =
    listOfNotNull(categoryName, packageSize).filter { it.isNotBlank() }.joinToString(" · ")

private fun productIcon(product: ProductCatalogUiModel): String {
    val text = "${product.iconKey} ${product.categoryName.orEmpty()} ${product.name}".normalizedUiSearch()
    return productIconFromText(text)
}

private fun productIconFromText(text: String): String = when {
    text.contains("panal") || text.contains("panales") || text.contains("diaper") -> "\uD83E\uDDF7"
    text.contains("refresco") || text.contains("gaseosa") || text.contains("soft-drink") || text.contains("coca-cola") -> "\uD83E\uDD64"
    text.contains("agua mineral") || text.contains("agua con gas") || text.contains("agua de soda") || text.contains("agua de coco") || text.contains("agua destilada") || text.contains("water") || text.contains("bottle") -> "\uD83D\uDCA7"
    text.contains("zumo") || text.contains("jugo") || text.contains("juice") -> "\uD83E\uDDC3"
    text.contains("vino") || text.contains("bodega") || text.contains("wine") -> "\uD83C\uDF77"
    text.contains("cerveza") || text.contains("beer") -> "\uD83C\uDF7A"
    text.contains("cafe") || text.contains("infusion") || text.contains("coffee") -> "\u2615"
    text.contains("bebida") || text.contains("drink") -> "\uD83E\uDD64"
    text.contains("acondicionador") || text.contains("pantene") || text.contains("cabello") || text.contains("capilar") || text.contains("hair-care") -> "\uD83E\uDDF4"
    text.contains("arroz") || text.contains("rice") -> "\uD83C\uDF5A"
    text.contains("pasta") || text.contains("macarron") || text.contains("espagueti") || text.contains("tallar") -> "\uD83C\uDF5D"
    text.contains("alubia") || text.contains("judia") || text.contains("garbanzo") || text.contains("lenteja") || text.contains("legumbre") || text.contains("beans") -> "\uD83E\uDED8"
    text.contains("cacao") || text.contains("chocolate") || text.contains("bombon") -> "\uD83C\uDF6B"
    text.contains("salsa") || text.contains("mayonesa") || text.contains("mostaza") || text.contains("ketchup") -> "\uD83E\uDED9"
    text.contains("atun") || text.contains("pescado") || text.contains("marisco") || text.contains("fish") -> "\uD83D\uDC1F"
    text.contains("aceite") || text.contains("oliva") || text.contains("aceituna") || text.contains("oil") -> "\uD83E\uDED2"
    text.contains("huevo") || text.contains("egg") -> "\uD83E\uDD5A"
    text.contains("queso") || text.contains("cheese") -> "\uD83E\uDDC0"
    text.contains("mantequilla") || text.contains("butter") -> "\uD83E\uDDC8"
    text.contains("harina") || text.contains("flour") -> "\uD83C\uDF3E"
    text.hasWord("sal") || text.contains("especia") || text.contains("pimienta") -> "\uD83E\uDDC2"
    text.contains("galleta") || text.contains("cereal") || text.contains("cookie") -> "\uD83C\uDF6A"
    text.contains("azucar") || text.contains("caramelo") || text.contains("dulce") || text.contains("candy") -> "\uD83C\uDF6C"
    text.contains("postre") || text.contains("flan") || text.contains("natilla") || text.contains("dessert") -> "\uD83C\uDF6E"
    text.contains("helado") || text.contains("congelado") || text.contains("frozen") -> "\uD83E\uDDCA"
    text.contains("pizza") -> "\uD83C\uDF55"
    text.contains("sopa") || text.contains("caldo") || text.contains("crema") || text.contains("soup") -> "\uD83E\uDD63"
    text.hasWord("pan") || text.contains("panaderia") || text.contains("panecillo") || text.contains("bolleria") || text.contains("bread") -> "\uD83E\uDD56"
    text.contains("leche") || text.contains("lacteo") || text.contains("yogur") || text.contains("milk") -> "\uD83E\uDD5B"
    text.contains("tomate") -> "\uD83C\uDF45"
    text.contains("patata") || text.contains("papa") || text.contains("potato") -> "\uD83E\uDD54"
    text.contains("cebolla") || text.contains("onion") -> "\uD83E\uDDC5"
    text.contains("ajo") || text.contains("garlic") -> "\uD83E\uDDC4"
    text.contains("platano") || text.contains("banana") -> "\uD83C\uDF4C"
    text.contains("naranja") || text.contains("mandarina") || text.contains("orange") -> "\uD83C\uDF4A"
    text.contains("limon") || text.contains("lemon") -> "\uD83C\uDF4B"
    text.contains("fruta") || text.contains("manzana") || text.contains("apple") -> "\uD83C\uDF4E"
    text.contains("verdura") || text.contains("zanahoria") || text.contains("carrot") -> "\uD83E\uDD55"
    text.contains("carne") || text.contains("pollo") || text.contains("meat") -> "\uD83E\uDD69"
    text.contains("salchicha") || text.contains("chorizo") || text.contains("jamon") || text.contains("charcuteria") || text.contains("cold-cuts") -> "\uD83E\uDD53"
    text.contains("snack") || text.contains("aperitivo") || text.contains("patatas fritas") -> "\uD83E\uDD68"
    text.contains("papel") || text.contains("servilleta") || text.contains("panuelo") -> "\uD83E\uDDFB"
    text.contains("detergente") || text.contains("lavavajillas") -> "\uD83E\uDDFC"
    text.contains("limpieza") || text.contains("drogueria") || text.contains("cleaning") -> "\uD83E\uDDFD"
    text.contains("higiene") || text.contains("gel") || text.contains("champu") || text.contains("jabon") || text.contains("cuidado") -> "\uD83E\uDDF4"
    text.contains("preservativo") || text.contains("condom") -> "\uD83D\uDEE1"
    text.contains("lagrima") || text.contains("lente de contacto") || text.contains("ojos") || text.contains("eye-care") -> "\uD83D\uDC41"
    text.contains("mosquito") || text.contains("citronela") || text.contains("repelente") || text.contains("picor") || text.contains("repellent") -> "\uD83E\uDD9F"
    text.contains("alcohol") || text.contains("antiseptico") || text.contains("desinfectante") || text.contains("clorhexidina") || text.contains("povidona") || text.contains("antiseptic") -> "\uD83E\uDDEA"
    text.contains("tirita") || text.contains("tira adhesiva") || text.contains("aposito") || text.contains("esparadrapo") || text.contains("venda") || text.contains("gasa") || text.contains("bandage") -> "\uD83E\uDE79"
    text.contains("algodon") || text.contains("bastoncillo") || text.contains("cotton") -> "\u2601"
    text.contains("capsula") || text.contains("comprimido") || text.contains("vitamina") || text.contains("mineral") || text.contains("probiotico") || text.contains("omega") || text.contains("melatonina") || text.contains("creatina") || text.contains("jalea real") || text.contains("propolis") || text.contains("valeriana") || text.contains("colagen") || text.contains("supplement") -> "\uD83D\uDC8A"
    text.contains("vaselina") || text.contains("arnica") || text.contains("balsamo") || text.contains("parafarmacia") || text.contains("fitoterapia") || text.contains("first-aid") -> "\uD83E\uDE79"
    text.contains("mascota") || text.contains("perro") || text.contains("gato") || text.contains("pet") -> "\uD83D\uDC3E"
    text.contains("bebe") || text.contains("baby") -> "\uD83C\uDF7C"
    text.contains("conserva") || text.contains("can") -> "\uD83E\uDD6B"
    else -> "\uD83D\uDED2"
}

private fun String.normalizedUiSearch(): String =
    java.text.Normalizer.normalize(this, java.text.Normalizer.Form.NFD)
        .replace("\\p{Mn}+".toRegex(), "")
        .lowercase()

private fun String.hasWord(word: String): Boolean =
    Regex("(^|[^a-z0-9])${Regex.escape(word)}([^a-z0-9]|$)").containsMatchIn(this)

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
    enabled: Boolean = true,
    size: Dp = 42.dp,
    onClick: () -> Unit,
    content: @Composable () -> Unit,
) {
    Box(
        modifier = Modifier
            .size(size)
            .clip(MaterialTheme.shapes.medium)
            .background(if (enabled) background else background.copy(alpha = 0.45f))
            .clickable(enabled = enabled, onClick = onClick)
            .semantics { this.contentDescription = contentDescription },
        contentAlignment = Alignment.Center,
    ) {
        CompositionLocalProvider(LocalContentColor provides contentColor) {
            content()
        }
    }
}

@Composable
private fun ShoppingItem(
    item: ShoppingListItemUiModel,
    onAction: (ShoppingListAction) -> Unit,
    accentColor: Color,
    readOnly: Boolean = false,
) {
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
            if (!readOnly && item.pendingOperationType != "delete") {
                SquareHeaderButton(
                    contentDescription = "Editar ${item.name}",
                    background = WebLime,
                    contentColor = OnLime,
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
    if (!readOnly && editing) ItemNameDialog(
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

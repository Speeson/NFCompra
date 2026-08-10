package dev.esgarpe.nfcompra

import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.repeatOnLifecycle
import dev.esgarpe.nfcompra.core.designsystem.NFCompraTheme
import dev.esgarpe.nfcompra.core.network.KeystoreTokenStore
import dev.esgarpe.nfcompra.core.network.NetworkClient
import dev.esgarpe.nfcompra.feature.auth.AuthApp
import dev.esgarpe.nfcompra.feature.auth.AuthRepository
import dev.esgarpe.nfcompra.feature.auth.AuthViewModel
import dev.esgarpe.nfcompra.feature.shoppinglist.AccountShoppingSession
import dev.esgarpe.nfcompra.feature.shoppinglist.ShoppingListApp
import dev.esgarpe.nfcompra.feature.sharing.AcceptInvitationScreen
import dev.esgarpe.nfcompra.feature.sharing.AuthenticatedRefreshGate
import dev.esgarpe.nfcompra.feature.sharing.InvitationTokenHandoff
import dev.esgarpe.nfcompra.feature.sharing.NotificationActionErrorBanner
import dev.esgarpe.nfcompra.feature.sharing.NotificationPopup
import dev.esgarpe.nfcompra.feature.sharing.SharingAction
import dev.esgarpe.nfcompra.feature.sharing.SharingApi
import dev.esgarpe.nfcompra.feature.sharing.SharingNavigation
import dev.esgarpe.nfcompra.feature.sharing.SharingRepository
import dev.esgarpe.nfcompra.feature.sharing.SharingRoute
import dev.esgarpe.nfcompra.feature.sharing.SharingUiState
import dev.esgarpe.nfcompra.feature.sharing.SharingViewModel

class MainActivity : ComponentActivity() {
    private lateinit var invitationHandoff: InvitationTokenHandoff
    private var pendingInvitationToken by mutableStateOf<String?>(null)
    private var pendingHouseholdDeepLink by mutableStateOf<String?>(null)
    private var householdDeepLinkError by mutableStateOf<String?>(null)
    private var openListsRequestKey by mutableStateOf(0)
    private var notificationViewModel: SharingViewModel? = null
    private var membersViewModel: SharingViewModel? = null
    private var foregroundRefreshGate: AuthenticatedRefreshGate? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.rgb(108, 197, 29)
        invitationHandoff = InvitationTokenHandoff(savedInstanceState?.getString(PENDING_INVITATION_TOKEN))
        pendingInvitationToken = invitationHandoff.token
        pendingHouseholdDeepLink = savedInstanceState?.getString(PENDING_HOUSEHOLD_DEEP_LINK)
        receiveViewIntent(intent)
        val tokenStore = KeystoreTokenStore(applicationContext)
        foregroundRefreshGate = AuthenticatedRefreshGate { tokenStore.current() != null }
        val profilePreferences = getSharedPreferences("nfcompra.ui", MODE_PRIVATE)
        val authRepository = AuthRepository(
            NetworkClient.authApi(BuildConfig.AUTH_BASE_URL),
            tokenStore,
            BuildConfig.AUTH_BASE_URL,
        ) { name, username ->
            val displayName = name?.takeIf { it.isNotBlank() } ?: username?.takeIf { it.isNotBlank() }
            profilePreferences.edit().apply {
                if (displayName == null) remove("display_name") else putString("display_name", displayName)
            }.apply()
        }
        val sharingRepository = SharingRepository(NetworkClient.authenticatedApi(BuildConfig.AUTH_BASE_URL, tokenStore, SharingApi::class.java))
        setContent {
            val session by tokenStore.session.collectAsState()
            val authViewModel = remember { AuthViewModel(authRepository) }
            var rememberedEmail by remember {
                mutableStateOf(profilePreferences.getString("remembered_email", null).orEmpty())
            }
            val onRememberEmail: (String) -> Unit = remember {
                { email ->
                    profilePreferences.edit()
                        .putString("remembered_email", email.trim())
                        .apply()
                }
            }
            val accountId = session?.accessToken?.let(::userIdFromJwt)
            var previousAccountId by remember { mutableStateOf<String?>(null) }
            LaunchedEffect(accountId) {
                val previous = previousAccountId
                if (previous != null && previous != accountId) {
                    AccountShoppingSession.revoke(applicationContext, previous)
                }
                previousAccountId = accountId
            }
            val shoppingSession = remember(accountId) {
                accountId?.let {
                    AccountShoppingSession.create(
                        context = applicationContext,
                        baseUrl = BuildConfig.AUTH_BASE_URL,
                        tokenStore = tokenStore,
                        accountId = it,
                    )
                }
            }
            DisposableEffect(shoppingSession) {
                onDispose { shoppingSession?.close() }
            }
            val shoppingViewModel = shoppingSession?.viewModel
            val globalNotifications = remember { SharingViewModel(sharingRepository, null, null) }
            notificationViewModel = globalNotifications
            val notificationActionError by globalNotifications.notificationActionError.collectAsState()
            val globalNavigation by globalNotifications.navigation.collectAsState()
            var selectedHouseholdId by remember { mutableStateOf<String?>(null) }
            var notificationInvitationId by remember { mutableStateOf<String?>(null) }
            var contextualNotificationError by remember { mutableStateOf<String?>(null) }
            var showNotificationPopup by remember { mutableStateOf(false) }
            val notificationPopState by globalNotifications.notifications.collectAsState()
            LaunchedEffect(session) {
                if (session != null) lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
                    globalNotifications.pollNotifications()
                }
            }
            LaunchedEffect(globalNavigation) {
                when (val event = globalNavigation) {
                    is SharingNavigation.Invitation -> notificationInvitationId = event.invitationId
                    is SharingNavigation.HouseholdContext -> { shoppingViewModel?.openContext(event.householdId); selectedHouseholdId = null }
                    is SharingNavigation.ListContext -> { shoppingViewModel?.openContext(event.householdId, event.listId); selectedHouseholdId = null }
                    null -> Unit
                }
                if (globalNavigation != null) globalNotifications.consumeNavigation()
            }
            NFCompraTheme {
                if (session == null) AuthApp(authViewModel, rememberedEmail = rememberedEmail, onRememberEmail = onRememberEmail)
                else {
                    val authenticatedShoppingSession = requireNotNull(shoppingSession) {
                        "La sesión autenticada no contiene un identificador de cuenta."
                    }
                    val authenticatedShoppingViewModel = requireNotNull(shoppingViewModel) {
                        "La sesión autenticada no contiene un identificador de cuenta."
                    }
                    Box(modifier = Modifier.fillMaxSize()) {
                        Column(modifier = Modifier.fillMaxSize()) {
                            val visibleNotificationError = contextualNotificationError ?: notificationActionError
                            householdDeepLinkError?.let {
                                NotificationActionErrorBanner(it) { householdDeepLinkError = null }
                            }
                            visibleNotificationError?.let {
                                NotificationActionErrorBanner(it) {
                                    contextualNotificationError = null
                                    globalNotifications.dismissNotificationActionError()
                                }
                            }
                            when {
                                pendingInvitationToken != null -> {
                                    membersViewModel = null
                                    val token = pendingInvitationToken!!
                                    val model = remember(token) { SharingViewModel(sharingRepository, null, userIdFromJwt(session!!.accessToken)) }
                                    val state by model.state.collectAsState(); val navigation by model.navigation.collectAsState(); val accepting by model.isAccepting.collectAsState()
                                    if (navigation is SharingNavigation.HouseholdContext) { authenticatedShoppingViewModel.openContext((navigation as SharingNavigation.HouseholdContext).householdId); clearInvitation(); model.consumeNavigation() }
                                    AcceptInvitationScreen(token, accepting, (state as? SharingUiState.Error)?.message, { model.onAction(SharingAction.AcceptInvitation(token)) }, ::clearInvitation)
                                }
                                notificationInvitationId != null -> {
                                    membersViewModel = null
                                    val invitationId = notificationInvitationId!!
                                    val model = remember(invitationId) { SharingViewModel(sharingRepository, null, userIdFromJwt(session!!.accessToken)) }
                                    val state by model.state.collectAsState(); val navigation by model.navigation.collectAsState(); val accepting by model.isAccepting.collectAsState()
                                    if (navigation is SharingNavigation.HouseholdContext) { authenticatedShoppingViewModel.openContext((navigation as SharingNavigation.HouseholdContext).householdId); notificationInvitationId = null; model.consumeNavigation() }
                                    AcceptInvitationScreen("", accepting, (state as? SharingUiState.Error)?.message, { model.acceptInvitationById(invitationId) }, { notificationInvitationId = null })
                                }
                                else -> {
                                    membersViewModel = null
                                LaunchedEffect(pendingHouseholdDeepLink, authenticatedShoppingViewModel) {
                                    pendingHouseholdDeepLink?.let { householdId ->
                                        authenticatedShoppingViewModel.openContext(householdId)
                                        pendingHouseholdDeepLink = null
                                        openListsRequestKey++
                                    }
                                }
                                ShoppingListApp(
                                    authenticatedShoppingViewModel,
                                    {
                                        authenticatedShoppingSession.revoke()
                                        authViewModel.logout()
                                    },
                                    { selectedHouseholdId = it },
                                    onOpenNotifications = { showNotificationPopup = true },
                                    currentUserId = accountId,
                                    openListsRequestKey = openListsRequestKey,
                                )
                                }
                            }
                        }
                        if (selectedHouseholdId != null) {
                            val householdId = selectedHouseholdId!!
                            val model = remember(householdId) { SharingViewModel(sharingRepository, householdId, userIdFromJwt(session!!.accessToken)) }
                            membersViewModel = model
                            SharingRoute(model, { event ->
                                when (event) {
                                    is SharingNavigation.Invitation -> notificationInvitationId = event.invitationId
                                    is SharingNavigation.HouseholdContext -> { authenticatedShoppingViewModel.openContext(event.householdId); selectedHouseholdId = null }
                                    is SharingNavigation.ListContext -> { authenticatedShoppingViewModel.openContext(event.householdId, event.listId); selectedHouseholdId = null }
                                }
                        }, { selectedHouseholdId = null }, { contextualNotificationError = it })
                    }
                    if (showNotificationPopup) {
                        NotificationPopup(
                            state = notificationPopState,
                            onAction = { globalNotifications.onAction(it) },
                            onDismiss = { showNotificationPopup = false },
                        )
                    }
                }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); setIntent(intent); receiveViewIntent(intent) }
    override fun onResume() { super.onResume(); foregroundRefreshGate?.onForeground { notificationViewModel?.onForeground(); membersViewModel?.onForeground() } }
    override fun onSaveInstanceState(outState: Bundle) {
        invitationHandoff.savedStateToken()?.let { outState.putString(PENDING_INVITATION_TOKEN, it) }
        pendingHouseholdDeepLink?.let { outState.putString(PENDING_HOUSEHOLD_DEEP_LINK, it) }
        super.onSaveInstanceState(outState)
    }

    private fun receiveViewIntent(intent: Intent?) {
        if (intent?.action != Intent.ACTION_VIEW) return
        val data = intent.data
        when (val destination = data?.toHouseholdDeepLinkDestination()) {
            is HouseholdDeepLinkDestination.HouseholdLists -> {
                pendingHouseholdDeepLink = destination.householdId
                householdDeepLinkError = null
                intent.data = null
                return
            }
            HouseholdDeepLinkDestination.Invalid -> {
                householdDeepLinkError = "No se pudo abrir este enlace NFC."
                intent.data = null
                return
            }
            null -> Unit
        }
        invitationHandoff.receiveLink(intent?.dataString)
        pendingInvitationToken = invitationHandoff.token
        intent?.data = null
    }
    private fun clearInvitation() { invitationHandoff.clear(); pendingInvitationToken = null; intent?.data = null }

    private companion object {
        const val PENDING_INVITATION_TOKEN = "pending_invitation_token"
        const val PENDING_HOUSEHOLD_DEEP_LINK = "pending_household_deep_link"
    }
}

private sealed interface HouseholdDeepLinkDestination {
    data class HouseholdLists(val householdId: String) : HouseholdDeepLinkDestination
    data object Invalid : HouseholdDeepLinkDestination
}

private fun Uri.toHouseholdDeepLinkDestination(): HouseholdDeepLinkDestination? {
    val segments = pathSegments
    val householdId = when {
        scheme == "nfcompra" && host == "household" && segments.size == 2 && segments[1] == "lists" -> segments[0]
        scheme == "https" && host == "nfcompra.esgarpe.dev" && segments.size == 3 && segments[0] == "household" && segments[2] == "lists" -> segments[1]
        scheme == "nfcompra" && host == "household" -> return HouseholdDeepLinkDestination.Invalid
        scheme == "https" && host == "nfcompra.esgarpe.dev" && segments.firstOrNull() == "household" -> return HouseholdDeepLinkDestination.Invalid
        else -> return null
    }.trim()
    return if (householdId.isBlank()) HouseholdDeepLinkDestination.Invalid
    else HouseholdDeepLinkDestination.HouseholdLists(householdId)
}

private fun userIdFromJwt(token: String): String? = runCatching {
    val payload = token.split('.')[1].replace('-', '+').replace('_', '/')
    val decoded = android.util.Base64.decode(payload, android.util.Base64.URL_SAFE or android.util.Base64.NO_PADDING or android.util.Base64.NO_WRAP)
    Regex("\\\"sub\\\"\\s*:\\s*\\\"([^\\\"]+)\\\"").find(decoded.decodeToString())?.groupValues?.get(1)
}.getOrNull()

package dev.esgarpe.nfcompra

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import dev.esgarpe.nfcompra.core.designsystem.NFCompraTheme
import dev.esgarpe.nfcompra.core.network.KeystoreTokenStore
import dev.esgarpe.nfcompra.core.network.NetworkClient
import dev.esgarpe.nfcompra.feature.auth.AuthApp
import dev.esgarpe.nfcompra.feature.auth.AuthRepository
import dev.esgarpe.nfcompra.feature.auth.AuthViewModel
import dev.esgarpe.nfcompra.feature.shoppinglist.ShoppingListApi
import dev.esgarpe.nfcompra.feature.shoppinglist.ShoppingListApp
import dev.esgarpe.nfcompra.feature.shoppinglist.ShoppingListRepository
import dev.esgarpe.nfcompra.feature.shoppinglist.ShoppingListViewModel
import dev.esgarpe.nfcompra.feature.sharing.AcceptInvitationScreen
import dev.esgarpe.nfcompra.feature.sharing.AuthenticatedRefreshGate
import dev.esgarpe.nfcompra.feature.sharing.InvitationTokenHandoff
import dev.esgarpe.nfcompra.feature.sharing.NotificationBell
import dev.esgarpe.nfcompra.feature.sharing.SharingAction
import dev.esgarpe.nfcompra.feature.sharing.SharingApi
import dev.esgarpe.nfcompra.feature.sharing.SharingNavigation
import dev.esgarpe.nfcompra.feature.sharing.SharingRepository
import dev.esgarpe.nfcompra.feature.sharing.SharingRoute
import dev.esgarpe.nfcompra.feature.sharing.SharingUiState
import dev.esgarpe.nfcompra.feature.sharing.SharingViewModel

class MainActivity : ComponentActivity() {
    private val invitationHandoff = InvitationTokenHandoff()
    private var pendingInvitationToken by mutableStateOf<String?>(null)
    private var notificationViewModel: SharingViewModel? = null
    private var membersViewModel: SharingViewModel? = null
    private var foregroundRefreshGate: AuthenticatedRefreshGate? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        receiveInvitationIntent(intent)
        val tokenStore = KeystoreTokenStore(applicationContext)
        foregroundRefreshGate = AuthenticatedRefreshGate { tokenStore.current() != null }
        val authRepository = AuthRepository(NetworkClient.authApi(BuildConfig.AUTH_BASE_URL), tokenStore)
        val shoppingRepository = ShoppingListRepository(NetworkClient.authenticatedApi(BuildConfig.AUTH_BASE_URL, tokenStore, ShoppingListApi::class.java))
        val sharingRepository = SharingRepository(NetworkClient.authenticatedApi(BuildConfig.AUTH_BASE_URL, tokenStore, SharingApi::class.java))
        setContent {
            val session by tokenStore.session.collectAsState()
            val authViewModel = remember { AuthViewModel(authRepository) }
            val shoppingViewModel = remember { ShoppingListViewModel(shoppingRepository) }
            val globalNotifications = remember { SharingViewModel(sharingRepository, null, null) }
            notificationViewModel = globalNotifications
            val notificationState by globalNotifications.notifications.collectAsState()
            val globalNavigation by globalNotifications.navigation.collectAsState()
            var selectedHouseholdId by remember { mutableStateOf<String?>(null) }
            var notificationInvitationId by remember { mutableStateOf<String?>(null) }
            var globalBellOpen by remember { mutableStateOf(false) }
            LaunchedEffect(session) { if (session != null) globalNotifications.refreshNotifications() }
            LaunchedEffect(globalNavigation) {
                when (val event = globalNavigation) {
                    is SharingNavigation.Invitation -> notificationInvitationId = event.invitationId
                    is SharingNavigation.HouseholdContext -> { shoppingViewModel.openContext(event.householdId); selectedHouseholdId = null }
                    is SharingNavigation.ListContext -> { shoppingViewModel.openContext(event.householdId, event.listId); selectedHouseholdId = null }
                    null -> Unit
                }
                if (globalNavigation != null) globalNotifications.consumeNavigation()
            }
            NFCompraTheme {
                if (session == null) AuthApp(authViewModel)
                else when {
                    pendingInvitationToken != null -> {
                        membersViewModel = null
                        val token = pendingInvitationToken!!
                        val model = remember(token) { SharingViewModel(sharingRepository, null, userIdFromJwt(session!!.accessToken)) }
                        val state by model.state.collectAsState(); val navigation by model.navigation.collectAsState(); val accepting by model.isAccepting.collectAsState()
                        if (navigation is SharingNavigation.HouseholdContext) { shoppingViewModel.openContext((navigation as SharingNavigation.HouseholdContext).householdId); clearInvitation(); model.consumeNavigation() }
                        AcceptInvitationScreen(token, accepting, (state as? SharingUiState.Error)?.message, { model.onAction(SharingAction.AcceptInvitation(token)) }, ::clearInvitation)
                    }
                    notificationInvitationId != null -> {
                        membersViewModel = null
                        val invitationId = notificationInvitationId!!
                        val model = remember(invitationId) { SharingViewModel(sharingRepository, null, userIdFromJwt(session!!.accessToken)) }
                        val state by model.state.collectAsState(); val navigation by model.navigation.collectAsState(); val accepting by model.isAccepting.collectAsState()
                        if (navigation is SharingNavigation.HouseholdContext) { shoppingViewModel.openContext((navigation as SharingNavigation.HouseholdContext).householdId); notificationInvitationId = null; model.consumeNavigation() }
                        AcceptInvitationScreen("", accepting, (state as? SharingUiState.Error)?.message, { model.acceptInvitationById(invitationId) }, { notificationInvitationId = null })
                    }
                    selectedHouseholdId != null -> {
                        val householdId = selectedHouseholdId!!
                        val model = remember(householdId) { SharingViewModel(sharingRepository, householdId, userIdFromJwt(session!!.accessToken)) }
                        membersViewModel = model
                        SharingRoute(model, { event ->
                            when (event) {
                                is SharingNavigation.Invitation -> notificationInvitationId = event.invitationId
                                is SharingNavigation.HouseholdContext -> { shoppingViewModel.openContext(event.householdId); selectedHouseholdId = null }
                                is SharingNavigation.ListContext -> { shoppingViewModel.openContext(event.householdId, event.listId); selectedHouseholdId = null }
                            }
                        }, { selectedHouseholdId = null })
                    }
                    else -> Column {
                        membersViewModel = null
                        NotificationBell(notificationState, globalBellOpen, { globalBellOpen = !globalBellOpen }, globalNotifications::onAction)
                        ShoppingListApp(shoppingViewModel, authViewModel::logout, { selectedHouseholdId = it })
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); setIntent(intent); receiveInvitationIntent(intent) }
    override fun onResume() { super.onResume(); foregroundRefreshGate?.onForeground { notificationViewModel?.onForeground(); membersViewModel?.onForeground() } }

    private fun receiveInvitationIntent(intent: Intent?) {
        invitationHandoff.receive(invitationToken(intent))
        pendingInvitationToken = invitationHandoff.token
        intent?.data = null
    }
    private fun clearInvitation() { invitationHandoff.clear(); pendingInvitationToken = null; intent?.data = null }
    private fun invitationToken(intent: Intent?) = intent?.data?.takeIf { it.path == "/invitations/accept" }?.getQueryParameter("token")?.takeIf(String::isNotBlank)
}

private fun userIdFromJwt(token: String): String? = runCatching {
    val payload = token.split('.')[1].replace('-', '+').replace('_', '/')
    val decoded = android.util.Base64.decode(payload, android.util.Base64.URL_SAFE or android.util.Base64.NO_PADDING or android.util.Base64.NO_WRAP)
    Regex("\\\"sub\\\"\\s*:\\s*\\\"([^\\\"]+)\\\"").find(decoded.decodeToString())?.groupValues?.get(1)
}.getOrNull()

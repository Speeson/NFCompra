package dev.esgarpe.nfcompra

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
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
import dev.esgarpe.nfcompra.feature.sharing.SharingAction
import dev.esgarpe.nfcompra.feature.sharing.SharingApi
import dev.esgarpe.nfcompra.feature.sharing.SharingNavigation
import dev.esgarpe.nfcompra.feature.sharing.SharingRepository
import dev.esgarpe.nfcompra.feature.sharing.SharingRoute
import dev.esgarpe.nfcompra.feature.sharing.SharingUiState
import dev.esgarpe.nfcompra.feature.sharing.SharingViewModel

class MainActivity : ComponentActivity() {
    private var pendingInvitationToken by mutableStateOf<String?>(null)
    private var sharingViewModel: SharingViewModel? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        pendingInvitationToken = invitationToken(intent)
        val tokenStore = KeystoreTokenStore(applicationContext)
        val authRepository = AuthRepository(NetworkClient.authApi(BuildConfig.AUTH_BASE_URL), tokenStore)
        val shoppingRepository = ShoppingListRepository(NetworkClient.authenticatedApi(BuildConfig.AUTH_BASE_URL, tokenStore, ShoppingListApi::class.java))
        val sharingRepository = SharingRepository(NetworkClient.authenticatedApi(BuildConfig.AUTH_BASE_URL, tokenStore, SharingApi::class.java))
        setContent {
            val session by tokenStore.session.collectAsState()
            val authViewModel = remember { AuthViewModel(authRepository) }
            var selectedHouseholdId by remember { mutableStateOf<String?>(null) }
            var notificationInvitationId by remember { mutableStateOf<String?>(null) }
            NFCompraTheme {
                if (session == null) AuthApp(authViewModel)
                else when {
                    pendingInvitationToken != null -> {
                        val token = pendingInvitationToken!!
                        val model = remember(token) { SharingViewModel(sharingRepository, "", userIdFromJwt(session!!.accessToken)) }
                        sharingViewModel = model
                        val state by model.state.collectAsState(); val navigation by model.navigation.collectAsState()
                        if (navigation is SharingNavigation.HouseholdContext) { selectedHouseholdId = (navigation as SharingNavigation.HouseholdContext).householdId; pendingInvitationToken = null; model.consumeNavigation() }
                        AcceptInvitationScreen(token, false, (state as? SharingUiState.Error)?.message, { model.onAction(SharingAction.AcceptInvitation(token)) }, { pendingInvitationToken = null })
                    }
                    notificationInvitationId != null -> {
                        val invitationId = notificationInvitationId!!
                        val model = remember(invitationId) { SharingViewModel(sharingRepository, "", userIdFromJwt(session!!.accessToken)) }
                        sharingViewModel = model
                        val state by model.state.collectAsState(); val navigation by model.navigation.collectAsState()
                        if (navigation is SharingNavigation.HouseholdContext) { selectedHouseholdId = (navigation as SharingNavigation.HouseholdContext).householdId; notificationInvitationId = null; model.consumeNavigation() }
                        AcceptInvitationScreen("", false, (state as? SharingUiState.Error)?.message, { model.acceptInvitationById(invitationId) }, { notificationInvitationId = null })
                    }
                    selectedHouseholdId != null -> {
                        val householdId = selectedHouseholdId!!
                        val model = remember(householdId) { SharingViewModel(sharingRepository, householdId, userIdFromJwt(session!!.accessToken)) }
                        sharingViewModel = model
                        SharingRoute(model, { event ->
                            when (event) {
                                is SharingNavigation.Invitation -> notificationInvitationId = event.invitationId
                                is SharingNavigation.HouseholdContext -> selectedHouseholdId = event.householdId
                                is SharingNavigation.ListContext -> selectedHouseholdId = null
                            }
                        }, { selectedHouseholdId = null })
                    }
                    else -> ShoppingListApp(remember { ShoppingListViewModel(shoppingRepository) }, authViewModel::logout, { selectedHouseholdId = it })
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); setIntent(intent); pendingInvitationToken = invitationToken(intent) }
    override fun onResume() { super.onResume(); sharingViewModel?.onForeground() }
    private fun invitationToken(intent: Intent?) = intent?.data?.takeIf { it.path == "/invitations/accept" }?.getQueryParameter("token")?.takeIf(String::isNotBlank)
}

private fun userIdFromJwt(token: String): String? = runCatching {
    val payload = token.split('.')[1].replace('-', '+').replace('_', '/')
    val decoded = android.util.Base64.decode(payload, android.util.Base64.URL_SAFE or android.util.Base64.NO_PADDING or android.util.Base64.NO_WRAP)
    Regex("\\\"sub\\\"\\s*:\\s*\\\"([^\\\"]+)\\\"").find(decoded.decodeToString())?.groupValues?.get(1)
}.getOrNull()

package dev.esgarpe.nfcompra

import android.content.Intent
import android.content.Context
import android.content.SharedPreferences
import android.graphics.Color as AndroidColor
import android.net.Uri
import android.nfc.NfcAdapter
import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricPrompt
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.fragment.app.FragmentActivity
import androidx.core.view.WindowCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.repeatOnLifecycle
import java.util.concurrent.Executor
import dev.esgarpe.nfcompra.core.designsystem.BottomNavigationStylePreference
import dev.esgarpe.nfcompra.core.designsystem.NFCompraTheme
import dev.esgarpe.nfcompra.core.designsystem.NFCompraUiScaleProvider
import dev.esgarpe.nfcompra.core.designsystem.ThemePreference
import dev.esgarpe.nfcompra.core.designsystem.UiScalePreference
import dev.esgarpe.nfcompra.core.network.KeystoreTokenStore
import dev.esgarpe.nfcompra.core.network.NetworkClient
import dev.esgarpe.nfcompra.feature.auth.AuthApp
import dev.esgarpe.nfcompra.feature.auth.AuthRepository
import dev.esgarpe.nfcompra.feature.auth.AuthResult
import dev.esgarpe.nfcompra.feature.auth.AuthViewModel
import dev.esgarpe.nfcompra.feature.shoppinglist.AccountShoppingSession
import dev.esgarpe.nfcompra.feature.shoppinglist.HouseholdInvitationNoticeUiModel
import dev.esgarpe.nfcompra.feature.shoppinglist.ProductVoiceSearchPermissionRegistry
import dev.esgarpe.nfcompra.feature.shoppinglist.ShoppingListApp
import dev.esgarpe.nfcompra.feature.sharing.AcceptInvitationScreen
import dev.esgarpe.nfcompra.feature.sharing.AuthenticatedRefreshGate
import dev.esgarpe.nfcompra.feature.sharing.InvitationTokenHandoff
import dev.esgarpe.nfcompra.feature.sharing.NotificationActionErrorBanner
import dev.esgarpe.nfcompra.feature.sharing.NotificationPopup
import dev.esgarpe.nfcompra.feature.sharing.NotificationUiState
import dev.esgarpe.nfcompra.feature.sharing.SharingAction
import dev.esgarpe.nfcompra.feature.sharing.SharingApi
import dev.esgarpe.nfcompra.feature.sharing.SharingNavigation
import dev.esgarpe.nfcompra.feature.sharing.SharingRepository
import dev.esgarpe.nfcompra.feature.sharing.SharingRoute
import dev.esgarpe.nfcompra.feature.sharing.SharingUiState
import dev.esgarpe.nfcompra.feature.sharing.SharingViewModel
import kotlinx.coroutines.launch

class MainActivity : FragmentActivity() {
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
        window.statusBarColor = AndroidColor.rgb(108, 197, 29)
        window.navigationBarColor = AndroidColor.rgb(108, 197, 29)
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = false
            isAppearanceLightNavigationBars = false
        }
        invitationHandoff = InvitationTokenHandoff(savedInstanceState?.getString(PENDING_INVITATION_TOKEN))
        pendingInvitationToken = invitationHandoff.token
        pendingHouseholdDeepLink = savedInstanceState?.getString(PENDING_HOUSEHOLD_DEEP_LINK)
        receiveViewIntent(intent)
        val tokenStore = KeystoreTokenStore(applicationContext)
        val biometricUnlockSettings = BiometricUnlockSettings(
            SharedPreferencesBiometricUnlockStorage(applicationContext),
        )
        val localUnlockSettings = LocalUnlockSettings(
            SharedPreferencesLocalUnlockStorage(applicationContext),
        )
        foregroundRefreshGate = AuthenticatedRefreshGate { tokenStore.current() != null }
        val profilePreferences = getSharedPreferences("nfcompra.ui", MODE_PRIVATE)
        val uiScaleSettings = UiScaleSettings(SharedPreferencesUiScaleStorage(applicationContext, profilePreferences))
        val bottomNavigationStyleSettings = BottomNavigationStyleSettings(
            SharedPreferencesBottomNavigationStyleStorage(applicationContext, profilePreferences),
        )
        val themeSettings = ThemeSettings(SharedPreferencesThemeStorage(applicationContext, profilePreferences))
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
        val appUpdateService = AppUpdateService(applicationContext)
        val updatePreferences = getSharedPreferences("nfcompra.updates", MODE_PRIVATE)
        setContent {
            val session by tokenStore.session.collectAsState()
            val authViewModel = remember { AuthViewModel(authRepository) }
            val coroutineScope = rememberCoroutineScope()
            var availableUpdate by remember { mutableStateOf<AppUpdateInfo?>(null) }
            var isDownloadingUpdate by remember { mutableStateOf(false) }
            var updateDownloadProgress by remember { mutableStateOf<AppUpdateDownloadProgress?>(null) }
            var updateMessage by remember { mutableStateOf<String?>(null) }
            var installedChangelog by remember { mutableStateOf(updatePreferences.pendingInstalledChangelog(BuildConfig.VERSION_NAME)) }
            var biometricPreferenceVersion by remember { mutableStateOf(0) }
            var localUnlockVersion by remember { mutableStateOf(0) }
            var sessionAccessGrantedAccountId by remember { mutableStateOf<String?>(null) }
            var biometricPromptRunning by remember { mutableStateOf(false) }
            var automaticBiometricPromptAccountId by remember { mutableStateOf<String?>(null) }
            var biometricSettingsMessage by remember { mutableStateOf<String?>(null) }
            var uiScalePreference by remember { mutableStateOf(uiScaleSettings.preference) }
            var bottomNavigationStylePreference by remember { mutableStateOf(bottomNavigationStyleSettings.preference) }
            var themePreference by remember { mutableStateOf(themeSettings.preference) }
            val systemDarkTheme = isSystemInDarkTheme()
            val darkTheme = when (themePreference) {
                ThemePreference.Light -> false
                ThemePreference.Dark -> true
                ThemePreference.System -> systemDarkTheme
            }
            var rememberedEmail by remember {
                mutableStateOf(profilePreferences.getString("remembered_email", null).orEmpty())
            }
            val onUiScalePreferenceChange = remember {
                { preference: UiScalePreference ->
                    uiScaleSettings.preference = preference
                    uiScalePreference = preference
                }
            }
            val onBottomNavigationStylePreferenceChange = remember {
                { preference: BottomNavigationStylePreference ->
                    bottomNavigationStyleSettings.preference = preference
                    bottomNavigationStylePreference = preference
                }
            }
            val onThemePreferenceChange = remember {
                { preference: ThemePreference ->
                    themeSettings.preference = preference
                    themePreference = preference
                }
            }
            val onRememberEmail: (String) -> Unit = remember {
                { email ->
                    profilePreferences.edit()
                        .putString("remembered_email", email.trim())
                        .apply()
                }
            }
            LaunchedEffect(Unit) {
                runCatching { appUpdateService.checkLatestRelease() }
                    .onSuccess { availableUpdate = it }
                if (installedChangelog == null && updatePreferences.shouldFetchInstalledChangelog(applicationContext, BuildConfig.VERSION_NAME)) {
                    runCatching { appUpdateService.currentReleaseInfo() }
                        .onSuccess { currentRelease ->
                            currentRelease?.let {
                                installedChangelog = InstalledUpdateChangelog(
                                    versionName = it.versionName,
                                    title = it.releaseName,
                                    body = it.changelog,
                                )
                            }
                        }
                }
                updatePreferences.markVersionSeen(BuildConfig.VERSION_NAME)
            }
            val accountId = session?.accessToken?.let(::userIdFromJwt)
            val biometricAccessEnabled = remember(accountId, biometricPreferenceVersion) {
                biometricUnlockSettings.isEnabledFor(accountId)
            }
            val localUnlockValid = remember(accountId, localUnlockVersion) {
                localUnlockSettings.isUnlockValidFor(accountId)
            }
            val welcomeBiometricAccessEnabled = canUseWelcomeBiometricAccess(
                accountId = accountId,
                biometricAccessEnabled = biometricAccessEnabled,
            )
            fun requestBiometricUnlock(accountId: String) {
                if (biometricPromptRunning) return
                val unavailableMessage = biometricUnavailableMessage()
                if (unavailableMessage != null) {
                    biometricSettingsMessage = unavailableMessage
                    return
                }
                biometricPromptRunning = true
                showBiometricPrompt(
                    title = "Desbloquear NFCompra",
                    subtitle = "Usa la biometria configurada en este dispositivo.",
                    negativeButton = "Usar inicio de sesion",
                    onSuccess = {
                        coroutineScope.launch {
                            val result = authRepository.refresh()
                            val refreshedAccountId = tokenStore.current()?.accessToken?.let(::userIdFromJwt)
                            if ((result is AuthResult.SignedIn || tokenStore.current() != null) && refreshedAccountId == accountId) {
                                localUnlockSettings.recordBiometricSuccess(accountId)
                                localUnlockVersion++
                                sessionAccessGrantedAccountId = accountId
                                biometricSettingsMessage = null
                            } else {
                                sessionAccessGrantedAccountId = null
                                localUnlockSettings.clearForAccount(accountId)
                                localUnlockVersion++
                                biometricSettingsMessage = "La sesion ha caducado. Inicia sesion de nuevo."
                            }
                            biometricPromptRunning = false
                        }
                    },
                    onError = { message ->
                        biometricPromptRunning = false
                        biometricSettingsMessage = message
                    },
                )
            }
            fun changeBiometricAccess(enabled: Boolean) {
                val id = accountId ?: return
                if (!enabled) {
                    biometricUnlockSettings.disable()
                    biometricPreferenceVersion++
                    biometricSettingsMessage = "Acceso con biometria desactivado."
                    return
                }
                val unavailableMessage = biometricUnavailableMessage()
                if (unavailableMessage != null) {
                    biometricSettingsMessage = unavailableMessage
                    return
                }
                if (biometricPromptRunning) return
                biometricPromptRunning = true
                showBiometricPrompt(
                    title = "Activar acceso con biometria",
                    subtitle = "Confirma tu identidad para activar el desbloqueo local.",
                    negativeButton = "Cancelar",
                    onSuccess = {
                        biometricPromptRunning = false
                        biometricUnlockSettings.enableFor(id)
                        biometricPreferenceVersion++
                        biometricSettingsMessage = "Acceso con biometria activado."
                    },
                    onError = { message ->
                        biometricPromptRunning = false
                        biometricSettingsMessage = message
                    },
                )
            }
            var previousAccountId by remember { mutableStateOf<String?>(null) }
            LaunchedEffect(accountId) {
                val previous = previousAccountId
                if (previous != null && previous != accountId) {
                    AccountShoppingSession.revoke(applicationContext, previous)
                }
                if (accountId == null || previous != accountId) {
                    sessionAccessGrantedAccountId = null
                    automaticBiometricPromptAccountId = null
                }
                previousAccountId = accountId
            }
            LaunchedEffect(accountId, localUnlockValid) {
                if (accountId != null && localUnlockValid) {
                    sessionAccessGrantedAccountId = accountId
                }
            }
            LaunchedEffect(accountId, localUnlockValid, biometricAccessEnabled, sessionAccessGrantedAccountId) {
                val id = accountId ?: return@LaunchedEffect
                if (!localUnlockValid &&
                    biometricAccessEnabled &&
                    sessionAccessGrantedAccountId != id &&
                    automaticBiometricPromptAccountId != id
                ) {
                    automaticBiometricPromptAccountId = id
                    requestBiometricUnlock(id)
                }
            }
            val authenticatedContentUnlocked = session != null &&
                accountId != null &&
                sessionAccessGrantedAccountId == accountId
            val shoppingSession = remember(accountId, authenticatedContentUnlocked) {
                accountId?.takeIf { authenticatedContentUnlocked }?.let {
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
            val pendingInvitationNotices = remember(notificationPopState) {
                (notificationPopState as? NotificationUiState.Ready)
                    ?.notifications
                    .orEmpty()
                    .filter { it.invitationId != null }
                    .mapNotNull { notification ->
                        notification.invitationId?.let { invitationId ->
                            HouseholdInvitationNoticeUiModel(
                                notificationId = notification.id,
                                invitationId = invitationId,
                                title = notification.title,
                                body = notification.body,
                                createdAt = notification.createdAt,
                            )
                        }
                    }
            }
            LaunchedEffect(authenticatedContentUnlocked) {
                if (authenticatedContentUnlocked) lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
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
            LaunchedEffect(darkTheme) {
                WindowCompat.getInsetsController(window, window.decorView).apply {
                    isAppearanceLightStatusBars = false
                    isAppearanceLightNavigationBars = false
                }
            }
            NFCompraUiScaleProvider(uiScalePreference) {
            NFCompraTheme(darkTheme = darkTheme) {
                if (!authenticatedContentUnlocked) {
                    AuthApp(
                        authViewModel,
                        onSignedIn = {
                            tokenStore.current()?.accessToken?.let(::userIdFromJwt)?.let { signedInAccountId ->
                                localUnlockSettings.recordCredentialLogin(signedInAccountId)
                                localUnlockVersion++
                                sessionAccessGrantedAccountId = signedInAccountId
                            }
                        },
                        rememberedEmail = rememberedEmail,
                        onRememberEmail = onRememberEmail,
                        hasSavedSession = session != null && accountId != null && localUnlockValid,
                        canUseBiometricAccess = welcomeBiometricAccessEnabled,
                        onSavedSessionAccess = {
                            accountId?.let { sessionAccessGrantedAccountId = it }
                        },
                        onBiometricAccess = {
                            accountId?.let(::requestBiometricUnlock)
                        },
                    )
                } else {
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
                                        biometricUnlockSettings.clearForLoggedOutAccount(accountId)
                                        localUnlockSettings.clearForAccount(accountId)
                                        sessionAccessGrantedAccountId = null
                                        localUnlockVersion++
                                        biometricPreferenceVersion++
                                        authenticatedShoppingSession.revoke()
                                        authViewModel.logout()
                                    },
                                    { selectedHouseholdId = it },
                                    onOpenNotifications = { showNotificationPopup = true },
                                    pendingInvitationNotices = pendingInvitationNotices,
                                    invitationsLoading = notificationPopState is NotificationUiState.Loading,
                                    onAcceptInvitationNotice = { globalNotifications.onAction(SharingAction.AcceptInvitationById(it)) },
                                    onRejectInvitationNotice = { globalNotifications.onAction(SharingAction.DeleteNotification(it)) },
                                    currentUserId = accountId,
                                    openListsRequestKey = openListsRequestKey,
                                    biometricAccessEnabled = biometricAccessEnabled,
                                    biometricAccessMessage = biometricSettingsMessage,
                                    onBiometricAccessChange = ::changeBiometricAccess,
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
                availableUpdate?.let { update ->
                    AppUpdateDialog(
                        update = update,
                        currentVersionName = BuildConfig.VERSION_NAME,
                        message = updateMessage,
                        isDownloading = isDownloadingUpdate,
                        onDismiss = {
                            availableUpdate = null
                            updateMessage = null
                            updateDownloadProgress = null
                        },
                        onUpdate = {
                            if (isDownloadingUpdate) return@AppUpdateDialog
                            coroutineScope.launch {
                                isDownloadingUpdate = true
                                updateDownloadProgress = null
                                updateMessage = null
                                runCatching {
                                    val apk = appUpdateService.downloadApk(update) { progress ->
                                        updateDownloadProgress = progress
                                    }
                                    appUpdateService.startInstall(apk).also { installerOpened ->
                                        if (installerOpened) {
                                            updatePreferences.storePendingChangelog(update)
                                        }
                                    }
                                }.onSuccess { installerOpened ->
                                    if (!installerOpened) {
                                        updateMessage = "Activa el permiso para instalar apps desde NFCompra y vuelve a pulsar Actualizar."
                                    }
                                }.onFailure {
                                    updateMessage = "No se pudo descargar la actualizacion. Intentalo de nuevo."
                                }
                                isDownloadingUpdate = false
                            }
                        },
                        progress = updateDownloadProgress,
                    )
                }
                installedChangelog?.let { changelog ->
                    InstalledUpdateChangelogDialog(
                        changelog = changelog,
                        onDismiss = {
                            updatePreferences.markChangelogShown(changelog.versionName)
                            installedChangelog = null
                        },
                    )
                }
            }
            }
        }
    }
    }

    override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); setIntent(intent); receiveViewIntent(intent) }
    override fun onResume() { super.onResume(); foregroundRefreshGate?.onForeground { notificationViewModel?.onForeground(); membersViewModel?.onForeground() } }
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        ProductVoiceSearchPermissionRegistry.onRequestPermissionsResult(requestCode, grantResults)
    }
    override fun onSaveInstanceState(outState: Bundle) {
        invitationHandoff.savedStateToken()?.let { outState.putString(PENDING_INVITATION_TOKEN, it) }
        pendingHouseholdDeepLink?.let { outState.putString(PENDING_HOUSEHOLD_DEEP_LINK, it) }
        super.onSaveInstanceState(outState)
    }

    private fun receiveViewIntent(intent: Intent?) {
        if (intent?.action != Intent.ACTION_VIEW && intent?.action != NfcAdapter.ACTION_NDEF_DISCOVERED) return
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

    private fun biometricUnavailableMessage(): String? =
        when (BiometricManager.from(this).canAuthenticate(BIOMETRIC_STRONG)) {
            BiometricManager.BIOMETRIC_SUCCESS -> null
            BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED ->
                "No hay biometria configurada en este dispositivo."
            BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE ->
                "Este dispositivo no tiene un metodo biometrico compatible."
            BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE ->
                "La biometria no esta disponible ahora mismo."
            BiometricManager.BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED ->
                "La biometria requiere una actualizacion de seguridad del dispositivo."
            else -> "No se pudo usar la biometria en este dispositivo."
        }

    private fun showBiometricPrompt(
        title: String,
        subtitle: String,
        negativeButton: String,
        onSuccess: () -> Unit,
        onError: (String) -> Unit,
    ) {
        val prompt = BiometricPrompt(
            this,
            Executor { command -> runOnUiThread(command) },
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    onSuccess()
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    val message = when (errorCode) {
                        BiometricPrompt.ERROR_NEGATIVE_BUTTON,
                        BiometricPrompt.ERROR_USER_CANCELED,
                        BiometricPrompt.ERROR_CANCELED ->
                            "Desbloqueo biometrico cancelado. Puedes intentarlo de nuevo o iniciar sesion."
                        BiometricPrompt.ERROR_LOCKOUT,
                        BiometricPrompt.ERROR_LOCKOUT_PERMANENT ->
                            "Demasiados intentos. Usa el inicio de sesion normal."
                        else -> errString.toString().ifBlank { "No se pudo completar la autenticacion biometrica." }
                    }
                    onError(message)
                }
            },
        )
        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setSubtitle(subtitle)
            .setNegativeButtonText(negativeButton)
            .setAllowedAuthenticators(BIOMETRIC_STRONG)
            .build()
        prompt.authenticate(promptInfo)
    }

    private companion object {
        const val PENDING_INVITATION_TOKEN = "pending_invitation_token"
        const val PENDING_HOUSEHOLD_DEEP_LINK = "pending_household_deep_link"
    }
}

@Composable
private fun AppUpdateDialog(
    update: AppUpdateInfo,
    currentVersionName: String,
    message: String?,
    isDownloading: Boolean,
    progress: AppUpdateDownloadProgress?,
    onDismiss: () -> Unit,
    onUpdate: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = { if (!isDownloading) onDismiss() },
        title = {
            Text("Actualizacion disponible", color = Color(0xFF1C7144), fontWeight = FontWeight.Bold)
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Version actual: $currentVersionName")
                Text("Nueva version: ${update.versionName}")
                Text("Tamano: ${formatBytes(update.sizeBytes)}")
                Text("Se descargara el APK desde GitHub Releases y Android te pedira confirmar la instalacion.")
                if (isDownloading || progress != null) {
                    val currentProgress = progress
                    LinearProgressIndicator(
                        progress = { (currentProgress?.percent ?: 0) / 100f },
                        modifier = Modifier.fillMaxWidth(),
                        color = Color(0xFF1C7144),
                        trackColor = Color(0xFFE3E8E4),
                    )
                    Text(
                        if (currentProgress == null) {
                            "Preparando descarga..."
                        } else {
                            "${currentProgress.percent}% - ${formatBytes(currentProgress.downloadedBytes)} de ${formatBytes(currentProgress.totalBytes)} - ${formatSpeed(currentProgress.bytesPerSecond)}"
                        },
                    )
                }
                message?.let { Text(it, color = Color(0xFFB42318)) }
            }
        },
        confirmButton = {
            Button(
                onClick = onUpdate,
                enabled = !isDownloading,
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color(0xFFDCFF72),
                    contentColor = Color(0xFF10271E),
                ),
            ) {
                Text(if (isDownloading) "Descargando..." else "Actualizar", fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            TextButton(
                onClick = onDismiss,
                enabled = !isDownloading,
                colors = ButtonDefaults.textButtonColors(contentColor = Color(0xFF527062)),
            ) {
                Text("Ahora no")
            }
        },
    )
}

private data class InstalledUpdateChangelog(
    val versionName: String,
    val title: String,
    val body: String,
)

@Composable
private fun InstalledUpdateChangelogDialog(
    changelog: InstalledUpdateChangelog,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text("Novedades de NFCompra ${changelog.versionName}", color = Color(0xFF1C7144), fontWeight = FontWeight.Bold)
        },
        text = {
            Column(
                modifier = Modifier.heightIn(max = 360.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (changelog.title.isNotBlank()) Text(changelog.title, fontWeight = FontWeight.Bold)
                Text(changelog.body.ifBlank { "Actualizacion instalada correctamente." })
            }
        },
        confirmButton = {
            Button(
                onClick = onDismiss,
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color(0xFFDCFF72),
                    contentColor = Color(0xFF10271E),
                ),
            ) {
                Text("Entendido", fontWeight = FontWeight.Bold)
            }
        },
    )
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

private fun SharedPreferences.storePendingChangelog(update: AppUpdateInfo) {
    edit()
        .putString(PENDING_CHANGELOG_VERSION, update.versionName)
        .putString(PENDING_CHANGELOG_TITLE, update.releaseName)
        .putString(PENDING_CHANGELOG_BODY, update.changelog)
        .apply()
}

private fun SharedPreferences.pendingInstalledChangelog(currentVersionName: String): InstalledUpdateChangelog? {
    val pendingVersion = getString(PENDING_CHANGELOG_VERSION, null) ?: return null
    if (pendingVersion != currentVersionName) return null
    if (getString(SHOWN_CHANGELOG_VERSION, null) == currentVersionName) return null
    return InstalledUpdateChangelog(
        versionName = pendingVersion,
        title = getString(PENDING_CHANGELOG_TITLE, null).orEmpty(),
        body = getString(PENDING_CHANGELOG_BODY, null).orEmpty(),
    )
}

private fun SharedPreferences.shouldFetchInstalledChangelog(context: Context, currentVersionName: String): Boolean {
    if (getString(SHOWN_CHANGELOG_VERSION, null) == currentVersionName) return false
    if (getString(PENDING_CHANGELOG_VERSION, null) == currentVersionName) return false
    val lastSeenVersion = getString(LAST_SEEN_VERSION, null)
    val packageInfo = runCatching { context.packageManager.getPackageInfo(context.packageName, 0) }.getOrNull()
    val packageWasUpdated = packageInfo != null && packageInfo.lastUpdateTime > packageInfo.firstInstallTime
    return packageWasUpdated || (lastSeenVersion != null && lastSeenVersion != currentVersionName)
}

private fun SharedPreferences.markVersionSeen(versionName: String) {
    edit().putString(LAST_SEEN_VERSION, versionName).apply()
}

private fun SharedPreferences.markChangelogShown(versionName: String) {
    edit()
        .putString(SHOWN_CHANGELOG_VERSION, versionName)
        .remove(PENDING_CHANGELOG_VERSION)
        .remove(PENDING_CHANGELOG_TITLE)
        .remove(PENDING_CHANGELOG_BODY)
        .apply()
}

private fun userIdFromJwt(token: String): String? = runCatching {
    val payload = token.split('.')[1].replace('-', '+').replace('_', '/')
    val decoded = android.util.Base64.decode(payload, android.util.Base64.URL_SAFE or android.util.Base64.NO_PADDING or android.util.Base64.NO_WRAP)
    Regex("\\\"sub\\\"\\s*:\\s*\\\"([^\\\"]+)\\\"").find(decoded.decodeToString())?.groupValues?.get(1)
}.getOrNull()

private const val PENDING_CHANGELOG_VERSION = "pending_changelog_version"
private const val PENDING_CHANGELOG_TITLE = "pending_changelog_title"
private const val PENDING_CHANGELOG_BODY = "pending_changelog_body"
private const val SHOWN_CHANGELOG_VERSION = "shown_changelog_version"
private const val LAST_SEEN_VERSION = "last_seen_version"

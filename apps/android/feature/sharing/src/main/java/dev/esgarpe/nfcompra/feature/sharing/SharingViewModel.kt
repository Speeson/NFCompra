package dev.esgarpe.nfcompra.feature.sharing

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

sealed interface SharingUiState {
    data object Loading : SharingUiState
    data class Ready(val members: List<MemberUiModel>, val invitations: List<InvitationUiModel>, val notifications: List<NotificationUiModel>, val unreadCount: Int, val isOwner: Boolean) : SharingUiState
    data class Error(val message: String) : SharingUiState
}
sealed interface SharingAction {
    data class Invite(val email: String) : SharingAction
    data class Revoke(val invitationId: String) : SharingAction
    data class RemoveMember(val userId: String) : SharingAction
    data class AcceptInvitation(val token: String) : SharingAction
    data class AcceptInvitationById(val invitationId: String) : SharingAction
    data class OpenNotification(val notificationId: String) : SharingAction
    data object MarkAllRead : SharingAction
    data object DeleteAll : SharingAction
    data class DeleteNotification(val notificationId: String) : SharingAction
    data object Retry : SharingAction
}
sealed interface SharingNavigation {
    data class Invitation(val invitationId: String) : SharingNavigation
    data class HouseholdContext(val householdId: String) : SharingNavigation
    data class ListContext(val householdId: String, val listId: String) : SharingNavigation
}

class SharingViewModel(
    private val repository: SharingDataSource,
    private val householdId: String?,
    private val currentUserId: String? = null,
) : ViewModel() {
    private val mutableState = MutableStateFlow<SharingUiState>(SharingUiState.Loading)
    val state: StateFlow<SharingUiState> = mutableState.asStateFlow()
    private val mutableNavigation = MutableStateFlow<SharingNavigation?>(null)
    val navigation: StateFlow<SharingNavigation?> = mutableNavigation.asStateFlow()
    private val mutableIsAccepting = MutableStateFlow(false)
    val isAccepting: StateFlow<Boolean> = mutableIsAccepting.asStateFlow()
    private val mutableNotifications = MutableStateFlow<NotificationUiState>(NotificationUiState.Loading)
    val notifications: StateFlow<NotificationUiState> = mutableNotifications.asStateFlow()
    private val mutableNotificationActionError = MutableStateFlow<String?>(null)
    val notificationActionError: StateFlow<String?> = mutableNotificationActionError.asStateFlow()

    fun refresh() = viewModelScope.launch { householdId?.let { load(it) } ?: refreshNotifications() }
    fun refreshNotifications() = viewModelScope.launch { loadNotifications() }
    suspend fun pollNotifications(intervalMillis: Long = NOTIFICATION_POLL_INTERVAL_MILLIS) {
        require(intervalMillis > 0)
        while (currentCoroutineContext().isActive) {
            loadNotifications(showLoading = false)
            delay(intervalMillis)
        }
    }
    fun onForeground() { refreshNotifications(); householdId?.let { refresh() } }
    fun consumeNavigation() { mutableNavigation.value = null }
    fun dismissNotificationActionError() { mutableNotificationActionError.value = null }
    fun acceptInvitationById(invitationId: String) = viewModelScope.launch {
        if (mutableIsAccepting.value) return@launch
        mutableIsAccepting.value = true
        try {
            mutableNavigation.value = SharingNavigation.HouseholdContext(repository.acceptById(invitationId).householdId)
            runCatching { refreshNotificationSnapshot() }
        }
        catch (error: SharingApiException) { mutableState.value = SharingUiState.Error(error.message) }
        catch (_: Exception) { mutableState.value = SharingUiState.Error("No se pudo conectar con el servidor.") }
        finally { mutableIsAccepting.value = false }
    }
    fun onAction(action: SharingAction) = viewModelScope.launch {
        if (action is SharingAction.Retry) { householdId?.let { load(it) } ?: loadNotifications(); return@launch }
        if (action is SharingAction.Invite && !EMAIL.matches(action.email.trim())) { mutableState.value = SharingUiState.Error("Introduce un correo válido."); return@launch }
        val ready = mutableState.value as? SharingUiState.Ready
        if (action is SharingAction.Invite || action is SharingAction.Revoke || action is SharingAction.RemoveMember) {
            if (ready?.isOwner != true) return@launch
        }
        try {
            when (action) {
                is SharingAction.Invite -> repository.invite(householdId ?: return@launch, action.email.trim().lowercase())
                is SharingAction.Revoke -> repository.revoke(householdId ?: return@launch, action.invitationId)
                is SharingAction.RemoveMember -> repository.removeMember(householdId ?: return@launch, action.userId)
                is SharingAction.AcceptInvitation -> accept(action.token)
                is SharingAction.AcceptInvitationById -> acceptInvitationById(action.invitationId)
                is SharingAction.OpenNotification -> openNotification(ready, action.notificationId)
                SharingAction.MarkAllRead -> { repository.markAllRead(); householdId?.let { load(it) } ?: loadNotifications() }
                SharingAction.DeleteAll -> { repository.deleteAllNotifications(); householdId?.let { load(it) } ?: loadNotifications() }
                is SharingAction.DeleteNotification -> { repository.deleteNotification(action.notificationId); householdId?.let { load(it) } ?: loadNotifications() }
                SharingAction.Retry -> Unit
            }
            if (action !is SharingAction.AcceptInvitation && action !is SharingAction.AcceptInvitationById && action !is SharingAction.OpenNotification && action !== SharingAction.MarkAllRead && action !== SharingAction.DeleteAll && action !is SharingAction.DeleteNotification) householdId?.let { load(it) } ?: loadNotifications()
        } catch (error: SharingApiException) { mutableState.value = SharingUiState.Error(error.message) }
        catch (_: Exception) { mutableState.value = SharingUiState.Error("No se pudo conectar con el servidor.") }
    }

    private suspend fun accept(token: String) {
        if (mutableIsAccepting.value) return
        mutableIsAccepting.value = true
        try {
            mutableNavigation.value = SharingNavigation.HouseholdContext(repository.accept(token).householdId)
            runCatching { refreshNotificationSnapshot() }
        }
        finally { mutableIsAccepting.value = false }
    }

    private suspend fun load(householdId: String) {
        mutableState.value = SharingUiState.Loading
        try {
            val members = repository.members(householdId)
            val isOwner = members.any { it.userId == currentUserId && it.role == "owner" }
            val invitations = if (isOwner) repository.invitations(householdId) else emptyList()
            val notifications = repository.notifications()
            val unreadCount = repository.unreadCount()
            mutableNotifications.value = NotificationUiState.Ready(notifications, unreadCount)
            mutableState.value = SharingUiState.Ready(members, invitations, notifications, unreadCount, isOwner)
        } catch (error: SharingApiException) { mutableState.value = SharingUiState.Error(error.message) }
        catch (_: Exception) { mutableState.value = SharingUiState.Error("No se pudo conectar con el servidor.") }
    }
    private suspend fun loadNotifications(showLoading: Boolean = true) {
        if (showLoading) mutableNotifications.value = NotificationUiState.Loading
        try { refreshNotificationSnapshot() }
        catch (error: SharingApiException) { mutableNotifications.value = NotificationUiState.Error(error.message) }
        catch (_: Exception) { mutableNotifications.value = NotificationUiState.Error("No se pudo conectar con el servidor.") }
    }
    private suspend fun openNotification(ready: SharingUiState.Ready?, notificationId: String) {
        val notifications = ready?.notifications ?: (mutableNotifications.value as? NotificationUiState.Ready)?.notifications.orEmpty()
        val notification = notifications.firstOrNull { it.id == notificationId } ?: return
        mutableNavigation.value = when {
            notification.invitationId != null -> SharingNavigation.Invitation(notification.invitationId)
            notification.listId != null && notification.householdId != null -> SharingNavigation.ListContext(notification.householdId, notification.listId)
            notification.householdId != null -> SharingNavigation.HouseholdContext(notification.householdId)
            else -> null
        }
        try {
            repository.markRead(notificationId)
            refreshNotificationSnapshot()
        } catch (error: SharingApiException) {
            mutableNotificationActionError.value = error.message
        } catch (_: Exception) {
            mutableNotificationActionError.value = "No se pudo conectar con el servidor."
        }
    }
    private suspend fun refreshNotificationSnapshot() {
        val notifications = repository.notifications()
        val unreadCount = repository.unreadCount()
        mutableNotifications.value = NotificationUiState.Ready(notifications, unreadCount)
        (mutableState.value as? SharingUiState.Ready)?.let {
            mutableState.value = it.copy(notifications = notifications, unreadCount = unreadCount)
        }
    }
    private companion object {
        const val NOTIFICATION_POLL_INTERVAL_MILLIS = 15_000L
        val EMAIL = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")
    }
}

sealed interface NotificationUiState {
    data object Loading : NotificationUiState
    data class Ready(val notifications: List<NotificationUiModel>, val unreadCount: Int) : NotificationUiState
    data class Error(val message: String) : NotificationUiState
}

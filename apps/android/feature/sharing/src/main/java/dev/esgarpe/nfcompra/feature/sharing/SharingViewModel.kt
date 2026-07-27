package dev.esgarpe.nfcompra.feature.sharing

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
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
    data class OpenNotification(val notificationId: String) : SharingAction
    data object MarkAllRead : SharingAction
    data object Retry : SharingAction
}
sealed interface SharingNavigation {
    data class Invitation(val invitationId: String) : SharingNavigation
    data class HouseholdContext(val householdId: String) : SharingNavigation
    data class ListContext(val householdId: String, val listId: String) : SharingNavigation
}

class SharingViewModel(
    private val repository: SharingDataSource,
    private val householdId: String,
    private val currentUserId: String? = null,
) : ViewModel() {
    private val mutableState = MutableStateFlow<SharingUiState>(SharingUiState.Loading)
    val state: StateFlow<SharingUiState> = mutableState.asStateFlow()
    private val mutableNavigation = MutableStateFlow<SharingNavigation?>(null)
    val navigation: StateFlow<SharingNavigation?> = mutableNavigation.asStateFlow()

    fun refresh() = viewModelScope.launch { load() }
    fun onForeground() = refresh()
    fun consumeNavigation() { mutableNavigation.value = null }
    fun acceptInvitationById(invitationId: String) = viewModelScope.launch {
        try { mutableNavigation.value = SharingNavigation.HouseholdContext(repository.acceptById(invitationId).householdId) }
        catch (error: SharingApiException) { mutableState.value = SharingUiState.Error(error.message) }
        catch (_: Exception) { mutableState.value = SharingUiState.Error("No se pudo conectar con el servidor.") }
    }
    fun onAction(action: SharingAction) = viewModelScope.launch {
        if (action is SharingAction.Retry) { load(); return@launch }
        if (action is SharingAction.Invite && !EMAIL.matches(action.email.trim())) { mutableState.value = SharingUiState.Error("Introduce un correo válido."); return@launch }
        val ready = mutableState.value as? SharingUiState.Ready
        if (action is SharingAction.Invite || action is SharingAction.Revoke || action is SharingAction.RemoveMember) {
            if (ready?.isOwner != true) return@launch
        }
        try {
            when (action) {
                is SharingAction.Invite -> repository.invite(householdId, action.email.trim().lowercase())
                is SharingAction.Revoke -> repository.revoke(householdId, action.invitationId)
                is SharingAction.RemoveMember -> repository.removeMember(householdId, action.userId)
                is SharingAction.AcceptInvitation -> mutableNavigation.value = SharingNavigation.HouseholdContext(repository.accept(action.token).householdId)
                is SharingAction.OpenNotification -> openNotification(ready, action.notificationId)
                SharingAction.MarkAllRead -> { repository.markAllRead(); load() }
                SharingAction.Retry -> Unit
            }
            if (action !is SharingAction.AcceptInvitation && action !is SharingAction.OpenNotification && action !== SharingAction.MarkAllRead) load()
        } catch (error: SharingApiException) { mutableState.value = SharingUiState.Error(error.message) }
        catch (_: Exception) { mutableState.value = SharingUiState.Error("No se pudo conectar con el servidor.") }
    }

    private suspend fun load() {
        mutableState.value = SharingUiState.Loading
        try {
            val members = repository.members(householdId)
            val isOwner = members.any { it.userId == currentUserId && it.role == "owner" }
            val invitations = if (isOwner) repository.invitations(householdId) else emptyList()
            mutableState.value = SharingUiState.Ready(members, invitations, repository.notifications(), repository.unreadCount(), isOwner)
        } catch (error: SharingApiException) { mutableState.value = SharingUiState.Error(error.message) }
        catch (_: Exception) { mutableState.value = SharingUiState.Error("No se pudo conectar con el servidor.") }
    }
    private suspend fun openNotification(ready: SharingUiState.Ready?, notificationId: String) {
        val notification = ready?.notifications?.firstOrNull { it.id == notificationId } ?: return
        repository.markRead(notificationId)
        mutableNavigation.value = when {
            notification.invitationId != null -> SharingNavigation.Invitation(notification.invitationId)
            notification.listId != null && notification.householdId != null -> SharingNavigation.ListContext(notification.householdId, notification.listId)
            notification.householdId != null -> SharingNavigation.HouseholdContext(notification.householdId)
            else -> null
        }
    }
    private companion object { val EMAIL = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$") }
}

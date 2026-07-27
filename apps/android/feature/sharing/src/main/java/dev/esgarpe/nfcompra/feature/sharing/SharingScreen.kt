package dev.esgarpe.nfcompra.feature.sharing

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Badge
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.unit.dp

@Composable
fun SharingRoute(
    viewModel: SharingViewModel,
    onNavigation: (SharingNavigation) -> Unit,
    onBack: () -> Unit,
    onNotificationActionError: (String) -> Unit = {},
) {
    val state by viewModel.state.collectAsState()
    val navigation by viewModel.navigation.collectAsState()
    val notificationActionError by viewModel.notificationActionError.collectAsState()
    LaunchedEffect(viewModel) { viewModel.refresh() }
    navigation?.let { event -> LaunchedEffect(event) { onNavigation(event); viewModel.consumeNavigation() } }
    notificationActionError?.let { error ->
        LaunchedEffect(error) {
            onNotificationActionError(error)
            viewModel.dismissNotificationActionError()
        }
    }
    SharingScreen(state, viewModel::onAction, onBack)
}

@Composable
fun SharingScreen(state: SharingUiState, onAction: (SharingAction) -> Unit, onBack: () -> Unit = {}) {
    var bellOpen by remember { mutableStateOf(false) }
    var invitationEmail by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf<SharingAction?>(null) }
    Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            TextButton(onClick = onBack) { Text("Volver a la lista") }
            val notificationState = when (state) {
                is SharingUiState.Ready -> NotificationUiState.Ready(state.notifications, state.unreadCount)
                SharingUiState.Loading -> NotificationUiState.Loading
                is SharingUiState.Error -> NotificationUiState.Error(state.message)
            }
            NotificationBell(notificationState, bellOpen, { bellOpen = !bellOpen }, onAction)
        }
        when (state) {
            SharingUiState.Loading -> Text("Cargando miembros…")
            is SharingUiState.Error -> { Text(state.message, color = MaterialTheme.colorScheme.error); Button(onClick = { onAction(SharingAction.Retry) }) { Text("Reintentar") } }
            is SharingUiState.Ready -> {
                Text("Miembros del hogar", style = MaterialTheme.typography.headlineSmall)
                if (state.isOwner) {
                    OutlinedTextField(value = invitationEmail, onValueChange = { invitationEmail = it }, label = { Text("Correo electrónico") }, modifier = Modifier.fillMaxWidth())
                    Button(onClick = { onAction(SharingAction.Invite(invitationEmail)); invitationEmail = "" }, enabled = invitationEmail.isNotBlank()) { Text("Invitar persona") }
                }
                state.members.forEach { member ->
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("${member.name} · ${member.role}")
                        if (state.isOwner && member.role != "owner") TextButton(onClick = { confirm = SharingAction.RemoveMember(member.userId) }) { Text("Eliminar") }
                    }
                }
                if (state.isOwner && state.invitations.isNotEmpty()) {
                    Text("Invitaciones pendientes", style = MaterialTheme.typography.titleMedium)
                    state.invitations.filter { it.status == "pending" }.forEach { invitation ->
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(invitation.email)
                            TextButton(onClick = { confirm = SharingAction.Revoke(invitation.id) }) { Text("Revocar") }
                        }
                    }
                }
            }
        }
    }
    confirm?.let { action -> AlertDialog(
        onDismissRequest = { confirm = null }, title = { Text("Confirmar acción") }, text = { Text("Esta acción no se puede deshacer.") },
        confirmButton = { TextButton(onClick = { onAction(action); confirm = null }) { Text("Confirmar") } },
        dismissButton = { TextButton(onClick = { confirm = null }) { Text("Cancelar") } },
    ) }
}

@Composable
fun NotificationBell(state: NotificationUiState, open: Boolean, onToggle: () -> Unit, onAction: (SharingAction) -> Unit) {
    val ready = state as? NotificationUiState.Ready
    val unread = ready?.unreadCount ?: 0
    Column(horizontalAlignment = androidx.compose.ui.Alignment.End) {
        IconButton(onClick = onToggle, modifier = Modifier.semantics { contentDescription = "Notificaciones: $unread sin leer" }) { Text("🔔") }
        if (unread > 0) Badge { Text(unread.toString()) }
        if (open) Card { Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (ready == null || ready.notifications.isEmpty()) Text("No hay notificaciones")
            else ready.notifications.forEach { notice -> TextButton(onClick = { onAction(SharingAction.OpenNotification(notice.id)) }) { Text(notice.title) } }
            if (unread > 0) TextButton(onClick = { onAction(SharingAction.MarkAllRead) }) { Text("Marcar todo como leído") }
        } }
    }
}

@Composable
fun NotificationActionErrorBanner(message: String, onDismiss: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(message, color = MaterialTheme.colorScheme.error, modifier = Modifier.weight(1f))
            TextButton(onClick = onDismiss) { Text("Cerrar aviso") }
        }
    }
}

@Composable
fun AcceptInvitationScreen(token: String, isLoading: Boolean, error: String?, onAccept: () -> Unit, onCancel: () -> Unit) {
    Column(modifier = Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Aceptar invitación", style = MaterialTheme.typography.headlineSmall)
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        Button(onClick = onAccept, enabled = !isLoading) { Text(if (isLoading) "Aceptando…" else "Aceptar invitación") }
        TextButton(onClick = onCancel) { Text("Cancelar") }
    }
}

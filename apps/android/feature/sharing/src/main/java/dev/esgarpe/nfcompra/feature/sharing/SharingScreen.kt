package dev.esgarpe.nfcompra.feature.sharing

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Badge
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val DangerRed = Color(0xFFDC2626)
private val SoftRed = Color(0xFFE57373)

@Immutable
private data class SharingColors(
    val card: Color,
    val primary: Color,
    val text: Color,
    val muted: Color,
    val lime: Color,
)

private val LightSharingColors = SharingColors(
    card = Color.White,
    primary = Color(0xFF1C7144),
    text = Color(0xFF10271E),
    muted = Color(0xFF527062),
    lime = Color(0xFFDCFF72),
)

private val DarkSharingColors = SharingColors(
    card = Color(0xFF10231A),
    primary = Color(0xFF89E5AE),
    text = Color(0xFFEAF7EE),
    muted = Color(0xFFA6BDAF),
    lime = Color(0xFFC8F85A),
)

private val LocalSharingColors = staticCompositionLocalOf { LightSharingColors }
private val ShareCard: Color @Composable get() = LocalSharingColors.current.card
private val SharePrimary: Color @Composable get() = LocalSharingColors.current.primary
private val ShareText: Color @Composable get() = LocalSharingColors.current.text
private val ShareMuted: Color @Composable get() = LocalSharingColors.current.muted
private val ShareLime: Color @Composable get() = LocalSharingColors.current.lime

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
    MembersPopupContent(state, viewModel::onAction, onBack)
}

@Composable
fun MembersPopupContent(state: SharingUiState, onAction: (SharingAction) -> Unit, onBack: () -> Unit = {}) {
    var invitationEmail by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf<SharingAction?>(null) }

    CompositionLocalProvider(
        LocalSharingColors provides if (MaterialTheme.colorScheme.background.luminance() < 0.5f) DarkSharingColors else LightSharingColors,
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.5f))
                .padding(16.dp),
            contentAlignment = Alignment.Center,
        ) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = ShareCard),
                elevation = CardDefaults.cardElevation(defaultElevation = 8.dp),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(20.dp),
                ) {
                    when (state) {
                        SharingUiState.Loading -> Text("Cargando miembros…")
                        is SharingUiState.Error -> {
                            Text(state.message, color = MaterialTheme.colorScheme.error)
                            Button(onClick = { onAction(SharingAction.Retry) }) { Text("Reintentar") }
                        }
                        is SharingUiState.Ready -> {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .weight(1f, fill = false)
                                    .verticalScroll(rememberScrollState()),
                                verticalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                val owner = state.members.firstOrNull { it.role == "owner" }
                                if (owner != null) {
                                    SectionTitle("Dueño del hogar")
                                    OwnerRow(owner)
                                }

                                val regularMembers = state.members.filter { it.role != "owner" }
                                if (regularMembers.isNotEmpty()) {
                                    SectionTitle("Miembros del hogar")
                                    regularMembers.forEach { member ->
                                        MemberRow(
                                            member = member,
                                            showRemove = state.isOwner,
                                            onRemove = { confirm = SharingAction.RemoveMember(member.userId) },
                                        )
                                    }
                                }

                                if (state.isOwner) {
                                    val pendingInvitations = state.invitations.filter { it.status == "pending" }
                                    if (pendingInvitations.isNotEmpty()) {
                                        SectionTitle("Invitaciones pendientes")
                                        pendingInvitations.forEach { invitation ->
                                            InvitationRow(
                                                invitation = invitation,
                                                onRevoke = { confirm = SharingAction.Revoke(invitation.id) },
                                            )
                                        }
                                    }

                                    Spacer(modifier = Modifier.height(8.dp))
                                    SectionTitle("Invitar persona")
                                    OutlinedTextField(
                                        value = invitationEmail,
                                        onValueChange = { invitationEmail = it },
                                        label = { Text("Correo electrónico") },
                                        modifier = Modifier.fillMaxWidth(),
                                        shape = RoundedCornerShape(12.dp),
                                    )
                                    Button(
                                        onClick = {
                                            onAction(SharingAction.Invite(invitationEmail))
                                            invitationEmail = ""
                                        },
                                        enabled = invitationEmail.isNotBlank(),
                                        modifier = Modifier.fillMaxWidth().height(48.dp),
                                        shape = RoundedCornerShape(12.dp),
                                    ) { Text("Invitar persona") }
                                }
                            }

                            Spacer(modifier = Modifier.height(12.dp))
                            Button(
                                onClick = onBack,
                                modifier = Modifier.fillMaxWidth().height(50.dp),
                                shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = ShareLime,
                                    contentColor = ShareText,
                                ),
                            ) {
                                Text("Cerrar", fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }
        }
    }

    confirm?.let { action ->
        AlertDialog(
            onDismissRequest = { confirm = null },
            title = { Text("Confirmar acción") },
            text = { Text("Esta acción no se puede deshacer.") },
            confirmButton = { TextButton(onClick = { onAction(action); confirm = null }) { Text("Confirmar") } },
            dismissButton = { TextButton(onClick = { confirm = null }) { Text("Cancelar") } },
        )
    }
}

@Composable
private fun SectionTitle(title: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(modifier = Modifier.weight(1f).height(1.dp).background(SharePrimary.copy(alpha = 0.18f)))
        Text(title, color = SharePrimary, fontWeight = FontWeight.Black, fontSize = 13.sp)
        Box(modifier = Modifier.weight(1f).height(1.dp).background(SharePrimary.copy(alpha = 0.18f)))
    }
}

@Composable
private fun OwnerRow(owner: MemberUiModel) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Outlined.Person, contentDescription = null, tint = SharePrimary, modifier = Modifier.size(22.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(owner.name, fontWeight = FontWeight.Bold, color = ShareText)
            Text(owner.email, fontSize = 12.sp, color = ShareMuted)
        }
    }
}

@Composable
private fun MemberRow(member: MemberUiModel, showRemove: Boolean, onRemove: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (showRemove) {
            IconButton(
                onClick = onRemove,
                modifier = Modifier
                    .size(36.dp)
                    .border(1.dp, SoftRed.copy(alpha = 0.3f), RoundedCornerShape(8.dp))
                    .background(SoftRed.copy(alpha = 0.08f), RoundedCornerShape(8.dp)),
            ) {
                Icon(Icons.Outlined.Close, contentDescription = "Eliminar miembro", tint = SoftRed, modifier = Modifier.size(18.dp))
            }
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(member.name, fontWeight = FontWeight.Bold, color = ShareText)
            Text(member.email, fontSize = 12.sp, color = ShareMuted)
        }
    }
}

@Composable
private fun InvitationRow(invitation: InvitationUiModel, onRevoke: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(
            onClick = onRevoke,
            modifier = Modifier
                .size(36.dp)
                .border(1.dp, SoftRed.copy(alpha = 0.3f), RoundedCornerShape(8.dp))
                .background(SoftRed.copy(alpha = 0.08f), RoundedCornerShape(8.dp)),
        ) {
            Icon(Icons.Outlined.Close, contentDescription = "Revocar invitación", tint = SoftRed, modifier = Modifier.size(18.dp))
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(invitation.email, fontWeight = FontWeight.Bold, color = ShareText)
            Text("Invitación pendiente", fontSize = 12.sp, color = ShareMuted)
        }
    }
}

@Composable
fun NotificationBell(state: NotificationUiState, open: Boolean, onToggle: () -> Unit, onAction: (SharingAction) -> Unit) {
    val ready = state as? NotificationUiState.Ready
    val unread = ready?.unreadCount ?: 0
    Column(horizontalAlignment = Alignment.End) {
        IconButton(onClick = onToggle, modifier = Modifier.semantics { contentDescription = "Notificaciones: $unread sin leer" }) { Text("\uD83D\uDD14") }
        if (unread > 0) Badge { Text(unread.toString()) }
        if (open) {
            Card {
                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (ready == null || ready.notifications.isEmpty()) {
                        Text("No hay notificaciones")
                    } else {
                        ready.notifications.forEach { notice ->
                            TextButton(onClick = { onAction(SharingAction.OpenNotification(notice.id)) }) { Text(notice.title) }
                        }
                    }
                    if (unread > 0) TextButton(onClick = { onAction(SharingAction.MarkAllRead) }) { Text("Marcar todo como leído") }
                }
            }
        }
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

@Composable
fun SharingScreen(state: SharingUiState, onAction: (SharingAction) -> Unit, onBack: () -> Unit) = MembersPopupContent(state, onAction, onBack)

@Composable
fun NotificationPopup(
    state: NotificationUiState,
    onAction: (SharingAction) -> Unit,
    onDismiss: () -> Unit,
) {
    var confirmDeleteAll by remember { mutableStateOf(false) }
    var expandedId by remember { mutableStateOf<String?>(null) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.5f))
            .clickable(onClick = onDismiss),
        contentAlignment = Alignment.Center,
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth(0.92f)
                .clickable(onClick = {}, indication = null, interactionSource = remember { MutableInteractionSource() }),
            shape = RoundedCornerShape(20.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            elevation = CardDefaults.cardElevation(defaultElevation = 8.dp),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("Notificaciones", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = Color(0xFF1C7144))
                    TextButton(onClick = onDismiss) { Text("Cerrar") }
                }

                when (state) {
                    NotificationUiState.Loading -> Text("Cargando notificaciones...", modifier = Modifier.padding(vertical = 24.dp))
                    is NotificationUiState.Error -> Text(state.message, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(vertical = 24.dp))
                    is NotificationUiState.Ready -> {
                        val ready = state
                        if (ready.notifications.isEmpty()) {
                            Text("No hay notificaciones", modifier = Modifier.padding(vertical = 24.dp), color = Color(0xFF527062))
                        } else {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .weight(1f, fill = false)
                                    .padding(vertical = 8.dp)
                                    .verticalScroll(rememberScrollState()),
                                verticalArrangement = Arrangement.spacedBy(4.dp),
                            ) {
                                ready.notifications.forEach { notification ->
                                    val isExpanded = expandedId == notification.id
                                    val bgColor = if (notification.isRead) Color(0xFFF8FCF9) else Color(0xFFF0FFF4)
                                    Card(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clickable { expandedId = if (isExpanded) null else notification.id },
                                        colors = CardDefaults.cardColors(containerColor = bgColor),
                                        shape = RoundedCornerShape(10.dp),
                                    ) {
                                        Column(
                                            modifier = Modifier.fillMaxWidth().padding(10.dp),
                                            verticalArrangement = Arrangement.spacedBy(4.dp),
                                        ) {
                                            Row(
                                                modifier = Modifier.fillMaxWidth(),
                                                verticalAlignment = Alignment.CenterVertically,
                                            ) {
                                                Column(modifier = Modifier.weight(1f)) {
                                                    Text(
                                                        notification.title,
                                                        fontWeight = if (notification.isRead) FontWeight.Medium else FontWeight.Bold,
                                                        color = Color(0xFF10271E),
                                                        fontSize = 14.sp,
                                                        maxLines = 1,
                                                        overflow = TextOverflow.Ellipsis,
                                                    )
                                                    Row(
                                                        modifier = Modifier.padding(top = 2.dp),
                                                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                                                        verticalAlignment = Alignment.CenterVertically,
                                                    ) {
                                                        notification.createdAt?.let { iso ->
                                                            val parsed = runCatching { java.time.Instant.parse(iso).atZone(java.time.ZoneId.systemDefault()).toLocalDateTime() }.getOrNull()
                                                            if (parsed != null) {
                                                                val formatter = java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm")
                                                                Text(parsed.format(formatter), color = Color(0xFF9CA3AF), fontSize = 10.sp)
                                                            }
                                                        }
                                                        if (!notification.isRead) {
                                                            Box(
                                                                modifier = Modifier
                                                                    .size(6.dp)
                                                                    .clip(CircleShape)
                                                                    .background(Color(0xFF1C7144)),
                                                            )
                                                        }
                                                    }
                                                }
                                                IconButton(
                                                    onClick = { onAction(SharingAction.DeleteNotification(notification.id)); expandedId = null },
                                                    modifier = Modifier
                                                        .size(30.dp)
                                                        .border(1.dp, Color(0xFFE57373).copy(alpha = 0.3f), RoundedCornerShape(6.dp))
                                                        .background(Color(0xFFE57373).copy(alpha = 0.08f), RoundedCornerShape(6.dp)),
                                                ) {
                                                    Icon(Icons.Outlined.Close, contentDescription = "Eliminar", tint = Color(0xFFE57373), modifier = Modifier.size(14.dp))
                                                }
                                            }
                                            if (isExpanded) {
                                                Text(notification.body, color = Color(0xFF527062), fontSize = 12.sp)
                                                if (notification.invitationId != null) {
                                                    Row(
                                                        modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                                    ) {
                                                        Button(
                                                            onClick = {
                                                                notification.invitationId?.let { onAction(SharingAction.AcceptInvitationById(it)) }
                                                                expandedId = null
                                                            },
                                                            modifier = Modifier.weight(1f).height(36.dp),
                                                            shape = RoundedCornerShape(8.dp),
                                                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1C7144), contentColor = Color.White),
                                                        ) { Text("Aceptar", fontSize = 12.sp) }
                                                        Button(
                                                            onClick = { onAction(SharingAction.DeleteNotification(notification.id)); expandedId = null },
                                                            modifier = Modifier.weight(1f).height(36.dp),
                                                            shape = RoundedCornerShape(8.dp),
                                                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFFEF2F2), contentColor = Color(0xFFDC2626)),
                                                        ) { Text("Rechazar", fontSize = 12.sp) }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }

                            Row(
                                modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Button(
                                    onClick = { onAction(SharingAction.MarkAllRead) },
                                    modifier = Modifier.weight(1f).height(44.dp),
                                    shape = RoundedCornerShape(10.dp),
                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1C7144), contentColor = Color.White),
                                ) { Text("Marcar todas leídas", fontSize = 13.sp) }
                                Button(
                                    onClick = { confirmDeleteAll = true },
                                    modifier = Modifier.weight(1f).height(44.dp),
                                    shape = RoundedCornerShape(10.dp),
                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFFEF2F2), contentColor = Color(0xFFDC2626)),
                                ) { Text("Eliminar todas", fontSize = 13.sp) }
                            }
                        }
                    }
                }
            }
        }
    }

    if (confirmDeleteAll) {
        AlertDialog(
            onDismissRequest = { confirmDeleteAll = false },
            title = { Text("Eliminar notificaciones", fontWeight = FontWeight.Bold) },
            text = { Text("¿Estás seguro de que quieres eliminar todas las notificaciones? Esta acción no se puede deshacer.") },
            confirmButton = {
                Button(
                    onClick = { confirmDeleteAll = false; onAction(SharingAction.DeleteAll) },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFDC2626), contentColor = Color.White),
                    shape = RoundedCornerShape(8.dp),
                ) { Text("Eliminar", fontWeight = FontWeight.Bold) }
            },
            dismissButton = {
                Button(
                    onClick = { confirmDeleteAll = false },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFF2F3F2), contentColor = Color(0xFF10271E)),
                    shape = RoundedCornerShape(8.dp),
                ) { Text("Cancelar") }
            },
        )
    }
}

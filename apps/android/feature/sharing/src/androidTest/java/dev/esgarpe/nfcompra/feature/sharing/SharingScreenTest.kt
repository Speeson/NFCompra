package dev.esgarpe.nfcompra.feature.sharing

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.performClick
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class SharingScreenTest {
    @get:Rule val compose = createComposeRule()

    @Test fun `owner sees accessible bell and management controls`() {
        compose.setContent { SharingScreen(ready(isOwner = true), {}) }
        compose.onNodeWithContentDescription("Notificaciones: 2 sin leer").assertIsDisplayed()
        compose.onNodeWithText("Invitar persona").assertIsDisplayed()
        compose.onNodeWithText("Revocar").assertIsDisplayed()
    }

    @Test fun `member sees a read only roster`() {
        compose.setContent { SharingScreen(ready(isOwner = false), {}) }
        compose.onNodeWithText("Miembros del hogar").assertIsDisplayed()
        compose.onAllNodesWithText("Invitar persona").assertCountEquals(0)
    }

    @Test fun `error exposes retry`() {
        var action: SharingAction? = null
        compose.setContent { SharingScreen(SharingUiState.Error("Sin red"), onAction = { action = it }) }
        compose.onNodeWithText("Reintentar").performClick()
        assertEquals(SharingAction.Retry, action)
    }

    @Test fun `accept invitation screen has an explicit cancellation path`() {
        compose.setContent { AcceptInvitationScreen("in-memory-token", false, null, {}, {}) }
        compose.onNodeWithText("Aceptar invitación").assertIsDisplayed()
        compose.onNodeWithText("Cancelar").assertIsDisplayed()
    }

    @Test fun `bell renders rows and sends read actions`() {
        var action: SharingAction? = null
        compose.setContent { SharingScreen(ready(isOwner = true, notifications = listOf(NotificationUiModel("notice-1", "Producto", "Leche", false, "home-1", "list-1", null))), onAction = { action = it }) }
        compose.onNodeWithContentDescription("Notificaciones: 2 sin leer").performClick()
        compose.onNodeWithText("Producto").performClick()
        assertEquals(SharingAction.OpenNotification("notice-1"), action)
    }

    @Test fun `empty bell and owner confirmation are actionable`() {
        var action: SharingAction? = null
        compose.setContent { SharingScreen(ready(isOwner = true), onAction = { action = it }) }
        compose.onNodeWithContentDescription("Notificaciones: 2 sin leer").performClick()
        compose.onNodeWithText("No hay notificaciones").assertIsDisplayed()
        compose.onNodeWithText("Marcar todo como leído").performClick()
        assertEquals(SharingAction.MarkAllRead, action)
        compose.onNodeWithText("Revocar").performClick()
        compose.onNodeWithText("Confirmar").performClick()
        assertEquals(SharingAction.Revoke("invite-1"), action)
    }

    @Test fun `acceptance loading disables duplicate submits`() {
        compose.setContent { AcceptInvitationScreen("in-memory-token", true, null, {}, {}) }
        compose.onNodeWithText("Aceptando…").assertIsNotEnabled()
    }

    private fun ready(isOwner: Boolean, notifications: List<NotificationUiModel> = emptyList()) = SharingUiState.Ready(
        members = listOf(MemberUiModel("owner", "Ana", "ana@example.com", "owner")),
        invitations = listOf(InvitationUiModel("invite-1", "bea@example.com", "pending", "2026-08-01T00:00:00Z")),
        notifications = notifications, unreadCount = 2, isOwner = isOwner,
    )
}

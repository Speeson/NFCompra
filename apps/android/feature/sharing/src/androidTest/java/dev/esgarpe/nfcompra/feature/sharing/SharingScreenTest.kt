package dev.esgarpe.nfcompra.feature.sharing

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onAllNodesWithText
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
        compose.setContent { SharingScreen(SharingUiState.Error("Sin red"), {}) }
        compose.onNodeWithText("Reintentar").assertIsDisplayed()
    }

    @Test fun `accept invitation screen has an explicit cancellation path`() {
        compose.setContent { AcceptInvitationScreen("in-memory-token", false, null, {}, {}) }
        compose.onNodeWithText("Aceptar invitación").assertIsDisplayed()
        compose.onNodeWithText("Cancelar").assertIsDisplayed()
    }

    private fun ready(isOwner: Boolean) = SharingUiState.Ready(
        members = listOf(MemberUiModel("owner", "Ana", "ana@example.com", "owner")),
        invitations = listOf(InvitationUiModel("invite-1", "bea@example.com", "pending", "2026-08-01T00:00:00Z")),
        notifications = emptyList(), unreadCount = 2, isOwner = isOwner,
    )
}

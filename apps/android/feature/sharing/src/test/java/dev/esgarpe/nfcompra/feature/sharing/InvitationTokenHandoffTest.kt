package dev.esgarpe.nfcompra.feature.sharing

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class InvitationTokenHandoffTest {
    @Test fun `production HTTPS invitation link hands its raw token to Android`() {
        val handoff = InvitationTokenHandoff()

        handoff.receiveLink("https://nfcompra.esgarpe.dev/invitations/accept?token=raw%2Btoken")

        assertEquals("raw+token", handoff.token)
    }

    @Test fun `pending raw token survives Activity recreation through saved instance state`() {
        val initialActivity = InvitationTokenHandoff()
        initialActivity.receive("raw-token")

        val recreatedActivity = InvitationTokenHandoff(initialActivity.savedStateToken())

        assertEquals("raw-token", recreatedActivity.token)
    }

    @Test fun `cleared raw token stays absent after Activity recreation`() {
        val initialActivity = InvitationTokenHandoff()
        initialActivity.receive("raw-token")
        initialActivity.clear()

        val recreatedActivity = InvitationTokenHandoff(initialActivity.savedStateToken())

        assertNull(recreatedActivity.token)
    }
}

package dev.esgarpe.nfcompra.feature.sharing

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class InvitationTokenHandoffTest {
    @Test fun `consumes a raw intent token once and cannot revive it after clear`() {
        val handoff = InvitationTokenHandoff()
        handoff.receive("raw-token")
        assertEquals("raw-token", handoff.token)
        handoff.clear()
        handoff.receive(null)
        assertNull(handoff.token)
    }
}

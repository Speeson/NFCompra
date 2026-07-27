package dev.esgarpe.nfcompra.feature.sharing

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class InvitationTokenHandoffTest {
    @Test fun `consumed intent token is absent after clear and Activity recreation`() {
        val initialActivity = InvitationTokenHandoff()
        initialActivity.receive("raw-token")
        assertEquals("raw-token", initialActivity.token)
        initialActivity.clear()
        val recreatedActivity = InvitationTokenHandoff()
        recreatedActivity.receive(null)
        assertNull(recreatedActivity.token)
    }
}

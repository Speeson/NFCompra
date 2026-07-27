package dev.esgarpe.nfcompra.feature.sharing

import org.junit.Assert.assertEquals
import org.junit.Test

class AuthenticatedRefreshGateTest {
    @Test fun `logout followed by foreground does not refresh notifications`() {
        var requests = 0
        val gate = AuthenticatedRefreshGate()
        gate.setAuthenticated(true)
        gate.onForeground { requests++ }
        gate.setAuthenticated(false)
        gate.onForeground { requests++ }
        assertEquals(1, requests)
    }
}

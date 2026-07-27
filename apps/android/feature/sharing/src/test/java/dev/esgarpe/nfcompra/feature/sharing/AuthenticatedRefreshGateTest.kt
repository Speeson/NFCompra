package dev.esgarpe.nfcompra.feature.sharing

import dev.esgarpe.nfcompra.core.network.SessionTokens
import dev.esgarpe.nfcompra.core.network.TokenStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.junit.Assert.assertEquals
import org.junit.Test

class AuthenticatedRefreshGateTest {
    @Test fun `logout followed by foreground does not refresh notifications`() {
        val tokenStore = MutableTokenStore(SessionTokens("access", "refresh"))
        var requests = 0
        val gate = AuthenticatedRefreshGate { tokenStore.current() != null }
        gate.onForeground { requests++ }
        tokenStore.logout()
        gate.onForeground { requests++ }
        assertEquals(1, requests)
    }
}

private class MutableTokenStore(initial: SessionTokens?) : TokenStore {
    private val mutableSession = MutableStateFlow(initial)
    override val session: StateFlow<SessionTokens?> = mutableSession

    override fun current(): SessionTokens? = session.value
    override suspend fun read(): SessionTokens? = current()
    override suspend fun save(tokens: SessionTokens) { mutableSession.value = tokens }
    override suspend fun clear() { mutableSession.value = null }
    override suspend fun compareAndClear(expected: SessionTokens): Boolean {
        if (current() != expected) return false
        mutableSession.value = null
        return true
    }

    fun logout() { mutableSession.value = null }
}

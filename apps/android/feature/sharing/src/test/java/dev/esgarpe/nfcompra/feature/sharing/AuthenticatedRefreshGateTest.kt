package dev.esgarpe.nfcompra.feature.sharing

import dev.esgarpe.nfcompra.core.network.SessionTokens
import dev.esgarpe.nfcompra.core.network.SessionSnapshot
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
    private var identity = if (initial == null) 0L else 1L

    override fun current(): SessionTokens? = session.value
    override fun generation() = identity
    override fun snapshot() = current()?.let { SessionSnapshot(identity, it) }
    override suspend fun read(): SessionTokens? = current()
    override suspend fun save(tokens: SessionTokens) { identity++; mutableSession.value = tokens }
    override suspend fun clear() { identity++; mutableSession.value = null }
    override suspend fun compareAndStart(expectedGeneration: Long, tokens: SessionTokens): Boolean {
        if (identity != expectedGeneration) return false
        identity++
        mutableSession.value = tokens
        return true
    }
    override suspend fun compareAndSave(expected: SessionSnapshot, tokens: SessionTokens): Boolean {
        if (snapshot() != expected) return false
        mutableSession.value = tokens
        return true
    }
    override suspend fun compareAndClear(expected: SessionSnapshot): Boolean {
        if (snapshot() != expected) return false
        identity++
        mutableSession.value = null
        return true
    }

    fun logout() { identity++; mutableSession.value = null }
}

package dev.esgarpe.nfcompra.core.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.io.IOException
import java.util.ArrayDeque

class SessionTokenPersistenceTest {
    @Test
    fun `failed preference commit restores the previous encrypted session in memory`() {
        val preferences = FailingEncryptedSessionPreferences("old-access", "old-refresh")
        val persistence = SessionTokenPersistence(preferences)

        assertThrows(IOException::class.java) {
            persistence.save("new-access", "new-refresh")
        }

        assertEquals("old-access", preferences.access)
        assertEquals("old-refresh", preferences.refresh)
        assertEquals(
            listOf("new-access" to "new-refresh", "old-access" to "old-refresh"),
            preferences.writes,
        )
    }
}

private class FailingEncryptedSessionPreferences(
    override var access: String?,
    override var refresh: String?,
) : EncryptedSessionPreferences {
    private val outcomes = ArrayDeque(listOf(false, true))
    val writes = mutableListOf<Pair<String?, String?>>()

    override fun replace(access: String?, refresh: String?): Boolean {
        this.access = access
        this.refresh = refresh
        writes += access to refresh
        return outcomes.removeFirst()
    }
}

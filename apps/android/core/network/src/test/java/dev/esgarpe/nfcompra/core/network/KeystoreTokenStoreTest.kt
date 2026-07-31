package dev.esgarpe.nfcompra.core.network

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class KeystoreTokenStoreTest {
    private lateinit var context: Context

    @Before
    fun clearSession() {
        context = ApplicationProvider.getApplicationContext()
        context.getSharedPreferences("nfcompra.session", Context.MODE_PRIVATE).edit().clear().commit()
    }

    @Test
    fun `a delayed old instance cannot replace or clear the session saved by a rotated Activity instance`() = runTest {
        val cipher = object : SessionCipher {
            override fun encrypt(value: String) = "encrypted:$value"
            override fun decrypt(value: String) = value.removePrefix("encrypted:")
        }
        val oldActivityStore = KeystoreTokenStore(context, cipher)
        oldActivityStore.save(SessionTokens("old-access", "old-refresh"))
        val delayedRefresh = requireNotNull(oldActivityStore.snapshot())
        val rotatedActivityStore = KeystoreTokenStore(context, cipher)

        rotatedActivityStore.save(SessionTokens("new-access", "new-refresh"))
        val replaced = oldActivityStore.compareAndSave(
            delayedRefresh,
            SessionTokens("stale-access", "stale-refresh"),
        )
        val cleared = oldActivityStore.compareAndClear(delayedRefresh)

        assertFalse(replaced)
        assertFalse(cleared)
        assertEquals(SessionTokens("new-access", "new-refresh"), KeystoreTokenStore(context, cipher).current())

        val beforeEqualRefresh = requireNotNull(rotatedActivityStore.snapshot())
        assertTrue(
            rotatedActivityStore.compareAndSave(
                beforeEqualRefresh,
                SessionTokens("new-access", "new-refresh"),
            ),
        )
        assertFalse(oldActivityStore.compareAndClear(beforeEqualRefresh))
        assertEquals(SessionTokens("new-access", "new-refresh"), rotatedActivityStore.current())
    }
}

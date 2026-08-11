package dev.esgarpe.nfcompra

import org.junit.Assert.assertFalse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class BiometricUnlockSettingsTest {
    @Test
    fun `biometric unlock is enabled only for the account that opted in`() {
        val storage = FakeBiometricUnlockStorage()
        val settings = BiometricUnlockSettings(storage)

        settings.enableFor("account-a")

        assertTrue(settings.isEnabledFor("account-a"))
        assertFalse(settings.isEnabledFor("account-b"))
    }

    @Test
    fun `clearing on logout disables only the matching account`() {
        val storage = FakeBiometricUnlockStorage()
        val settings = BiometricUnlockSettings(storage)

        settings.enableFor("account-a")
        settings.clearForLoggedOutAccount("account-b")
        assertTrue(settings.isEnabledFor("account-a"))

        settings.clearForLoggedOutAccount("account-a")
        assertFalse(settings.isEnabledFor("account-a"))
    }

    @Test
    fun `welcome biometric action is available only for saved biometric sessions`() {
        assertTrue(
            canUseWelcomeBiometricAccess(
                accountId = "account-a",
                biometricAccessEnabled = true,
            ),
        )
        assertFalse(
            canUseWelcomeBiometricAccess(
                accountId = "account-a",
                biometricAccessEnabled = false,
            ),
        )
        assertFalse(
            canUseWelcomeBiometricAccess(
                accountId = null,
                biometricAccessEnabled = true,
            ),
        )
    }

    @Test
    fun `local unlock is invalid when no previous local authentication exists`() {
        val settings = LocalUnlockSettings(FakeLocalUnlockStorage()) { 1_000L }

        assertFalse(settings.isUnlockValidFor("account-a"))
    }

    @Test
    fun `local unlock is valid within one hour`() {
        val storage = FakeLocalUnlockStorage()
        var now = 10_000L
        val settings = LocalUnlockSettings(storage) { now }

        settings.recordCredentialLogin("account-a")
        now += LOCAL_UNLOCK_TIMEOUT_MILLIS - 1

        assertTrue(settings.isUnlockValidFor("account-a"))
    }

    @Test
    fun `local unlock expires after one hour`() {
        val storage = FakeLocalUnlockStorage()
        var now = 10_000L
        val settings = LocalUnlockSettings(storage) { now }

        settings.recordCredentialLogin("account-a")
        now += LOCAL_UNLOCK_TIMEOUT_MILLIS + 1

        assertFalse(settings.isUnlockValidFor("account-a"))
    }

    @Test
    fun `credential login resets the local unlock timestamp`() {
        val storage = FakeLocalUnlockStorage()
        val settings = LocalUnlockSettings(storage) { 20_000L }

        settings.recordCredentialLogin("account-a")

        assertEquals("account-a", storage.accountId)
        assertEquals(20_000L, storage.lastAuthenticationAtMillis)
    }

    @Test
    fun `biometric success resets the local unlock timestamp`() {
        val storage = FakeLocalUnlockStorage()
        val settings = LocalUnlockSettings(storage) { 30_000L }

        settings.recordBiometricSuccess("account-a")

        assertEquals("account-a", storage.accountId)
        assertEquals(30_000L, storage.lastAuthenticationAtMillis)
    }

    @Test
    fun `api token refresh does not reset the local unlock timestamp`() {
        val storage = FakeLocalUnlockStorage(accountId = "account-a", lastAuthenticationAtMillis = 40_000L)
        val settings = LocalUnlockSettings(storage) { 45_000L }

        assertTrue(settings.isUnlockValidFor("account-a"))

        assertEquals(40_000L, storage.lastAuthenticationAtMillis)
    }

    @Test
    fun `logout clears the local unlock timestamp`() {
        val storage = FakeLocalUnlockStorage(accountId = "account-a", lastAuthenticationAtMillis = 50_000L)
        val settings = LocalUnlockSettings(storage) { 55_000L }

        settings.clearForAccount("account-a")

        assertFalse(settings.isUnlockValidFor("account-a"))
        assertEquals(null, storage.accountId)
        assertEquals(0L, storage.lastAuthenticationAtMillis)
    }

    @Test
    fun `account switching does not reuse another account local unlock timestamp`() {
        val storage = FakeLocalUnlockStorage()
        val settings = LocalUnlockSettings(storage) { 60_000L }

        settings.recordCredentialLogin("account-a")

        assertTrue(settings.isUnlockValidFor("account-a"))
        assertFalse(settings.isUnlockValidFor("account-b"))
    }
}

private class FakeBiometricUnlockStorage : BiometricUnlockStorage {
    override var enabledAccountId: String? = null
}

private class FakeLocalUnlockStorage(
    override var accountId: String? = null,
    override var lastAuthenticationAtMillis: Long = 0L,
) : LocalUnlockStorage

package dev.esgarpe.nfcompra

import org.junit.Assert.assertFalse
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
}

private class FakeBiometricUnlockStorage : BiometricUnlockStorage {
    override var enabledAccountId: String? = null
}

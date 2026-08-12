package dev.esgarpe.nfcompra.feature.auth

import org.junit.Assert.assertEquals
import org.junit.Test

class WelcomeLoginActionTest {
    @Test
    fun `uses saved session when local unlock is still valid`() {
        assertEquals(
            WelcomeLoginAction.SAVED_SESSION,
            welcomeLoginAction(hasSavedSession = true, canUseBiometricAccess = true),
        )
    }

    @Test
    fun `uses biometric before credentials when local unlock expired but biometric session exists`() {
        assertEquals(
            WelcomeLoginAction.BIOMETRIC,
            welcomeLoginAction(hasSavedSession = false, canUseBiometricAccess = true),
        )
    }

    @Test
    fun `uses credentials when no saved or biometric session can be used`() {
        assertEquals(
            WelcomeLoginAction.CREDENTIALS,
            welcomeLoginAction(hasSavedSession = false, canUseBiometricAccess = false),
        )
    }
}

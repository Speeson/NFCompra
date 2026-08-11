package dev.esgarpe.nfcompra

import android.content.Context
import android.content.SharedPreferences

internal interface BiometricUnlockStorage {
    var enabledAccountId: String?
}

internal interface LocalUnlockStorage {
    var accountId: String?
    var lastAuthenticationAtMillis: Long
}

internal const val LOCAL_UNLOCK_TIMEOUT_MILLIS: Long = 60 * 60 * 1000

internal class BiometricUnlockSettings(
    private val storage: BiometricUnlockStorage,
) {
    fun isEnabledFor(accountId: String?): Boolean =
        !accountId.isNullOrBlank() && storage.enabledAccountId == accountId

    fun enableFor(accountId: String) {
        storage.enabledAccountId = accountId
    }

    fun disable() {
        storage.enabledAccountId = null
    }

    fun clearForLoggedOutAccount(accountId: String?) {
        if (storage.enabledAccountId == accountId) disable()
    }
}

internal fun canUseWelcomeBiometricAccess(
    accountId: String?,
    biometricAccessEnabled: Boolean,
): Boolean = !accountId.isNullOrBlank() && biometricAccessEnabled

internal class LocalUnlockSettings(
    private val storage: LocalUnlockStorage,
    private val nowMillis: () -> Long = System::currentTimeMillis,
) {
    fun isUnlockValidFor(accountId: String?): Boolean {
        if (accountId.isNullOrBlank() || storage.accountId != accountId) return false
        val lastAuthenticationAt = storage.lastAuthenticationAtMillis
        if (lastAuthenticationAt <= 0L) return false
        val age = nowMillis() - lastAuthenticationAt
        return age in 0..LOCAL_UNLOCK_TIMEOUT_MILLIS
    }

    fun recordCredentialLogin(accountId: String) {
        recordAuthentication(accountId)
    }

    fun recordBiometricSuccess(accountId: String) {
        recordAuthentication(accountId)
    }

    private fun recordAuthentication(accountId: String) {
        storage.accountId = accountId
        storage.lastAuthenticationAtMillis = nowMillis()
    }

    fun clear() {
        storage.accountId = null
        storage.lastAuthenticationAtMillis = 0L
    }

    fun clearForAccount(accountId: String?) {
        if (!accountId.isNullOrBlank() && storage.accountId == accountId) clear()
    }
}

internal class SharedPreferencesBiometricUnlockStorage(
    context: Context,
) : BiometricUnlockStorage {
    private val preferences: SharedPreferences =
        context.getSharedPreferences("nfcompra.biometric", Context.MODE_PRIVATE)

    override var enabledAccountId: String?
        get() = preferences.getString(ENABLED_ACCOUNT_ID, null)
        set(value) {
            preferences.edit().apply {
                if (value == null) remove(ENABLED_ACCOUNT_ID) else putString(ENABLED_ACCOUNT_ID, value)
            }.apply()
        }

    private companion object {
        const val ENABLED_ACCOUNT_ID = "enabled_account_id"
    }
}

internal class SharedPreferencesLocalUnlockStorage(
    context: Context,
) : LocalUnlockStorage {
    private val preferences: SharedPreferences =
        context.getSharedPreferences("nfcompra.local_unlock", Context.MODE_PRIVATE)

    override var accountId: String?
        get() = preferences.getString(ACCOUNT_ID, null)
        set(value) {
            preferences.edit().apply {
                if (value == null) remove(ACCOUNT_ID) else putString(ACCOUNT_ID, value)
            }.apply()
        }

    override var lastAuthenticationAtMillis: Long
        get() = preferences.getLong(LAST_AUTHENTICATION_AT_MILLIS, 0L)
        set(value) {
            preferences.edit().putLong(LAST_AUTHENTICATION_AT_MILLIS, value).apply()
        }

    private companion object {
        const val ACCOUNT_ID = "account_id"
        const val LAST_AUTHENTICATION_AT_MILLIS = "last_authentication_at_millis"
    }
}

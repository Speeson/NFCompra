package dev.esgarpe.nfcompra

import android.content.Context
import android.content.SharedPreferences

internal interface BiometricUnlockStorage {
    var enabledAccountId: String?
}

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

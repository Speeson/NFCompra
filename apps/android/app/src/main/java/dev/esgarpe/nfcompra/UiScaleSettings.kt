package dev.esgarpe.nfcompra

import android.content.Context
import android.content.SharedPreferences
import dev.esgarpe.nfcompra.core.designsystem.UiScalePreference

internal class UiScaleSettings(
    private val storage: UiScaleStorage,
) {
    var preference: UiScalePreference
        get() = UiScalePreference.fromPersistedValue(storage.persistedValue)
        set(value) {
            storage.persistedValue = value.persistedValue
        }
}

internal interface UiScaleStorage {
    var persistedValue: String?
}

internal class SharedPreferencesUiScaleStorage(
    context: Context,
    private val preferences: SharedPreferences =
        context.getSharedPreferences("nfcompra.ui", Context.MODE_PRIVATE),
) : UiScaleStorage {
    override var persistedValue: String?
        get() = preferences.getString(UI_SCALE_PREFERENCE, null)
        set(value) {
            preferences.edit().apply {
                if (value == null) remove(UI_SCALE_PREFERENCE) else putString(UI_SCALE_PREFERENCE, value)
            }.apply()
        }

    private companion object {
        const val UI_SCALE_PREFERENCE = "ui_scale_preference"
    }
}

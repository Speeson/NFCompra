package dev.esgarpe.nfcompra

import android.content.Context
import android.content.SharedPreferences
import dev.esgarpe.nfcompra.core.designsystem.BottomNavigationStylePreference
import dev.esgarpe.nfcompra.core.designsystem.ThemePreference
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

internal class BottomNavigationStyleSettings(
    private val storage: BottomNavigationStyleStorage,
) {
    var preference: BottomNavigationStylePreference
        get() = BottomNavigationStylePreference.fromPersistedValue(storage.persistedValue)
        set(value) {
            storage.persistedValue = value.persistedValue
        }
}

internal interface BottomNavigationStyleStorage {
    var persistedValue: String?
}

internal class SharedPreferencesBottomNavigationStyleStorage(
    context: Context,
    private val preferences: SharedPreferences =
        context.getSharedPreferences("nfcompra.ui", Context.MODE_PRIVATE),
) : BottomNavigationStyleStorage {
    override var persistedValue: String?
        get() = preferences.getString(BOTTOM_NAVIGATION_STYLE, null)
        set(value) {
            preferences.edit().apply {
                if (value == null) remove(BOTTOM_NAVIGATION_STYLE) else putString(BOTTOM_NAVIGATION_STYLE, value)
            }.apply()
        }

    private companion object {
        const val BOTTOM_NAVIGATION_STYLE = "bottom_navigation_style"
    }
}

internal class ThemeSettings(
    private val storage: ThemeStorage,
) {
    var preference: ThemePreference
        get() = ThemePreference.fromPersistedValue(storage.persistedValue)
        set(value) {
            storage.persistedValue = value.persistedValue
        }
}

internal interface ThemeStorage {
    var persistedValue: String?
}

internal class SharedPreferencesThemeStorage(
    context: Context,
    private val preferences: SharedPreferences =
        context.getSharedPreferences("nfcompra.ui", Context.MODE_PRIVATE),
) : ThemeStorage {
    override var persistedValue: String?
        get() = preferences.getString(THEME_PREFERENCE, null)
        set(value) {
            preferences.edit().apply {
                if (value == null) remove(THEME_PREFERENCE) else putString(THEME_PREFERENCE, value)
            }.apply()
        }

    private companion object {
        const val THEME_PREFERENCE = "theme_preference"
    }
}

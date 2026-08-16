package dev.esgarpe.nfcompra.core.designsystem

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density

enum class UiScalePreference(
    val persistedValue: String,
    val factor: Float,
    val label: String,
    val supportingText: String? = null,
) {
    Small("small", 0.90f, "Pequeño"),
    Normal("normal", 1.00f, "Normal"),
    Large("large", 1.15f, "Grande"),
    System("system", 1.00f, "Sistema", "Usa el tamaño configurado en Android");

    companion object {
        val Default = Normal

        fun fromPersistedValue(value: String?): UiScalePreference =
            entries.firstOrNull { it.persistedValue == value } ?: Default
    }
}

data class UiDensityValues(
    val density: Float,
    val fontScale: Float,
)

fun uiDensityValues(
    preference: UiScalePreference,
    systemDensity: Float,
    systemFontScale: Float,
): UiDensityValues =
    when (preference) {
        UiScalePreference.System -> UiDensityValues(systemDensity, systemFontScale)
        else -> UiDensityValues(
            density = systemDensity * preference.factor,
            fontScale = 1f,
        )
    }

@Composable
fun NFCompraUiScaleProvider(
    preference: UiScalePreference,
    content: @Composable () -> Unit,
) {
    val systemDensity = LocalDensity.current
    if (preference == UiScalePreference.System) {
        content()
        return
    }
    val values = uiDensityValues(
        preference = preference,
        systemDensity = systemDensity.density,
        systemFontScale = systemDensity.fontScale,
    )
    CompositionLocalProvider(
        LocalDensity provides Density(values.density, values.fontScale),
        content = content,
    )
}

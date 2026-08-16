package dev.esgarpe.nfcompra.core.designsystem

enum class ThemePreference(
    val persistedValue: String,
    val label: String,
) {
    Light("light", "Claro"),
    Dark("dark", "Oscuro"),
    System("system", "Sistema");

    companion object {
        val Default = System

        fun fromPersistedValue(value: String?): ThemePreference =
            entries.firstOrNull { it.persistedValue == value } ?: Default
    }
}

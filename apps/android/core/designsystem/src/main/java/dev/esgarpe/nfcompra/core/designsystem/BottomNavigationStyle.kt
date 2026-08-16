package dev.esgarpe.nfcompra.core.designsystem

enum class BottomNavigationStylePreference(
    val persistedValue: String,
    val label: String,
) {
    Original("original", "Original"),
    NavBar("navbar", "NavBar");

    companion object {
        val Default = Original

        fun fromPersistedValue(value: String?): BottomNavigationStylePreference =
            entries.firstOrNull { it.persistedValue == value } ?: Default
    }
}

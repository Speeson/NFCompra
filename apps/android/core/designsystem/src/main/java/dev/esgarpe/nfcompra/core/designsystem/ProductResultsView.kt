package dev.esgarpe.nfcompra.core.designsystem

enum class ProductResultsViewPreference(
    val persistedValue: String,
    val label: String,
    val cardMode: Boolean,
) {
    List("list", "Lista", cardMode = false),
    Grid("grid", "Cuadr\u00edcula", cardMode = true);

    companion object {
        val Default = Grid

        fun fromPersistedValue(value: String?): ProductResultsViewPreference =
            entries.firstOrNull { it.persistedValue == value } ?: Default
    }
}

package dev.esgarpe.nfcompra.feature.shoppinglist

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CatalogCategoryImagesTest {
    @Test
    fun `maps a system category to its catalog photograph`() {
        assertEquals(
            R.drawable.catalog_aceite_especias_y_salsas,
            catalogCategoryImageRes("aceite, especias y salsas"),
        )
    }

    @Test
    fun `leaves custom categories without a photograph on the icon fallback`() {
        assertNull(catalogCategoryImageRes("productos de casa"))
    }
}

package dev.esgarpe.nfcompra.feature.shoppinglist

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ProductEntryModeTest {
    @Test
    fun `quick entry creates exactly one literal temporary candidate`() {
        val catalog = listOf(product("catalog-1", "Tomate"), product("catalog-2", "Tomate pera"))

        val candidates = productEntryCandidates(ProductEntryMode.Quick, "Tomate frito", catalog)

        assertEquals(1, candidates.size)
        assertEquals("Tomate frito", candidates.single().name)
        assertNull(candidates.single().catalogProductId)
        assertNull(candidates.single().catalogProduct)
    }

    @Test
    fun `catalog entry preserves all catalog candidates and identities`() {
        val catalog = listOf(product("catalog-1", "Tomate"), product("catalog-2", "Tomate pera"))

        val candidates = productEntryCandidates(ProductEntryMode.Catalog, "Tomate", catalog)

        assertEquals(listOf("catalog-1", "catalog-2"), candidates.map { it.catalogProductId })
    }

    @Test
    fun `unknown server preference stays backward compatible`() {
        assertEquals(ProductEntryMode.Catalog, ProductEntryMode.fromApi(null))
        assertEquals(ProductEntryMode.Catalog, ProductEntryMode.fromApi("unknown"))
    }

    private fun product(id: String, name: String) = ProductCatalogUiModel(
        id = id,
        name = name,
        normalizedName = name.lowercase(),
        categoryName = null,
        packageSize = null,
        iconKey = "shopping-basket",
    )
}

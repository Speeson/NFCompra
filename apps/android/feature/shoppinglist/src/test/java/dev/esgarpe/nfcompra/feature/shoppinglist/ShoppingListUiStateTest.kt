package dev.esgarpe.nfcompra.feature.shoppinglist

import org.junit.Assert.assertEquals
import org.junit.Test

class ShoppingListUiStateTest {
    @Test
    fun `demo list has pending and checked products`() {
        val state = demoShoppingListUiState()

        assertEquals(1, state.pending.size)
        assertEquals(1, state.checked.size)
    }
}

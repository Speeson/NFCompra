package dev.esgarpe.nfcompra.feature.shoppinglist

import androidx.compose.ui.test.assertExists
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import dev.esgarpe.nfcompra.core.designsystem.NFCompraTheme
import org.junit.Rule
import org.junit.Test

class ShoppingListScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun `offline demo shows both shopping sections`() {
        composeTestRule.setContent {
            NFCompraTheme {
                ShoppingListScreen(demoShoppingListUiState(isOffline = true), onAction = {})
            }
        }

        composeTestRule.onNodeWithText("Pendientes").assertExists()
        composeTestRule.onNodeWithText("Comprados").assertExists()
        composeTestRule.onNodeWithText("Sin conexión").assertExists()
    }
}

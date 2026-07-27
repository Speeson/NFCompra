package dev.esgarpe.nfcompra.feature.shoppinglist

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import dev.esgarpe.nfcompra.core.designsystem.NFCompraTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class ShoppingListScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun offlineDemoShowsBothShoppingSections() {
        composeTestRule.setContent {
            NFCompraTheme {
                ShoppingListScreen(demoShoppingListUiState(isOffline = true), onAction = {})
            }
        }

        composeTestRule.onNodeWithText("Pendientes").assertExists()
        composeTestRule.onNodeWithText("Comprados").assertExists()
        composeTestRule.onNodeWithText("Sin conexión").assertExists()
    }

    @Test
    fun failedFirstHouseholdSetupRetainsNameAndExposesRetryAndLogout() {
        var retriedName: String? = null
        var loggedOut = false
        composeTestRule.setContent {
            NFCompraTheme {
                FirstHouseholdSetup(
                    initialName = "Casa",
                    errorMessage = "No se pudo crear el hogar.",
                    onCreate = { retriedName = it },
                    onLogout = { loggedOut = true },
                )
            }
        }

        composeTestRule.onNodeWithText("Casa").assertExists()
        composeTestRule.onNodeWithText("No se pudo crear el hogar.").assertExists()
        composeTestRule.onNodeWithText("Reintentar").performClick()
        composeTestRule.onNodeWithText("Cerrar sesión").performClick()

        assertEquals("Casa", retriedName)
        assertTrue(loggedOut)
    }
}

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

    @Test
    fun conflictShowsBothVersionsAndExplicitResolutionButtons() {
        val actions = mutableListOf<ShoppingListAction>()
        composeTestRule.setContent {
            NFCompraTheme {
                ShoppingListScreen(
                    ShoppingListUiState(
                        title = "Compra",
                        pending = listOf(
                            ShoppingListItemUiModel(
                                id = "item-1",
                                name = "Leche local",
                                quantity = "1 litro",
                                checked = false,
                                version = 1,
                                pendingState = "conflict",
                                pendingOperationId = "operation-1",
                                serverItemName = "Leche servidor",
                                serverItemVersion = 4,
                            ),
                        ),
                        checked = emptyList(),
                        isOffline = false,
                    ),
                    onAction = actions::add,
                )
            }
        }

        composeTestRule.onNodeWithText("Tu cambio (v1): Leche local").assertExists()
        composeTestRule.onNodeWithText("Servidor (v4): Leche servidor").assertExists()
        composeTestRule.onNodeWithText("Usar versión del servidor").performClick()
        composeTestRule.onNodeWithText("Reintentar mi cambio").performClick()

        assertEquals(
            listOf(
                ResolveConflict.UseServer("operation-1"),
                ResolveConflict.RetryLocal("operation-1"),
            ),
            actions,
        )
    }

    @Test
    fun deleteConflictDescribesTheLocalDeletionSeparatelyFromTheServerItem() {
        composeTestRule.setContent {
            NFCompraTheme {
                ShoppingListScreen(
                    ShoppingListUiState(
                        title = "Compra",
                        pending = listOf(
                            ShoppingListItemUiModel(
                                id = "item-1",
                                name = "Leche servidor",
                                quantity = "1 litro",
                                checked = false,
                                version = 4,
                                pendingState = "conflict",
                                pendingOperationId = "delete-operation",
                                pendingOperationType = "delete",
                                pendingExpectedVersion = 1,
                                serverItemName = "Leche servidor",
                                serverItemVersion = 4,
                            ),
                        ),
                        checked = emptyList(),
                        isOffline = false,
                    ),
                    onAction = {},
                )
            }
        }

        composeTestRule.onNodeWithText("Tu cambio (v1): Eliminar Leche servidor").assertExists()
        composeTestRule.onNodeWithText("Servidor (v4): Leche servidor").assertExists()
    }
}

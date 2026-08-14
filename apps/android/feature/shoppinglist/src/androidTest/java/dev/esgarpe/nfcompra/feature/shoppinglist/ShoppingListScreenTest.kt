package dev.esgarpe.nfcompra.feature.shoppinglist

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.assertCountEquals
import dev.esgarpe.nfcompra.core.designsystem.NFCompraTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class ShoppingListScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun authenticatedDashboardShowsMainNavigationAndCurrentContext() {
        composeTestRule.setContent {
            NFCompraTheme {
                ShoppingListContent(
                    data = ShoppingListViewState.Data(
                        content = ShoppingListUiState(
                            title = "Compra semanal",
                            pending = listOf(ShoppingListItemUiModel("milk", "Leche", "1 litro", checked = false)),
                            checked = emptyList(),
                            isOffline = false,
                        ),
                        households = listOf(HouseholdUiModel("home-1", "Casa")),
                        lists = listOf(ShoppingListSummaryUiModel("list-1", "home-1", "Compra semanal")),
                        selectedHouseholdId = "home-1",
                        selectedListId = "list-1",
                    ),
                    onAction = {},
                    onLogout = {},
                    onMembers = {},
                )
            }
        }

        composeTestRule.onNodeWithText("Inicio").assertExists()
        composeTestRule.onNodeWithText("Hogares").assertExists()
        composeTestRule.onNodeWithText("Listas").assertExists()
        composeTestRule.onNodeWithText("Catálogo").assertExists()
        composeTestRule.onNodeWithText("Perfil").assertExists()
        composeTestRule.onNodeWithContentDescription("Menú inferior principal").assertExists()
        composeTestRule.onNodeWithContentDescription("Inicio seleccionado").assertExists()
        composeTestRule.onNodeWithContentDescription("Abrir notificaciones").assertExists()
        composeTestRule.onNodeWithContentDescription("Volver").assertDoesNotExist()
        composeTestRule.onAllNodesWithText("Inicio").assertCountEquals(2)
        composeTestRule.onNodeWithText("NFCompra").assertDoesNotExist()
        composeTestRule.onNodeWithText("Miembros").assertDoesNotExist()
        composeTestRule.onNodeWithText("Salir").assertDoesNotExist()
        composeTestRule.onNodeWithText("Casa").assertExists()
        composeTestRule.onNodeWithText("Compra semanal").assertExists()
    }

    @Test
    fun zeroHouseholdsShowsAuthenticatedEmptyHomeAndKeepsShellNavigation() {
        composeTestRule.setContent {
            NFCompraTheme {
                ShoppingListContent(
                    data = ShoppingListViewState.Data(
                        content = ShoppingListUiState("Sin hogar", emptyList(), emptyList(), isOffline = false),
                        households = emptyList(),
                        lists = emptyList(),
                        selectedHouseholdId = null,
                        selectedListId = null,
                        displayName = "Bea",
                    ),
                    onAction = {},
                    onLogout = {},
                    onMembers = {},
                )
            }
        }

        composeTestRule.onNodeWithText("Empieza con NFCompra").assertExists()
        composeTestRule.onNodeWithText("+ Crear hogar").assertExists()
        composeTestRule.onNodeWithText("Ver invitaciones").assertExists()
        composeTestRule.onNodeWithText("Hogares").assertExists()
        composeTestRule.onNodeWithText("Perfil").assertExists()
        composeTestRule.onNodeWithContentDescription("Abrir notificaciones").assertExists()
    }

    @Test
    fun zeroHouseholdsSurfacesPendingInvitationActions() {
        var accepted: String? = null
        var rejected: String? = null
        composeTestRule.setContent {
            NFCompraTheme {
                ShoppingListContent(
                    data = ShoppingListViewState.Data(
                        content = ShoppingListUiState("Sin hogar", emptyList(), emptyList(), isOffline = false),
                        households = emptyList(),
                        lists = emptyList(),
                        selectedHouseholdId = null,
                        selectedListId = null,
                    ),
                    pendingInvitationNotices = listOf(
                        HouseholdInvitationNoticeUiModel(
                            notificationId = "notice-1",
                            invitationId = "invite-1",
                            title = "Invitación a Casa",
                            body = "Bea te ha invitado a Casa.",
                        ),
                    ),
                    onAcceptInvitationNotice = { accepted = it },
                    onRejectInvitationNotice = { rejected = it },
                    onAction = {},
                    onLogout = {},
                    onMembers = {},
                )
            }
        }

        composeTestRule.onNodeWithText("Tienes una invitación pendiente").assertExists()
        composeTestRule.onNodeWithText("Invitación a Casa").assertExists()
        composeTestRule.onNodeWithText("Aceptar").performClick()
        assertEquals("invite-1", accepted)
        composeTestRule.onNodeWithText("Rechazar").performClick()
        assertEquals("notice-1", rejected)
    }

    @Test
    fun zeroHouseholdsListsNavigationShowsRequirementMessage() {
        composeTestRule.setContent {
            NFCompraTheme {
                ShoppingListContent(
                    data = ShoppingListViewState.Data(
                        content = ShoppingListUiState("Sin hogar", emptyList(), emptyList(), isOffline = false),
                        households = emptyList(),
                        lists = emptyList(),
                        selectedHouseholdId = null,
                        selectedListId = null,
                    ),
                    onAction = {},
                    onLogout = {},
                    onMembers = {},
                )
            }
        }

        composeTestRule.onNodeWithText("Listas").performClick()

        composeTestRule.onNodeWithText("Necesitas pertenecer a un hogar para acceder a tus listas.").assertExists()
        composeTestRule.onNodeWithContentDescription("Inicio seleccionado").assertExists()
    }

    @Test
    fun catalogTabShowsExploreStyleCategoriesAndNotificationPanel() {
        composeTestRule.setContent {
            NFCompraTheme {
                ShoppingListContent(
                    data = ShoppingListViewState.Data(
                        content = ShoppingListUiState("Compra semanal", emptyList(), emptyList(), isOffline = false),
                        households = listOf(HouseholdUiModel("home-1", "Casa")),
                        lists = emptyList(),
                        selectedHouseholdId = "home-1",
                        selectedListId = null,
                    ),
                    onAction = {},
                    onLogout = {},
                    onMembers = {},
                )
            }
        }

        composeTestRule.onNodeWithText("Catálogo").performClick()

        composeTestRule.onNodeWithContentDescription("Volver").assertExists()
        composeTestRule.onNodeWithText("Catálogo").assertExists()
        composeTestRule.onNodeWithText("Categorías").assertDoesNotExist()
        composeTestRule.onNodeWithText("Buscar en catálogo").assertExists()
        composeTestRule.onNodeWithText("Frutas y verduras").assertExists()
        composeTestRule.onNodeWithText("Aceite y cocina").assertExists()
        composeTestRule.onNodeWithText("Carne y pescado").assertExists()

        composeTestRule.onNodeWithContentDescription("Abrir notificaciones").performClick()
        composeTestRule.onNodeWithText("No hay notificaciones nuevas").assertExists()
    }

    @Test
    fun catalogFilterButtonOpensFilterDialog() {
        composeTestRule.setContent {
            NFCompraTheme {
                ShoppingListContent(
                    data = ShoppingListViewState.Data(
                        content = ShoppingListUiState("Compra semanal", emptyList(), emptyList(), isOffline = false),
                        households = listOf(HouseholdUiModel("home-1", "Casa")),
                        lists = emptyList(),
                        selectedHouseholdId = "home-1",
                        selectedListId = null,
                    ),
                    onAction = {},
                    onLogout = {},
                    onMembers = {},
                )
            }
        }

        composeTestRule.onNodeWithText("Catálogo").performClick()
        composeTestRule.onNodeWithContentDescription("Abrir filtros de búsqueda").performClick()

        composeTestRule.onNodeWithText("Filtro de búsqueda").assertExists()
        composeTestRule.onNodeWithText("Todos los productos").assertExists()
        composeTestRule.onNodeWithText("Favoritos").assertExists()
        composeTestRule.onNodeWithText("Categoría seleccionada").assertExists()
    }

    @Test
    fun bannerBackButtonReturnsFromSecondaryTabsToHome() {
        composeTestRule.setContent {
            NFCompraTheme {
                ShoppingListContent(
                    data = ShoppingListViewState.Data(
                        content = ShoppingListUiState("Compra semanal", emptyList(), emptyList(), isOffline = false),
                        households = listOf(HouseholdUiModel("home-1", "Casa")),
                        lists = emptyList(),
                        selectedHouseholdId = "home-1",
                        selectedListId = null,
                    ),
                    onAction = {},
                    onLogout = {},
                    onMembers = {},
                )
            }
        }

        composeTestRule.onNodeWithText("Hogares").performClick()
        composeTestRule.onNodeWithContentDescription("Volver").performClick()

        composeTestRule.onNodeWithContentDescription("Inicio seleccionado").assertExists()
        composeTestRule.onNodeWithContentDescription("Volver").assertDoesNotExist()
    }

    @Test
    fun authenticatedDashboardShowsEmptyListStateForSelectedHousehold() {
        composeTestRule.setContent {
            NFCompraTheme {
                ShoppingListContent(
                    data = ShoppingListViewState.Data(
                        content = ShoppingListUiState("Sin listas", emptyList(), emptyList(), isOffline = false),
                        households = listOf(HouseholdUiModel("home-1", "Casa")),
                        lists = emptyList(),
                        selectedHouseholdId = "home-1",
                        selectedListId = null,
                    ),
                    onAction = {},
                    onLogout = {},
                    onMembers = {},
                )
            }
        }

        composeTestRule.onNodeWithText("No hay listas asociadas a este hogar.").assertExists()
        composeTestRule.onNodeWithText("Crear lista").assertExists()
    }

    @Test
    fun listCardsExposeDeleteButOpenedListDoesNot() {
        composeTestRule.setContent {
            NFCompraTheme {
                ShoppingListContent(
                    data = ShoppingListViewState.Data(
                        content = ShoppingListUiState(
                            title = "Compra semanal",
                            pending = emptyList(),
                            checked = listOf(ShoppingListItemUiModel("milk", "Leche", "1 litro", checked = true)),
                            isOffline = false,
                        ),
                        households = listOf(HouseholdUiModel("home-1", "Casa")),
                        lists = listOf(ShoppingListSummaryUiModel("list-1", "home-1", "Compra semanal")),
                        selectedHouseholdId = "home-1",
                        selectedListId = "list-1",
                    ),
                    onAction = {},
                    onLogout = {},
                    onMembers = {},
                )
            }
        }

        composeTestRule.onNodeWithText("Listas").performClick()
        composeTestRule.onNodeWithContentDescription("Eliminar lista").assertExists()
        composeTestRule.onNodeWithContentDescription("Ver lista").performClick()

        composeTestRule.onNodeWithContentDescription("Eliminar lista").assertDoesNotExist()
        composeTestRule.onNodeWithText("Vaciar").assertExists()
    }

    @Test
    fun bottomNavigationAlwaysOpensTheSelectedSectionRoot() {
        composeTestRule.setContent {
            NFCompraTheme {
                ShoppingListContent(
                    data = ShoppingListViewState.Data(
                        content = ShoppingListUiState(
                            title = "Compra semanal",
                            pending = emptyList(),
                            checked = listOf(ShoppingListItemUiModel("milk", "Leche", "1 litro", checked = true)),
                            isOffline = false,
                        ),
                        households = listOf(HouseholdUiModel("home-1", "Casa")),
                        lists = listOf(ShoppingListSummaryUiModel("list-1", "home-1", "Compra semanal")),
                        selectedHouseholdId = "home-1",
                        selectedListId = "list-1",
                    ),
                    onAction = {},
                    onLogout = {},
                    onMembers = {},
                )
            }
        }

        composeTestRule.onNodeWithText("Listas").performClick()
        composeTestRule.onNodeWithContentDescription("Ver lista").performClick()
        composeTestRule.onNodeWithText("Vaciar").assertExists()

        composeTestRule.onNodeWithText("Inicio").performClick()
        composeTestRule.onNodeWithText("Listas").performClick()

        composeTestRule.onNodeWithText("Vaciar").assertDoesNotExist()
        composeTestRule.onNodeWithText("Crear lista").assertExists()
    }

    @Test
    fun catalogCategoryShowsProductsAndCanReturnToCategories() {
        composeTestRule.setContent {
            NFCompraTheme {
                ShoppingListContent(
                    data = ShoppingListViewState.Data(
                        content = ShoppingListUiState("Compra semanal", emptyList(), emptyList(), isOffline = false),
                        households = listOf(HouseholdUiModel("home-1", "Casa")),
                        lists = emptyList(),
                        selectedHouseholdId = "home-1",
                        selectedListId = null,
                        productCategories = listOf(ProductCategoryUiModel("cat-dairy", "Lacteos", "lacteos", "milk")),
                    ),
                    onAction = {},
                    onSearchProducts = { _, _ ->
                        listOf(ProductCatalogUiModel("prod-milk", "Leche entera", "leche entera", "Lacteos", "milk", "1 L", true))
                    },
                    onLogout = {},
                    onMembers = {},
                )
            }
        }

        composeTestRule.onNodeWithText("Catálogo").performClick()
        composeTestRule.onNodeWithText("Lacteos").performClick()
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithContentDescription("Volver").assertExists()
        composeTestRule.onNodeWithText("Leche entera").assertExists()

        composeTestRule.onNodeWithContentDescription("Volver").performClick()
        composeTestRule.onNodeWithText("Lacteos").assertExists()
        composeTestRule.onNodeWithText("Leche entera").assertDoesNotExist()
    }

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

    @Test
    fun toggleConflictShowsLocalAndServerCheckedValues() {
        composeTestRule.setContent {
            NFCompraTheme {
                ShoppingListScreen(
                    ShoppingListUiState(
                        title = "Compra",
                        pending = listOf(
                            ShoppingListItemUiModel(
                                id = "item-1",
                                name = "Leche",
                                quantity = "1 litro",
                                checked = true,
                                version = 1,
                                pendingState = "conflict",
                                pendingOperationId = "toggle-operation",
                                pendingOperationType = "update",
                                pendingExpectedVersion = 1,
                                pendingIsChecked = true,
                                serverItemName = "Leche",
                                serverItemVersion = 4,
                                serverItemIsChecked = false,
                            ),
                        ),
                        checked = emptyList(),
                        isOffline = false,
                    ),
                    onAction = {},
                )
            }
        }

        composeTestRule.onNodeWithText("Tu cambio (v1): Leche · Comprado").assertExists()
        composeTestRule.onNodeWithText("Servidor (v4): Leche · Pendiente").assertExists()
    }

    @Test
    fun failedOperationExplainsThatManualReviewIsRequired() {
        composeTestRule.setContent {
            NFCompraTheme {
                ShoppingListScreen(
                    ShoppingListUiState(
                        title = "Compra",
                        pending = listOf(
                            ShoppingListItemUiModel(
                                id = "item-1",
                                name = "Leche",
                                quantity = "1 litro",
                                checked = false,
                                pendingState = "failed",
                            ),
                        ),
                        checked = emptyList(),
                        isOffline = false,
                    ),
                    onAction = {},
                )
            }
        }

        composeTestRule.onNodeWithText("No se pudo sincronizar; requiere revisión manual").assertExists()
    }
}

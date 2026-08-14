package dev.esgarpe.nfcompra.feature.shoppinglist

import app.cash.turbine.test
import dev.esgarpe.nfcompra.core.network.NetworkClient
import dev.esgarpe.nfcompra.core.network.SessionTokens
import dev.esgarpe.nfcompra.core.network.SessionSnapshot
import dev.esgarpe.nfcompra.core.network.TokenStore
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.concurrent.TimeUnit
import java.util.concurrent.CountDownLatch
import java.util.concurrent.atomic.AtomicInteger

@OptIn(ExperimentalCoroutinesApi::class)
class ShoppingListViewModelTest {
    private val server = MockWebServer()

    @Before fun setUp() {
        kotlinx.coroutines.Dispatchers.setMain(StandardTestDispatcher())
        server.start()
    }

    @After fun tearDown() {
        kotlinx.coroutines.Dispatchers.resetMain()
        server.shutdown()
    }

    @Test fun `loads authenticated household list and items into data state`() = runTest {
        server.enqueue(json("{\"households\":[{\"id\":\"home-1\",\"name\":\"Casa\",\"ownerId\":\"user-1\",\"createdAt\":\"2026-07-27T00:00:00Z\",\"updatedAt\":\"2026-07-27T00:00:00Z\"}]}"))
        server.enqueue(json("{\"lists\":[{\"id\":\"list-1\",\"householdId\":\"home-1\",\"name\":\"Compra\",\"isDefault\":true,\"version\":1,\"createdAt\":\"2026-07-27T00:00:00Z\",\"updatedAt\":\"2026-07-27T00:00:00Z\"}]}"))
        server.enqueue(json("{\"items\":[{\"id\":\"item-1\",\"listId\":\"list-1\",\"name\":\"Leche\",\"normalizedName\":\"leche\",\"quantity\":1,\"unit\":\"litro\",\"category\":null,\"note\":null,\"isChecked\":false,\"position\":0,\"version\":1,\"createdBy\":\"user-1\",\"updatedBy\":\"user-1\",\"createdAt\":\"2026-07-27T00:00:00Z\",\"updatedAt\":\"2026-07-27T00:00:00Z\"}]}"))
        val tokenStore = InMemoryTokenStore(null)
        val repository = ShoppingListRepository(NetworkClient.authenticatedApi(server.url("/").toString(), tokenStore, ShoppingListApi::class.java))
        tokenStore.save(SessionTokens("access-token", "refresh-token"))
        val viewModel = ShoppingListViewModel(repository)
        viewModel.load()

        viewModel.state.test {
            assertEquals(ShoppingListViewState.Loading, awaitItem())
            val data = awaitItem() as ShoppingListViewState.Data
            assertEquals("Compra", data.content.title)
            assertEquals(listOf("Leche"), data.content.pending.map { it.name })
            assertTrue(data.content.checked.isEmpty())
        }

        assertEquals("Bearer access-token", server.takeRequest(1, TimeUnit.SECONDS)?.getHeader("Authorization"))
    }

    @Test fun `loads metrics for every household list on initial load`() = runTest {
        val viewModel = ShoppingListViewModel(MultiListMetricsRepository())
        viewModel.load()
        advanceUntilIdle()

        val data = viewModel.state.value as ShoppingListViewState.Data
        assertEquals(2, data.listMetrics["list-1"]?.pendingCount)
        assertEquals(1, data.listMetrics["list-1"]?.checkedCount)
        assertEquals(1, data.listMetrics["list-2"]?.pendingCount)
        assertEquals(0, data.listMetrics["list-2"]?.checkedCount)
    }

    @Test fun `refreshes product categories into data state for catalog tab`() = runTest {
        val viewModel = ShoppingListViewModel(MultiListMetricsRepository())
        viewModel.load()
        advanceUntilIdle()
        viewModel.refreshProductCategories()
        advanceUntilIdle()

        val data = viewModel.state.value as ShoppingListViewState.Data
        assertEquals(listOf("Favoritos", "Lacteos"), data.productCategories.map { it.name })
    }

    @Test fun `warmProductCatalog delegates to the repository`() = runTest {
        val repository = MultiListMetricsRepository()
        val viewModel = ShoppingListViewModel(repository)

        viewModel.warmProductCatalog()
        viewModel.warmProductCatalog()
        advanceUntilIdle()

        assertEquals(2, repository.warmProductCatalogCalls)
    }

    @Test fun `updates authenticated profile through me endpoint`() = runTest {
        server.enqueue(json("{\"user\":{\"id\":\"user-1\",\"email\":\"ana@example.test\",\"name\":\"Ana Garcia\",\"firstName\":\"Ana\",\"lastName\":\"Garcia\",\"username\":\"ana\"}}"))
        val repository = ShoppingListRepository(NetworkClient.authenticatedApi(server.url("/").toString(), InMemoryTokenStore(), ShoppingListApi::class.java))

        val profile = repository.updateProfile("Ana", "Garcia", "ana")

        assertEquals("Ana Garcia", profile?.displayName)
        val request = server.takeRequest(1, TimeUnit.SECONDS)!!
        assertEquals("PATCH", request.method)
        assertEquals("/v1/me", request.path)
        assertEquals("""{"firstName":"Ana","lastName":"Garcia","username":"ana"}""", request.body.readUtf8())
    }

    @Test fun `changes authenticated password through profile endpoint`() = runTest {
        server.enqueue(json("{\"status\":\"password_changed\"}"))
        val repository = ShoppingListRepository(NetworkClient.authenticatedApi(server.url("/").toString(), InMemoryTokenStore(), ShoppingListApi::class.java))

        repository.changePassword("old-password", "new-password")

        val request = server.takeRequest(1, TimeUnit.SECONDS)!!
        assertEquals("POST", request.method)
        assertEquals("/v1/me/change-password", request.path)
        assertEquals("""{"currentPassword":"old-password","newPassword":"new-password"}""", request.body.readUtf8())
    }

    @Test fun `retries an item conflict with the server version`() = runTest {
        enqueueInitialList()
        server.enqueue(json("{\"error\":{\"code\":\"ITEM_VERSION_CONFLICT\",\"message\":\"El producto ha cambiado.\",\"details\":{\"current\":{\"id\":\"item-1\",\"listId\":\"list-1\",\"name\":\"Leche entera\",\"normalizedName\":\"leche entera\",\"quantity\":1,\"unit\":\"litro\",\"category\":null,\"note\":null,\"isChecked\":false,\"position\":0,\"version\":2,\"createdBy\":\"user-1\",\"updatedBy\":\"user-2\",\"createdAt\":\"2026-07-27T00:00:00Z\",\"updatedAt\":\"2026-07-27T00:01:00Z\"}}}}", 409))
        server.enqueue(json("{\"item\":{\"id\":\"item-1\",\"listId\":\"list-1\",\"name\":\"Leche entera\",\"normalizedName\":\"leche entera\",\"quantity\":1,\"unit\":\"litro\",\"category\":null,\"note\":null,\"isChecked\":true,\"position\":0,\"version\":3,\"createdBy\":\"user-1\",\"updatedBy\":\"user-1\",\"createdAt\":\"2026-07-27T00:00:00Z\",\"updatedAt\":\"2026-07-27T00:02:00Z\"}}"))
        server.enqueue(json("{\"items\":[{\"id\":\"item-1\",\"listId\":\"list-1\",\"name\":\"Leche entera\",\"normalizedName\":\"leche entera\",\"quantity\":1,\"unit\":\"litro\",\"category\":null,\"note\":null,\"isChecked\":true,\"position\":0,\"version\":3,\"createdBy\":\"user-1\",\"updatedBy\":\"user-1\",\"createdAt\":\"2026-07-27T00:00:00Z\",\"updatedAt\":\"2026-07-27T00:02:00Z\"}]}"))
        val viewModel = ShoppingListViewModel(ShoppingListRepository(NetworkClient.authenticatedApi(server.url("/").toString(), InMemoryTokenStore(), ShoppingListApi::class.java)))
        viewModel.load()

        viewModel.state.test {
            awaitItem()
            val loaded = awaitItem() as ShoppingListViewState.Data
            viewModel.onAction(ShoppingListAction.ToggleItem(loaded.content.pending.single().id))
            val conflicted = awaitItem() as ShoppingListViewState.Data
            assertEquals("El producto ha cambiado.", conflicted.message)
            assertEquals("Leche entera", conflicted.conflict?.name)
            assertEquals(ShoppingListAction.ToggleItem("item-1"), conflicted.retryAction)
            assertEquals(2, conflicted.content.pending.single().version)
            viewModel.onAction(ShoppingListAction.RetryConflict)
            val resolved = awaitItem() as ShoppingListViewState.Data
            assertEquals(3, resolved.content.checked.single().version)
        }

        repeat(4) { server.takeRequest(1, TimeUnit.SECONDS) }
        val retry = server.takeRequest(1, TimeUnit.SECONDS)
        assertTrue(retry?.body?.readUtf8()?.contains("\"expectedVersion\":2") == true)
    }

    @Test fun `delete sends its optimistic concurrency fields in the DELETE body`() = runTest {
        server.enqueue(json("{\"status\":\"deleted\"}"))
        val repository = ShoppingListRepository(
            NetworkClient.authenticatedApi(server.url("/").toString(), InMemoryTokenStore(), ShoppingListApi::class.java),
        )

        repository.deleteItem(
            ShoppingListItemUiModel(id = "item-1", name = "Leche", quantity = "1", checked = false, version = 7),
        )

        val request = server.takeRequest(1, TimeUnit.SECONDS)
        assertEquals("DELETE", request?.method)
        assertEquals("/v1/items/item-1", request?.path)
        val body = request?.body?.readUtf8()
        assertNotNull(body)
        assertTrue(body!!.contains("\"expectedVersion\":7"))
        assertTrue(Regex("\"operationId\":\"[0-9a-f-]{36}\"").containsMatchIn(body))
    }

    @Test fun `list mutations send optimistic concurrency fields to the API`() = runTest {
        server.enqueue(json("{\"list\":{\"id\":\"list-1\",\"householdId\":\"home-1\",\"name\":\"Mercadona\",\"isDefault\":false,\"version\":8,\"createdAt\":\"2026-07-27T00:00:00Z\",\"updatedAt\":\"2026-07-27T00:00:00Z\"}}"))
        server.enqueue(json("{\"status\":\"deleted\"}"))
        server.enqueue(json("{\"removed\":3}"))
        val repository = ShoppingListRepository(
            NetworkClient.authenticatedApi(server.url("/").toString(), InMemoryTokenStore(), ShoppingListApi::class.java),
        )
        val list = ShoppingListSummaryUiModel("list-1", "home-1", "Compra", version = 7)

        val renamed = repository.updateList(list, "Mercadona")
        repository.deleteList(renamed)
        val removed = repository.deleteCheckedItems("list-1")

        assertEquals("Mercadona", renamed.name)
        assertEquals(3, removed)
        val rename = server.takeRequest(1, TimeUnit.SECONDS)
        val delete = server.takeRequest(1, TimeUnit.SECONDS)
        val clear = server.takeRequest(1, TimeUnit.SECONDS)
        assertEquals("PATCH", rename?.method)
        assertEquals("/v1/lists/list-1", rename?.path)
        assertTrue(rename?.body?.readUtf8()?.contains("\"expectedVersion\":7") == true)
        assertEquals("DELETE", delete?.method)
        assertEquals("/v1/lists/list-1", delete?.path)
        assertTrue(delete?.body?.readUtf8()?.contains("\"expectedVersion\":8") == true)
        assertEquals("DELETE", clear?.method)
        assertEquals("/v1/lists/list-1/items/checked", clear?.path)
        assertTrue(Regex("\"operationId\":\"[0-9a-f-]{36}\"").containsMatchIn(clear?.body?.readUtf8().orEmpty()))
    }

    @Test fun `an authenticated user without homes can create the first household`() = runTest {
        server.enqueue(json("{\"households\":[]}"))
        server.enqueue(profileResponse())
        server.enqueue(json("{\"household\":{\"id\":\"home-1\",\"name\":\"Casa\",\"ownerId\":\"user-1\",\"createdAt\":\"2026-07-27T00:00:00Z\",\"updatedAt\":\"2026-07-27T00:00:00Z\"}}", 201))
        val viewModel = ShoppingListViewModel(
            ShoppingListRepository(NetworkClient.authenticatedApi(server.url("/").toString(), InMemoryTokenStore(), ShoppingListApi::class.java)),
        )
        viewModel.load()

        viewModel.state.test {
            assertEquals(ShoppingListViewState.Loading, awaitItem())
            val empty = awaitItem() as ShoppingListViewState.Data
            assertTrue(empty.households.isEmpty())
            assertEquals(null, empty.selectedHouseholdId)
            assertEquals(null, empty.selectedListId)
            assertEquals("Sin hogar", empty.content.title)
            viewModel.onAction(ShoppingListAction.CreateHousehold("Casa"))
            val data = awaitItem() as ShoppingListViewState.Data
            assertEquals("home-1", data.selectedHouseholdId)
            assertEquals(null, data.selectedListId)
            assertEquals("Sin listas", data.content.title)
            assertTrue(data.lists.isEmpty())
        }

        server.takeRequest(1, TimeUnit.SECONDS)
        server.takeRequest(1, TimeUnit.SECONDS)
        val create = server.takeRequest(1, TimeUnit.SECONDS)
        assertEquals("/v1/households", create?.path)
        assertEquals("{\"name\":\"Casa\"}", create?.body?.readUtf8())
    }

    @Test fun `a household without lists loads as selected household without selected list`() = runTest {
        server.enqueue(json("{\"households\":[{\"id\":\"home-1\",\"name\":\"Casa\",\"ownerId\":\"user-1\",\"createdAt\":\"2026-07-27T00:00:00Z\",\"updatedAt\":\"2026-07-27T00:00:00Z\"}]}"))
        server.enqueue(json("{\"lists\":[]}"))
        val viewModel = ShoppingListViewModel(
            ShoppingListRepository(NetworkClient.authenticatedApi(server.url("/").toString(), InMemoryTokenStore(), ShoppingListApi::class.java)),
        )
        viewModel.load()

        viewModel.state.test {
            assertEquals(ShoppingListViewState.Loading, awaitItem())
            val data = awaitItem() as ShoppingListViewState.Data
            assertEquals("home-1", data.selectedHouseholdId)
            assertEquals(null, data.selectedListId)
            assertEquals("Sin listas", data.content.title)
            assertTrue(data.lists.isEmpty())
        }
    }

    @Test fun `creates the first list inside a selected household without lists`() = runTest {
        server.enqueue(json("{\"households\":[{\"id\":\"home-1\",\"name\":\"Casa\",\"ownerId\":\"user-1\",\"createdAt\":\"2026-07-27T00:00:00Z\",\"updatedAt\":\"2026-07-27T00:00:00Z\"}]}"))
        server.enqueue(json("{\"lists\":[]}"))
        server.enqueue(json("{\"list\":{\"id\":\"list-1\",\"householdId\":\"home-1\",\"name\":\"Compra\",\"isDefault\":false,\"version\":1,\"createdAt\":\"2026-07-27T00:00:00Z\",\"updatedAt\":\"2026-07-27T00:00:00Z\"}}", 201))
        server.enqueue(json("{\"items\":[]}"))
        val viewModel = ShoppingListViewModel(
            ShoppingListRepository(NetworkClient.authenticatedApi(server.url("/").toString(), InMemoryTokenStore(), ShoppingListApi::class.java)),
        )
        viewModel.load()

        viewModel.state.test {
            assertEquals(ShoppingListViewState.Loading, awaitItem())
            val noLists = awaitItem() as ShoppingListViewState.Data
            assertEquals(null, noLists.selectedListId)
            viewModel.onAction(ShoppingListAction.CreateList("home-1", "Compra"))
            val data = awaitItem() as ShoppingListViewState.Data
            assertEquals("list-1", data.selectedListId)
            assertEquals("Compra", data.content.title)
        }

        server.takeRequest(1, TimeUnit.SECONDS)
        server.takeRequest(1, TimeUnit.SECONDS)
        val create = server.takeRequest(1, TimeUnit.SECONDS)
        assertEquals("/v1/households/home-1/lists", create?.path)
    }

    @Test fun `failed first household creation preserves its name and can be retried`() = runTest {
        server.enqueue(json("{\"households\":[]}"))
        server.enqueue(profileResponse())
        server.enqueue(json("{\"error\":{\"code\":\"REQUEST_FAILED\",\"message\":\"No se pudo crear el hogar.\",\"details\":{}}}", 503))
        server.enqueue(json("{\"household\":{\"id\":\"home-1\",\"name\":\"Casa\",\"ownerId\":\"user-1\",\"createdAt\":\"2026-07-27T00:00:00Z\",\"updatedAt\":\"2026-07-27T00:00:00Z\"}}", 201))
        val viewModel = ShoppingListViewModel(
            ShoppingListRepository(NetworkClient.authenticatedApi(server.url("/").toString(), InMemoryTokenStore(), ShoppingListApi::class.java)),
        )
        viewModel.load()

        viewModel.state.test {
            assertEquals(ShoppingListViewState.Loading, awaitItem())
            val empty = awaitItem() as ShoppingListViewState.Data
            assertTrue(empty.households.isEmpty())
            assertEquals(null, empty.selectedHouseholdId)
            viewModel.onAction(ShoppingListAction.CreateHousehold("Casa"))
            val failed = awaitItem() as ShoppingListViewState.Data
            assertEquals("No se pudo crear el hogar.", failed.message)
            assertEquals(ShoppingListAction.CreateHousehold("Casa"), failed.retryAction)
            viewModel.onAction(failed.retryAction!!)
            val data = awaitItem() as ShoppingListViewState.Data
            assertEquals("home-1", data.selectedHouseholdId)
            assertEquals(null, data.selectedListId)
        }

        server.takeRequest(1, TimeUnit.SECONDS)
        server.takeRequest(1, TimeUnit.SECONDS)
        val failedCreate = server.takeRequest(1, TimeUnit.SECONDS)
        val retriedCreate = server.takeRequest(1, TimeUnit.SECONDS)
        assertEquals("{\"name\":\"Casa\"}", failedCreate?.body?.readUtf8())
        assertEquals("{\"name\":\"Casa\"}", retriedCreate?.body?.readUtf8())
    }

    @Test fun `the household selector can create and select another list`() = runTest {
        enqueueInitialList()
        server.enqueue(json("{\"list\":{\"id\":\"list-2\",\"householdId\":\"home-1\",\"name\":\"Ferretería\",\"isDefault\":false,\"version\":1,\"createdAt\":\"2026-07-27T00:01:00Z\",\"updatedAt\":\"2026-07-27T00:01:00Z\"}}", 201))
        server.enqueue(json("{\"items\":[]}"))
        val viewModel = ShoppingListViewModel(
            ShoppingListRepository(NetworkClient.authenticatedApi(server.url("/").toString(), InMemoryTokenStore(), ShoppingListApi::class.java)),
        )
        viewModel.load()

        viewModel.state.test {
            awaitItem()
            awaitItem()
            viewModel.onAction(ShoppingListAction.CreateList("home-1", "Ferretería"))
            val data = awaitItem() as ShoppingListViewState.Data
            assertEquals("list-2", data.selectedListId)
            assertEquals(listOf("Compra", "Ferretería"), data.lists.map { it.name })
        }

        repeat(3) { server.takeRequest(1, TimeUnit.SECONDS) }
        val create = server.takeRequest(1, TimeUnit.SECONDS)
        assertEquals("/v1/households/home-1/lists", create?.path)
        assertEquals("{\"name\":\"Ferretería\"}", create?.body?.readUtf8())
    }

    @Test fun `notification context selects its exact household and list`() = runTest {
        server.enqueue(json("{\"households\":[{\"id\":\"home-9\",\"name\":\"Taller\",\"ownerId\":\"owner\",\"createdAt\":\"2026-07-27T00:00:00Z\",\"updatedAt\":\"2026-07-27T00:00:00Z\"}]}"))
        server.enqueue(json("{\"lists\":[{\"id\":\"list-9\",\"householdId\":\"home-9\",\"name\":\"Ferretería\",\"isDefault\":false,\"version\":1,\"createdAt\":\"2026-07-27T00:00:00Z\",\"updatedAt\":\"2026-07-27T00:00:00Z\"}]}"))
        server.enqueue(json("{\"items\":[]}"))
        val viewModel = ShoppingListViewModel(ShoppingListRepository(NetworkClient.authenticatedApi(server.url("/").toString(), InMemoryTokenStore(), ShoppingListApi::class.java)))
        viewModel.openContext("home-9", "list-9")
        viewModel.state.test {
            assertEquals(ShoppingListViewState.Loading, awaitItem())
            val data = awaitItem() as ShoppingListViewState.Data
            assertEquals("home-9", data.selectedHouseholdId)
            assertEquals("list-9", data.selectedListId)
        }
    }

    @Test fun `requested household context fails closed when it is not authorized`() = runTest {
        server.enqueue(json("{\"households\":[{\"id\":\"home-1\",\"name\":\"Casa\",\"ownerId\":\"owner\",\"createdAt\":\"2026-07-27T00:00:00Z\",\"updatedAt\":\"2026-07-27T00:00:00Z\"}]}"))
        val viewModel = ShoppingListViewModel(ShoppingListRepository(NetworkClient.authenticatedApi(server.url("/").toString(), InMemoryTokenStore(), ShoppingListApi::class.java)))

        viewModel.openContext("home-9")

        viewModel.state.test {
            assertEquals(ShoppingListViewState.Loading, awaitItem())
            val error = awaitItem() as ShoppingListViewState.Error
            assertEquals("No se pudo abrir este hogar.", error.message)
        }

        assertEquals("/v1/households", server.takeRequest(1, TimeUnit.SECONDS)?.path)
        assertEquals(1, server.requestCount)
    }

    @Test fun `context requested during initial load wins and retains household selectors`() = runTest {
        kotlinx.coroutines.Dispatchers.setMain(UnconfinedTestDispatcher())
        val defaultStarted = CountDownLatch(1)
        val releaseDefault = CountDownLatch(1)
        val defaultFinished = CountDownLatch(1)
        val householdCalls = AtomicInteger()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest) = when (request.path) {
                "/v1/households" -> if (householdCalls.getAndIncrement() == 0) {
                    defaultStarted.countDown()
                    releaseDefault.await(1, TimeUnit.SECONDS)
                    defaultFinished.countDown()
                    json("{\"households\":[]}")
                } else json("{\"households\":[{\"id\":\"home-1\",\"name\":\"Casa\",\"ownerId\":\"owner\",\"createdAt\":\"2026-07-27T00:00:00Z\",\"updatedAt\":\"2026-07-27T00:00:00Z\"},{\"id\":\"home-9\",\"name\":\"Taller\",\"ownerId\":\"owner\",\"createdAt\":\"2026-07-27T00:00:00Z\",\"updatedAt\":\"2026-07-27T00:00:00Z\"}]}")
                "/v1/households/home-9/lists" -> json("{\"lists\":[{\"id\":\"list-9\",\"householdId\":\"home-9\",\"name\":\"Ferretería\",\"isDefault\":false,\"version\":1,\"createdAt\":\"2026-07-27T00:00:00Z\",\"updatedAt\":\"2026-07-27T00:00:00Z\"}]}")
                "/v1/lists/list-9/items" -> json("{\"items\":[]}")
                else -> MockResponse().setResponseCode(404)
            }
        }
        val viewModel = ShoppingListViewModel(ShoppingListRepository(NetworkClient.authenticatedApi(server.url("/").toString(), InMemoryTokenStore(), ShoppingListApi::class.java)))
        val staleNoHouseholds = CountDownLatch(1)
        val stateObserver = launch(Dispatchers.Default) {
            viewModel.state.collect { state ->
                if (state === ShoppingListViewState.NoHouseholds) staleNoHouseholds.countDown()
            }
        }
        viewModel.load()
        try {
            viewModel.state.test {
                assertEquals(ShoppingListViewState.Loading, awaitItem())
                assertTrue(defaultStarted.await(1, TimeUnit.SECONDS))
                viewModel.openContext("home-9", "list-9")
                val data = awaitItem() as ShoppingListViewState.Data
                assertEquals("home-9", data.selectedHouseholdId)
                assertEquals("list-9", data.selectedListId)
                assertEquals(listOf("Casa", "Taller"), data.households.map { it.name })
                releaseDefault.countDown()
                assertTrue(defaultFinished.await(1, TimeUnit.SECONDS))
                assertFalse(staleNoHouseholds.await(500, TimeUnit.MILLISECONDS))
            }
        } finally {
            stateObserver.cancelAndJoin()
        }
    }

    @Test fun `delayed cached selection from an older context cannot replace the current context`() = runTest {
        val repository = DelayedCachedContextRepository()
        val viewModel = ShoppingListViewModel(repository)

        viewModel.openContext("home-a", "list-a")
        runCurrent()
        repository.firstCacheStarted.await()

        viewModel.openContext("home-b", "list-b")
        advanceUntilIdle()
        assertEquals(
            "list-b",
            (viewModel.state.value as ShoppingListViewState.Data).selectedListId,
        )

        repository.releaseFirstCache.complete(Unit)
        advanceUntilIdle()

        val current = viewModel.state.value as ShoppingListViewState.Data
        assertEquals("home-b", current.selectedHouseholdId)
        assertEquals("list-b", current.selectedListId)
        assertEquals("Compra B", current.content.title)
    }

    @Test fun `an already loaded list keeps observing Room emissions`() = runTest {
        val itemFlow = MutableStateFlow(
            listOf(
                ShoppingListItemUiModel(
                    id = "item-1",
                    name = "Leche",
                    quantity = "1 litro",
                    checked = false,
                ),
            ),
        )
        val viewModel = ShoppingListViewModel(FlowShoppingRepository(itemFlow))

        viewModel.load()
        advanceUntilIdle()
        assertEquals("Leche", (viewModel.state.value as ShoppingListViewState.Data).content.pending.single().name)

        itemFlow.value = listOf(
            ShoppingListItemUiModel(
                id = "item-1",
                name = "Leche entera",
                quantity = "1 litro",
                checked = false,
                pendingState = "pending",
            ),
        )
        advanceUntilIdle()

        val updated = viewModel.state.value as ShoppingListViewState.Data
        assertEquals("Leche entera", updated.content.pending.single().name)
        assertEquals("pending", updated.content.pending.single().pendingState)
    }

    @Test fun `conflict resolution actions are forwarded with the selected operation id`() = runTest {
        val repository = ConflictShoppingRepository()
        val viewModel = ShoppingListViewModel(repository)
        viewModel.load()
        advanceUntilIdle()

        viewModel.onAction(ResolveConflict.UseServer("operation-1"))
        advanceUntilIdle()
        viewModel.onAction(ResolveConflict.RetryLocal("operation-2"))
        advanceUntilIdle()

        assertEquals(
            listOf(
                ResolveConflict.UseServer("operation-1"),
                ResolveConflict.RetryLocal("operation-2"),
            ),
            repository.resolutions,
        )
    }

    private fun enqueueInitialList() {
        server.enqueue(json("{\"households\":[{\"id\":\"home-1\",\"name\":\"Casa\",\"ownerId\":\"user-1\",\"createdAt\":\"2026-07-27T00:00:00Z\",\"updatedAt\":\"2026-07-27T00:00:00Z\"}]}"))
        server.enqueue(json("{\"lists\":[{\"id\":\"list-1\",\"householdId\":\"home-1\",\"name\":\"Compra\",\"isDefault\":true,\"version\":1,\"createdAt\":\"2026-07-27T00:00:00Z\",\"updatedAt\":\"2026-07-27T00:00:00Z\"}]}"))
        server.enqueue(json("{\"items\":[{\"id\":\"item-1\",\"listId\":\"list-1\",\"name\":\"Leche\",\"normalizedName\":\"leche\",\"quantity\":1,\"unit\":\"litro\",\"category\":null,\"note\":null,\"isChecked\":false,\"position\":0,\"version\":1,\"createdBy\":\"user-1\",\"updatedBy\":\"user-1\",\"createdAt\":\"2026-07-27T00:00:00Z\",\"updatedAt\":\"2026-07-27T00:00:00Z\"}]}"))
    }

    private fun json(body: String, status: Int = 200) = MockResponse().setResponseCode(status).setHeader("content-type", "application/json").setBody(body)

    private fun profileResponse() = json(
        """{"user":{"id":"user-1","email":"bea@example.com","name":"Bea","firstName":"Bea","lastName":null,"username":"bea"}}""",
    )
}

private class FlowShoppingRepository(
    private val items: StateFlow<List<ShoppingListItemUiModel>>,
) : ShoppingRepository {
    override val continuouslyObservesItems = true
    override suspend fun households() = listOf(HouseholdUiModel("home-1", "Casa"))
    override suspend fun lists(householdId: String) =
        listOf(ShoppingListSummaryUiModel("list-1", householdId, "Compra"))
    override fun observeItems(listId: String) = items
    override suspend fun createHousehold(name: String) =
        error("No se usa en esta prueba.")
    override suspend fun createList(householdId: String, name: String) =
        error("No se usa en esta prueba.")
    override suspend fun createItem(listId: String, name: String, quantity: Double) =
        error("No se usa en esta prueba.")
    override suspend fun updateItem(item: ShoppingListItemUiModel, name: String?, checked: Boolean?, quantity: Double?) =
        error("No se usa en esta prueba.")
    override suspend fun deleteItem(item: ShoppingListItemUiModel) =
        error("No se usa en esta prueba.")
}

private class MultiListMetricsRepository : ShoppingRepository {
    private val itemsByList = mapOf(
        "list-1" to listOf(
            ShoppingListItemUiModel("item-1", "Leche", "1", checked = false),
            ShoppingListItemUiModel("item-2", "Pan", "1", checked = false),
            ShoppingListItemUiModel("item-3", "Huevos", "1", checked = true),
        ),
        "list-2" to listOf(
            ShoppingListItemUiModel("item-4", "Tomate", "1", checked = false),
        ),
    )

    override suspend fun households() = listOf(HouseholdUiModel("home-1", "Casa"))
    override suspend fun lists(householdId: String) = listOf(
        ShoppingListSummaryUiModel("list-1", householdId, "Compra"),
        ShoppingListSummaryUiModel("list-2", householdId, "Cena"),
    )
    override suspend fun productCategories() = listOf(
        ProductCategoryUiModel("favorites", "Favoritos", "favoritos", "star", isFavorite = true),
        ProductCategoryUiModel("cat-dairy", "Lacteos", "lacteos", "milk"),
    )
    var warmProductCatalogCalls = 0
    override suspend fun warmProductCatalog() {
        warmProductCatalogCalls++
    }
    override fun observeItems(listId: String) = MutableStateFlow(itemsByList.getValue(listId))
    override suspend fun createHousehold(name: String) = error("No se usa en esta prueba.")
    override suspend fun createList(householdId: String, name: String) = error("No se usa en esta prueba.")
    override suspend fun createItem(listId: String, name: String, quantity: Double) = error("No se usa en esta prueba.")
    override suspend fun updateItem(item: ShoppingListItemUiModel, name: String?, checked: Boolean?, quantity: Double?) =
        error("No se usa en esta prueba.")
    override suspend fun deleteItem(item: ShoppingListItemUiModel) = error("No se usa en esta prueba.")
}

private class ConflictShoppingRepository : ShoppingRepository {
    val resolutions = mutableListOf<ResolveConflict>()
    override suspend fun households() = listOf(HouseholdUiModel("home-1", "Casa"))
    override suspend fun lists(householdId: String) =
        listOf(ShoppingListSummaryUiModel("list-1", householdId, "Compra"))
    override fun observeItems(listId: String) = MutableStateFlow(
        listOf(
            ShoppingListItemUiModel(
                id = "item-1",
                name = "Leche local",
                quantity = "1 litro",
                checked = false,
                version = 1,
                pendingState = "conflict",
                pendingOperationId = "operation-1",
                serverItemName = "Leche servidor",
                serverItemVersion = 2,
            ),
        ),
    )
    override suspend fun createHousehold(name: String) = error("No se usa en esta prueba.")
    override suspend fun createList(householdId: String, name: String) = error("No se usa en esta prueba.")
    override suspend fun createItem(listId: String, name: String, quantity: Double) = error("No se usa en esta prueba.")
    override suspend fun updateItem(item: ShoppingListItemUiModel, name: String?, checked: Boolean?, quantity: Double?) =
        error("No se usa en esta prueba.")
    override suspend fun deleteItem(item: ShoppingListItemUiModel) = error("No se usa en esta prueba.")
    override suspend fun resolveConflict(resolution: ResolveConflict) {
        resolutions += resolution
    }
}

private class DelayedCachedContextRepository : ShoppingRepository {
    val firstCacheStarted = CompletableDeferred<Unit>()
    val releaseFirstCache = CompletableDeferred<Unit>()
    private var cachedHouseholdCalls = 0
    private val households = listOf(
        HouseholdUiModel("home-a", "Casa A"),
        HouseholdUiModel("home-b", "Casa B"),
    )

    override suspend fun cachedHouseholds(): List<HouseholdUiModel> {
        if (cachedHouseholdCalls++ == 0) {
            firstCacheStarted.complete(Unit)
            releaseFirstCache.await()
        }
        return households
    }

    override suspend fun cachedLists(householdId: String) = listOf(
        if (householdId == "home-a") {
            ShoppingListSummaryUiModel("list-a", "home-a", "Compra A")
        } else {
            ShoppingListSummaryUiModel("list-b", "home-b", "Compra B")
        },
    )

    override suspend fun households() = households
    override suspend fun lists(householdId: String) = cachedLists(householdId)
    override fun observeItems(listId: String) = MutableStateFlow(emptyList<ShoppingListItemUiModel>())
    override suspend fun createHousehold(name: String) = error("No se usa en esta prueba.")
    override suspend fun createList(householdId: String, name: String) = error("No se usa en esta prueba.")
    override suspend fun createItem(listId: String, name: String, quantity: Double) = error("No se usa en esta prueba.")
    override suspend fun updateItem(item: ShoppingListItemUiModel, name: String?, checked: Boolean?, quantity: Double?) =
        error("No se usa en esta prueba.")
    override suspend fun deleteItem(item: ShoppingListItemUiModel) = error("No se usa en esta prueba.")
}

private class InMemoryTokenStore(initialTokens: SessionTokens? = SessionTokens("access-token", "refresh-token")) : TokenStore {
    private val mutableSession = MutableStateFlow(initialTokens)
    override val session: StateFlow<SessionTokens?> = mutableSession
    private var identity = if (initialTokens == null) 0L else 1L
    private var tokens: SessionTokens?
        get() = mutableSession.value
        set(value) { mutableSession.value = value }
    override fun current() = tokens
    override fun generation() = identity
    override fun snapshot() = tokens?.let { SessionSnapshot(identity, it) }
    override suspend fun read() = tokens
    override suspend fun save(tokens: SessionTokens) { identity++; this.tokens = tokens }
    override suspend fun clear() { identity++; tokens = null }
    override suspend fun compareAndStart(expectedGeneration: Long, tokens: SessionTokens): Boolean {
        if (identity != expectedGeneration) return false
        identity++
        this.tokens = tokens
        return true
    }
    override suspend fun compareAndSave(expected: SessionSnapshot, tokens: SessionTokens): Boolean {
        if (snapshot() != expected) return false
        this.tokens = tokens
        return true
    }
    override suspend fun compareAndClear(expected: SessionSnapshot): Boolean {
        if (snapshot() != expected) return false
        identity++
        tokens = null
        return true
    }
}

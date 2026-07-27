package dev.esgarpe.nfcompra.feature.shoppinglist

import app.cash.turbine.test
import dev.esgarpe.nfcompra.core.network.NetworkClient
import dev.esgarpe.nfcompra.core.network.SessionTokens
import dev.esgarpe.nfcompra.core.network.TokenStore
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.concurrent.TimeUnit

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

    @Test fun `an authenticated user without homes can create the first household`() = runTest {
        server.enqueue(json("{\"households\":[]}"))
        server.enqueue(json("{\"household\":{\"id\":\"home-1\",\"name\":\"Casa\",\"ownerId\":\"user-1\",\"createdAt\":\"2026-07-27T00:00:00Z\",\"updatedAt\":\"2026-07-27T00:00:00Z\"},\"defaultList\":{\"id\":\"list-1\",\"householdId\":\"home-1\",\"name\":\"Compra\",\"isDefault\":true,\"version\":1,\"createdAt\":\"2026-07-27T00:00:00Z\",\"updatedAt\":\"2026-07-27T00:00:00Z\"}}", 201))
        server.enqueue(json("{\"items\":[]}"))
        val viewModel = ShoppingListViewModel(
            ShoppingListRepository(NetworkClient.authenticatedApi(server.url("/").toString(), InMemoryTokenStore(), ShoppingListApi::class.java)),
        )
        viewModel.load()

        viewModel.state.test {
            assertEquals(ShoppingListViewState.Loading, awaitItem())
            assertEquals(ShoppingListViewState.NoHouseholds, awaitItem())
            viewModel.onAction(ShoppingListAction.CreateHousehold("Casa"))
            val data = awaitItem() as ShoppingListViewState.Data
            assertEquals("home-1", data.selectedHouseholdId)
            assertEquals("list-1", data.selectedListId)
        }

        server.takeRequest(1, TimeUnit.SECONDS)
        val create = server.takeRequest(1, TimeUnit.SECONDS)
        assertEquals("/v1/households", create?.path)
        assertEquals("{\"name\":\"Casa\"}", create?.body?.readUtf8())
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
            viewModel.onAction(ShoppingListAction.CreateList("Ferretería"))
            val data = awaitItem() as ShoppingListViewState.Data
            assertEquals("list-2", data.selectedListId)
            assertEquals(listOf("Compra", "Ferretería"), data.lists.map { it.name })
        }

        repeat(3) { server.takeRequest(1, TimeUnit.SECONDS) }
        val create = server.takeRequest(1, TimeUnit.SECONDS)
        assertEquals("/v1/households/home-1/lists", create?.path)
        assertEquals("{\"name\":\"Ferretería\"}", create?.body?.readUtf8())
    }

    private fun enqueueInitialList() {
        server.enqueue(json("{\"households\":[{\"id\":\"home-1\",\"name\":\"Casa\",\"ownerId\":\"user-1\",\"createdAt\":\"2026-07-27T00:00:00Z\",\"updatedAt\":\"2026-07-27T00:00:00Z\"}]}"))
        server.enqueue(json("{\"lists\":[{\"id\":\"list-1\",\"householdId\":\"home-1\",\"name\":\"Compra\",\"isDefault\":true,\"version\":1,\"createdAt\":\"2026-07-27T00:00:00Z\",\"updatedAt\":\"2026-07-27T00:00:00Z\"}]}"))
        server.enqueue(json("{\"items\":[{\"id\":\"item-1\",\"listId\":\"list-1\",\"name\":\"Leche\",\"normalizedName\":\"leche\",\"quantity\":1,\"unit\":\"litro\",\"category\":null,\"note\":null,\"isChecked\":false,\"position\":0,\"version\":1,\"createdBy\":\"user-1\",\"updatedBy\":\"user-1\",\"createdAt\":\"2026-07-27T00:00:00Z\",\"updatedAt\":\"2026-07-27T00:00:00Z\"}]}"))
    }

    private fun json(body: String, status: Int = 200) = MockResponse().setResponseCode(status).setHeader("content-type", "application/json").setBody(body)
}

private class InMemoryTokenStore(initialTokens: SessionTokens? = SessionTokens("access-token", "refresh-token")) : TokenStore {
    private val mutableSession = MutableStateFlow(initialTokens)
    override val session: StateFlow<SessionTokens?> = mutableSession
    private var tokens: SessionTokens?
        get() = mutableSession.value
        set(value) { mutableSession.value = value }
    override fun current() = tokens
    override suspend fun read() = tokens
    override suspend fun save(tokens: SessionTokens) { this.tokens = tokens }
    override suspend fun clear() { tokens = null }
    override suspend fun compareAndClear(expected: SessionTokens): Boolean {
        if (tokens != expected) return false
        tokens = null
        return true
    }
}

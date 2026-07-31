package dev.esgarpe.nfcompra.feature.shoppinglist

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import dev.esgarpe.nfcompra.core.database.LocalHousehold
import dev.esgarpe.nfcompra.core.database.LocalShoppingItem
import dev.esgarpe.nfcompra.core.database.LocalShoppingList
import dev.esgarpe.nfcompra.core.database.NfCompraDatabase
import dev.esgarpe.nfcompra.core.database.PendingOperationState
import dev.esgarpe.nfcompra.core.database.PendingOperationType
import dev.esgarpe.nfcompra.core.database.SnapshotCollection
import java.io.IOException
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.util.UUID

@RunWith(RobolectricTestRunner::class)
class OfflineShoppingRepositoryTest {
    private lateinit var database: NfCompraDatabase
    private lateinit var server: MockWebServer
    private lateinit var repository: OfflineShoppingRepository

    @Before
    fun setUp() {
        database = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext<Context>(),
            NfCompraDatabase::class.java,
        ).allowMainThreadQueries().build()
        server = MockWebServer()
        server.start()
        repository = OfflineShoppingRepository(
            api = retrofitApi(server),
            dao = database.shoppingDao(),
            clock = { 1_000L },
        )
    }

    @After
    fun tearDown() {
        database.close()
        server.shutdown()
    }

    @Test
    fun `observing a list returns cached items without making a network request`() = runTest {
        seedItem()

        val items = repository.observeItems("list-1").first()

        assertEquals(listOf("Leche"), items.map { it.name })
        assertEquals("1 litro", items.single().quantity)
        assertEquals(0, server.requestCount)
    }

    @Test
    fun `refresh stores server households lists and items before observation`() = runTest {
        server.enqueue(json("""{"households":[{"id":"home-1","name":"Casa","ownerId":"owner-1","createdAt":"2026-07-27T00:00:00Z","updatedAt":"2026-07-27T00:00:00Z"}]}"""))
        server.enqueue(json("""{"lists":[{"id":"list-1","householdId":"home-1","name":"Compra","isDefault":true,"version":1,"createdAt":"2026-07-27T00:00:00Z","updatedAt":"2026-07-27T00:00:00Z"}]}"""))
        server.enqueue(json("""{"items":[{"id":"item-1","listId":"list-1","name":"Leche","normalizedName":"leche","quantity":1,"unit":"litro","category":null,"note":null,"isChecked":false,"position":0,"version":7,"createdBy":"user-1","updatedBy":"user-1","createdAt":"2026-07-27T00:00:00Z","updatedAt":"2026-07-27T00:00:00Z"}]}"""))

        val households = repository.households()
        val lists = repository.lists("home-1")
        repository.refreshItems("list-1")
        val items = repository.observeItems("list-1").first()

        assertEquals(listOf("Casa"), households.map { it.name })
        assertEquals(listOf("Compra"), lists.map { it.name })
        assertEquals(listOf("Leche"), items.map { it.name })
        assertEquals("item-1", database.shoppingDao().items("list-1").single().id)
        assertEquals(3, server.requestCount)
    }

    @Test
    fun `household refresh returns the Room state that retains pending local data`() = runTest {
        seedItem()
        database.shoppingDao().enqueue(pending("pending-local", createdAt = 500))
        server.enqueue(json("""{"households":[]}"""))

        val households = repository.households()

        assertEquals(listOf("home-1"), households.map { it.id })
        assertEquals(listOf("home-1"), database.shoppingDao().households().map { it.id })
    }

    @Test
    fun `list refresh returns the Room state that retains pending local data`() = runTest {
        seedItem()
        database.shoppingDao().enqueue(pending("pending-local", createdAt = 500))
        server.enqueue(json("""{"lists":[]}"""))

        val lists = repository.lists("home-1")

        assertEquals(listOf("list-1"), lists.map { it.id })
        assertEquals(listOf("list-1"), database.shoppingDao().lists("home-1").map { it.id })
    }

    @Test
    fun `cached households do not hide HTTP authorization or server failures`() = runTest {
        seedList()
        server.enqueue(
            MockResponse()
                .setResponseCode(403)
                .setHeader("content-type", "application/json")
                .setBody("""{"error":{"code":"FORBIDDEN","message":"Acceso denegado.","details":{}}}"""),
        )
        server.enqueue(
            MockResponse()
                .setResponseCode(500)
                .setHeader("content-type", "application/json")
                .setBody("""{"error":{"code":"SERVER_ERROR","message":"Error interno.","details":{}}}"""),
        )

        val forbidden = runCatching { repository.households() }.exceptionOrNull()
        val serverError = runCatching { repository.households() }.exceptionOrNull()

        assertTrue(forbidden is ShoppingListApiException)
        assertEquals(403, (forbidden as ShoppingListApiException).status)
        assertTrue(serverError is ShoppingListApiException)
        assertEquals(500, (serverError as ShoppingListApiException).status)
        assertFalse(repository.isOffline)
    }

    @Test
    fun `cached households remain available after a transport failure`() = runTest {
        seedList()
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))

        val households = repository.households()

        assertEquals(listOf("Casa"), households.map { it.name })
        assertTrue(repository.isOffline)
    }

    @Test
    fun `valid empty item snapshot remains available after a transport failure`() = runTest {
        seedListWithoutItemSnapshot()
        server.enqueue(json("""{"items":[]}"""))
        repository.refreshItems("list-1")
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))

        repository.refreshItems("list-1")

        assertTrue(repository.observeItems("list-1").first().isEmpty())
        assertEquals(1_000L, database.shoppingDao().snapshot(SnapshotCollection.items("list-1"))?.updatedAt)
        assertTrue(repository.isOffline)
    }

    @Test
    fun `valid empty household and list snapshots remain available after transport failures`() = runTest {
        server.enqueue(json("""{"households":[]}"""))
        assertTrue(repository.households().isEmpty())
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))
        assertTrue(repository.households().isEmpty())

        database.shoppingDao().replaceHouseholds(
            listOf(
                LocalHousehold(
                    id = "home-1",
                    name = "Casa",
                    ownerId = "owner-1",
                    createdAt = "2026-07-27T00:00:00Z",
                    updatedAt = "2026-07-27T00:00:00Z",
                ),
            ),
        )
        server.enqueue(json("""{"lists":[]}"""))
        assertTrue(repository.lists("home-1").isEmpty())
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))
        assertTrue(repository.lists("home-1").isEmpty())
        assertTrue(repository.isOffline)
    }

    @Test
    fun `first item transport failure is not treated as an empty cached snapshot`() = runTest {
        seedListWithoutItemSnapshot()
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))

        val failure = runCatching { repository.refreshItems("list-1") }.exceptionOrNull()

        assertTrue(failure is IOException)
        assertEquals(null, database.shoppingDao().snapshot(SnapshotCollection.items("list-1")))
    }

    @Test
    fun `item failure after its parent list was removed is not fabricated as cached empty data`() = runTest {
        seedList()
        database.shoppingDao().replaceLists("home-1", emptyList())
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))

        val failure = runCatching { repository.refreshItems("list-1") }.exceptionOrNull()

        assertTrue(failure is IOException)
        assertEquals(null, database.shoppingDao().snapshot(SnapshotCollection.items("list-1")))
    }

    @Test
    fun `a partial create response does not claim a complete collection snapshot`() = runTest {
        server.enqueue(
            json(
                """
                {
                  "household":{"id":"home-1","name":"Casa","ownerId":"owner-1","createdAt":"2026-07-27T00:00:00Z","updatedAt":"2026-07-27T00:00:00Z"},
                  "defaultList":{"id":"list-1","householdId":"home-1","name":"Compra","isDefault":true,"version":1,"createdAt":"2026-07-27T00:00:00Z","updatedAt":"2026-07-27T00:00:00Z"}
                }
                """.trimIndent(),
            ),
        )

        repository.createHousehold("Casa")

        assertEquals("home-1", database.shoppingDao().households().single().id)
        assertEquals("list-1", database.shoppingDao().lists("home-1").single().id)
        assertEquals(null, database.shoppingDao().snapshot(SnapshotCollection.HOUSEHOLDS))
        assertEquals(null, database.shoppingDao().snapshot(SnapshotCollection.lists("home-1")))
    }

    @Test
    fun `local create persists an item and one pending operation without calling the API`() = runTest {
        seedList()

        repository.createItem("list-1", "Pan")

        val item = database.shoppingDao().items("list-1").single()
        val operation = database.shoppingDao().pendingOperations().single()
        assertEquals("Pan", item.name)
        assertEquals(item.id, operation.itemId)
        assertEquals(PendingOperationType.CREATE, operation.type)
        assertEquals(PendingOperationState.PENDING, operation.state)
        assertEquals(1L, operation.id)
        assertNotNull(UUID.fromString(operation.operationId))
        assertTrue(operation.payloadJson.contains("\"operationId\":\"${operation.operationId}\""))
        assertEquals(0, server.requestCount)
    }

    @Test
    fun `local update changes the cached item and appends one pending operation`() = runTest {
        seedItem()
        database.shoppingDao().enqueue(pending("earlier-operation", createdAt = 500))

        repository.updateItem(
            ShoppingListItemUiModel(
                id = "item-1",
                name = "Leche",
                quantity = "1 litro",
                checked = false,
                version = 7,
            ),
            name = "Leche entera",
            checked = true,
        )

        val item = database.shoppingDao().item("item-1")
        val operations = database.shoppingDao().pendingOperations()
        assertEquals("Leche entera", item?.name)
        assertEquals(true, item?.isChecked)
        assertEquals(7, item?.version)
        assertEquals(listOf(1L, 2L), operations.map { it.id })
        assertEquals(PendingOperationType.UPDATE, operations.last().type)
        assertTrue(operations.last().payloadJson.contains("\"expectedVersion\":7"))
        assertEquals(0, server.requestCount)
    }

    @Test
    fun `local delete removes the cached item and appends one pending operation`() = runTest {
        seedItem()

        repository.deleteItem(
            ShoppingListItemUiModel(
                id = "item-1",
                name = "Leche",
                quantity = "1 litro",
                checked = false,
                version = 7,
            ),
        )

        val operation = database.shoppingDao().pendingOperations().single()
        assertFalse(database.shoppingDao().items("list-1").any { it.id == "item-1" })
        assertEquals(PendingOperationType.DELETE, operation.type)
        assertEquals("item-1", operation.itemId)
        assertTrue(operation.payloadJson.contains("\"expectedVersion\":7"))
        assertEquals(0, server.requestCount)
    }

    private suspend fun seedList() {
        database.shoppingDao().replaceServerSnapshot(
            households = listOf(
                LocalHousehold(
                    id = "home-1",
                    name = "Casa",
                    ownerId = "owner-1",
                    createdAt = "2026-07-27T00:00:00Z",
                    updatedAt = "2026-07-27T00:00:00Z",
                ),
            ),
            lists = listOf(
                LocalShoppingList(
                    id = "list-1",
                    householdId = "home-1",
                    name = "Compra",
                    isDefault = true,
                    version = 1,
                    createdAt = "2026-07-27T00:00:00Z",
                    updatedAt = "2026-07-27T00:00:00Z",
                ),
            ),
            items = emptyList(),
        )
    }

    private suspend fun seedListWithoutItemSnapshot() {
        database.shoppingDao().replaceHouseholds(
            listOf(
                LocalHousehold(
                    id = "home-1",
                    name = "Casa",
                    ownerId = "owner-1",
                    createdAt = "2026-07-27T00:00:00Z",
                    updatedAt = "2026-07-27T00:00:00Z",
                ),
            ),
        )
        database.shoppingDao().replaceLists(
            "home-1",
            listOf(
                LocalShoppingList(
                    id = "list-1",
                    householdId = "home-1",
                    name = "Compra",
                    isDefault = true,
                    version = 1,
                    createdAt = "2026-07-27T00:00:00Z",
                    updatedAt = "2026-07-27T00:00:00Z",
                ),
            ),
        )
    }

    private suspend fun seedItem() {
        seedList()
        database.shoppingDao().replaceItems(
            "list-1",
            listOf(
                LocalShoppingItem(
                    id = "item-1",
                    listId = "list-1",
                    name = "Leche",
                    normalizedName = "leche",
                    quantity = 1.0,
                    unit = "litro",
                    category = null,
                    note = null,
                    isChecked = false,
                    position = 0,
                    version = 7,
                    createdBy = "user-1",
                    updatedBy = "user-1",
                    createdAt = "2026-07-27T00:00:00Z",
                    updatedAt = "2026-07-27T00:00:00Z",
                ),
            ),
        )
    }

    private fun pending(operationId: String, createdAt: Long) =
        dev.esgarpe.nfcompra.core.database.PendingOperation(
            operationId = operationId,
            type = PendingOperationType.UPDATE,
            listId = "list-1",
            itemId = "item-1",
            payloadJson = "{}",
            createdAt = createdAt,
        )

    private fun retrofitApi(server: MockWebServer): ShoppingListApi =
        dev.esgarpe.nfcompra.core.network.NetworkClient.authenticatedApi(
            server.url("/").toString(),
            InMemoryOfflineTestTokenStore(),
            ShoppingListApi::class.java,
        )

    private fun json(body: String) =
        MockResponse()
            .setResponseCode(200)
            .setHeader("content-type", "application/json")
            .setBody(body)
}

private class InMemoryOfflineTestTokenStore :
    dev.esgarpe.nfcompra.core.network.TokenStore {
    private val tokens = dev.esgarpe.nfcompra.core.network.SessionTokens("access", "refresh")
    override val session = kotlinx.coroutines.flow.MutableStateFlow(tokens)
    override fun current() = tokens
    override fun generation() = 1L
    override fun snapshot() = dev.esgarpe.nfcompra.core.network.SessionSnapshot(1L, tokens)
    override suspend fun read() = tokens
    override suspend fun save(tokens: dev.esgarpe.nfcompra.core.network.SessionTokens) = Unit
    override suspend fun clear() = Unit
    override suspend fun compareAndStart(
        expectedGeneration: Long,
        tokens: dev.esgarpe.nfcompra.core.network.SessionTokens,
    ) = false
    override suspend fun compareAndSave(
        expected: dev.esgarpe.nfcompra.core.network.SessionSnapshot,
        tokens: dev.esgarpe.nfcompra.core.network.SessionTokens,
    ) = false
    override suspend fun compareAndClear(expected: dev.esgarpe.nfcompra.core.network.SessionSnapshot) = false
}

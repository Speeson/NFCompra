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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
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
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

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
    fun `cached Room data queues local mutations then one sync loop orders requests and exposes a conflict`() = runTest {
        seedItem()
        val cached = repository.observeItems("list-1").first().single()
        assertEquals("Leche", cached.name)
        assertEquals(0, server.requestCount)

        repository.updateItem(cached, name = "Leche entera", checked = null)
        val edited = repository.observeItems("list-1").first().single()
        repository.updateItem(edited, name = null, checked = true)
        val queuedIds = database.shoppingDao().pendingOperations().map { it.operationId }
        assertEquals(2, queuedIds.size)
        assertEquals(0, server.requestCount)

        server.enqueue(itemResponse("Leche entera", version = 8))
        server.enqueue(conflictResponse("Leche servidor", version = 9))
        val synchronizer = OperationSynchronizer(
            api = retrofitApi(server),
            dao = database.shoppingDao(),
            clock = { 2_000L },
        )

        assertEquals(SyncResult.Conflict, synchronizer.syncUntilBlocked())

        val first = server.takeRequest(1, TimeUnit.SECONDS)
        val second = server.takeRequest(1, TimeUnit.SECONDS)
        assertEquals(2, server.requestCount)
        assertTrue(first?.body?.readUtf8()?.contains("\"operationId\":\"${queuedIds[0]}\"") == true)
        assertTrue(second?.body?.readUtf8()?.contains("\"operationId\":\"${queuedIds[1]}\"") == true)

        assertTrue(synchronizer.resolve(ResolveConflict.UseServer(queuedIds[1])))
        assertTrue(database.shoppingDao().pendingOperations().isEmpty())
        assertEquals("Leche servidor", database.shoppingDao().item("item-1")?.name)
        assertEquals(9, database.shoppingDao().item("item-1")?.version)
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
    fun `creating a household stores it without inventing a default list or snapshot`() = runTest {
        server.enqueue(
            json(
                """
                {
                  "household":{"id":"home-1","name":"Casa","ownerId":"owner-1","createdAt":"2026-07-27T00:00:00Z","updatedAt":"2026-07-27T00:00:00Z"}
                }
                """.trimIndent(),
            ),
        )

        repository.createHousehold("Casa")

        assertEquals("home-1", database.shoppingDao().households().single().id)
        assertTrue(database.shoppingDao().lists("home-1").isEmpty())
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

    @Test
    fun `a local mutation schedules synchronization after the Room transaction`() = runTest {
        seedList()
        var scheduled = 0
        repository = OfflineShoppingRepository(
            api = retrofitApi(server),
            dao = database.shoppingDao(),
            clock = { 1_000L },
            scheduleSync = { scheduled++ },
        )

        repository.createItem("list-1", "Pan")

        assertEquals(1, scheduled)
        assertEquals(1, database.shoppingDao().pendingOperations().size)
    }

    @Test
    fun `a deleted item keeps its queue failure visible as a tombstone`() = runTest {
        seedList()
        database.shoppingDao().enqueue(
            dev.esgarpe.nfcompra.core.database.PendingOperation(
                operationId = "delete-operation",
                type = PendingOperationType.DELETE,
                listId = "list-1",
                itemId = "item-deleted",
                payloadJson = """{"expectedVersion":7,"operationId":"delete-operation"}""",
                createdAt = 1_000,
                state = PendingOperationState.FAILED,
            ),
        )

        val tombstone = repository.observeItems("list-1").first().single()

        assertEquals("Producto eliminado", tombstone.name)
        assertEquals(7, tombstone.version)
        assertEquals(PendingOperationState.FAILED, tombstone.pendingState)
        assertEquals(PendingOperationType.DELETE, tombstone.pendingOperationType)
    }

    @Test
    fun `an older blocking conflict stays visible when the same item has a later pending change`() = runTest {
        seedItem()
        val conflictId = database.shoppingDao().enqueue(
            dev.esgarpe.nfcompra.core.database.PendingOperation(
                operationId = "conflict-operation",
                type = PendingOperationType.UPDATE,
                listId = "list-1",
                itemId = "item-1",
                payloadJson = """{"name":"Leche local","expectedVersion":7,"operationId":"conflict-operation"}""",
                createdAt = 1_000,
            ),
        )
        database.shoppingDao().transitionOperation(
            id = conflictId,
            state = PendingOperationState.CONFLICT,
            attempts = 1,
            serverItemJson = """{"id":"item-1","listId":"list-1","name":"Leche servidor","normalizedName":"leche servidor","quantity":1.0,"unit":"litro","category":null,"note":null,"isChecked":false,"position":0,"version":8,"createdBy":"user-1","updatedBy":"user-2","createdAt":"created","updatedAt":"updated"}""",
        )
        database.shoppingDao().enqueue(pending("later-operation", createdAt = 2_000))

        val visible = repository.observeItems("list-1").first().single()

        assertEquals(PendingOperationState.CONFLICT, visible.pendingState)
        assertEquals("conflict-operation", visible.pendingOperationId)
        assertEquals("Leche servidor", visible.serverItemName)
    }

    @Test
    fun `a toggle conflict exposes the requested and server checked values`() = runTest {
        seedItem()
        val conflictId = database.shoppingDao().enqueue(
            dev.esgarpe.nfcompra.core.database.PendingOperation(
                operationId = "toggle-operation",
                type = PendingOperationType.UPDATE,
                listId = "list-1",
                itemId = "item-1",
                payloadJson = """{"isChecked":true,"expectedVersion":7,"operationId":"toggle-operation"}""",
                createdAt = 1_000,
            ),
        )
        database.shoppingDao().transitionOperation(
            id = conflictId,
            state = PendingOperationState.CONFLICT,
            attempts = 1,
            serverItemJson = """{"id":"item-1","listId":"list-1","name":"Leche","normalizedName":"leche","quantity":1.0,"unit":"litro","category":null,"note":null,"isChecked":false,"position":0,"version":8,"createdBy":"user-1","updatedBy":"user-2","createdAt":"created","updatedAt":"updated"}""",
        )

        val visible = repository.observeItems("list-1").first().single()

        assertEquals(true, visible.pendingIsChecked)
        assertEquals(false, visible.serverItemIsChecked)
    }

    @Test
    fun `the first successful refresh after an offline fallback schedules synchronization`() = runTest {
        seedList()
        var scheduled = 0
        repository = OfflineShoppingRepository(
            api = retrofitApi(server),
            dao = database.shoppingDao(),
            clock = { 1_000L },
            scheduleSync = { scheduled++ },
        )
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))
        repository.refreshItems("list-1")
        assertTrue(repository.isOffline)
        server.enqueue(json("""{"items":[]}"""))

        repository.refreshItems("list-1")

        assertFalse(repository.isOffline)
        assertEquals(1, scheduled)
    }

    @Test
    fun `create followed by edit rebases the generated update and preserves the optimistic projection`() = runTest {
        seedList()
        val ids = ArrayDeque(listOf("create-operation", "update-operation"))
        repository = OfflineShoppingRepository(
            api = retrofitApi(server),
            dao = database.shoppingDao(),
            clock = { if (ids.size == 2) 1_000L else 2_000L },
            operationId = { ids.removeFirst() },
        )
        repository.createItem("list-1", "Pan")
        val created = repository.observeItems("list-1").first().single()
        repository.updateItem(created, name = "Pan integral")
        server.enqueue(
            json(
                """{"item":{"id":"server-item","listId":"list-1","name":"Pan","normalizedName":"pan","quantity":1.0,"unit":null,"category":null,"note":null,"isChecked":false,"position":0,"version":1,"createdBy":"user-1","updatedBy":"user-1","createdAt":"created","updatedAt":"updated"}}""",
            ),
        )

        assertEquals(SyncResult.Succeeded, OperationSynchronizer(retrofitApi(server), database.shoppingDao()).syncNext())

        val pendingUpdate = database.shoppingDao().pendingOperations().single()
        assertEquals("server-item", pendingUpdate.itemId)
        assertTrue(pendingUpdate.payloadJson.contains("\"expectedVersion\":1"))
        assertEquals("Pan integral", database.shoppingDao().item("server-item")?.name)
        assertEquals(2, database.shoppingDao().item("server-item")?.version)
    }

    @Test
    fun `an edit enqueued while create response is in flight is rebased with the create completion`() = runTest {
        seedList()
        val ids = ArrayDeque(listOf("create-operation", "update-operation"))
        val mutex = Mutex()
        val databaseMutex = Mutex()
        val aliases = ItemIdAliases()
        repository = OfflineShoppingRepository(
            api = retrofitApi(server),
            dao = database.shoppingDao(),
            clock = { if (ids.size == 2) 1_000L else 2_000L },
            operationId = { ids.removeFirst() },
            syncMutex = mutex,
            databaseMutex = databaseMutex,
            itemAliases = aliases,
        )
        repository.createItem("list-1", "Pan")
        val created = repository.observeItems("list-1").first().single()
        val responseStarted = CountDownLatch(1)
        val releaseResponse = CountDownLatch(1)
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                responseStarted.countDown()
                releaseResponse.await(2, TimeUnit.SECONDS)
                return json(
                    """{"item":{"id":"server-item","listId":"list-1","name":"Pan","normalizedName":"pan","quantity":1.0,"unit":null,"category":null,"note":null,"isChecked":false,"position":0,"version":1,"createdBy":"user-1","updatedBy":"user-1","createdAt":"created","updatedAt":"updated"}}""",
                )
            }
        }
        val sync = launch(Dispatchers.IO) {
            OperationSynchronizer(
                retrofitApi(server),
                database.shoppingDao(),
                syncMutex = mutex,
                databaseMutex = databaseMutex,
                itemAliases = aliases,
            ).syncNext()
        }
        assertTrue(responseStarted.await(1, TimeUnit.SECONDS))

        repository.updateItem(created, name = "Pan integral")
        releaseResponse.countDown()
        sync.join()

        val pendingUpdate = database.shoppingDao().pendingOperations().single()
        assertEquals("server-item", pendingUpdate.itemId)
        assertTrue(pendingUpdate.payloadJson.contains("\"expectedVersion\":1"))
        assertEquals("Pan integral", database.shoppingDao().item("server-item")?.name)
        assertEquals(null, database.shoppingDao().item(created.id))
    }

    @Test
    fun `a stale temporary item action resolves the server id when create reconciliation wins`() = runTest {
        seedList()
        val ids = ArrayDeque(listOf("create-operation", "update-operation"))
        val syncMutex = Mutex()
        val databaseMutex = Mutex()
        val aliases = ItemIdAliases()
        repository = OfflineShoppingRepository(
            api = retrofitApi(server),
            dao = database.shoppingDao(),
            clock = { if (ids.size == 2) 1_000L else 2_000L },
            operationId = { ids.removeFirst() },
            syncMutex = syncMutex,
            databaseMutex = databaseMutex,
            itemAliases = aliases,
        )
        repository.createItem("list-1", "Pan")
        val staleTemporaryItem = repository.observeItems("list-1").first().single()
        server.enqueue(
            json(
                """{"item":{"id":"server-item","listId":"list-1","name":"Pan","normalizedName":"pan","quantity":1.0,"unit":null,"category":null,"note":null,"isChecked":false,"position":0,"version":1,"createdBy":"user-1","updatedBy":"user-1","createdAt":"created","updatedAt":"updated"}}""",
            ),
        )
        val synchronizer = OperationSynchronizer(
            api = retrofitApi(server),
            dao = database.shoppingDao(),
            syncMutex = syncMutex,
            databaseMutex = databaseMutex,
            itemAliases = aliases,
        )
        assertEquals(SyncResult.Succeeded, synchronizer.syncNext())

        repository.updateItem(staleTemporaryItem, name = "Pan integral")

        val pendingUpdate = database.shoppingDao().pendingOperations().single()
        assertEquals("server-item", pendingUpdate.itemId)
        assertTrue(pendingUpdate.payloadJson.contains("\"expectedVersion\":1"))
        assertEquals("Pan integral", database.shoppingDao().item("server-item")?.name)
        assertEquals(null, database.shoppingDao().item(staleTemporaryItem.id))
    }

    @Test
    fun `create followed by delete keeps the projection deleted and rebases the generated delete`() = runTest {
        seedList()
        val ids = ArrayDeque(listOf("create-operation", "delete-operation"))
        repository = OfflineShoppingRepository(
            api = retrofitApi(server),
            dao = database.shoppingDao(),
            clock = { if (ids.size == 2) 1_000L else 2_000L },
            operationId = { ids.removeFirst() },
        )
        repository.createItem("list-1", "Pan")
        val created = repository.observeItems("list-1").first().single()
        repository.deleteItem(created)
        server.enqueue(
            json(
                """{"item":{"id":"server-item","listId":"list-1","name":"Pan","normalizedName":"pan","quantity":1.0,"unit":null,"category":null,"note":null,"isChecked":false,"position":0,"version":1,"createdBy":"user-1","updatedBy":"user-1","createdAt":"created","updatedAt":"updated"}}""",
            ),
        )

        assertEquals(SyncResult.Succeeded, OperationSynchronizer(retrofitApi(server), database.shoppingDao()).syncNext())

        val pendingDelete = database.shoppingDao().pendingOperations().single()
        assertEquals("server-item", pendingDelete.itemId)
        assertTrue(pendingDelete.payloadJson.contains("\"expectedVersion\":1"))
        assertTrue(database.shoppingDao().items("list-1").isEmpty())
    }

    @Test
    fun `a refresh that started first cannot apply its stale snapshot after synchronization`() = runTest {
        seedItem()
        val mutex = Mutex()
        repository = OfflineShoppingRepository(
            api = retrofitApi(server),
            dao = database.shoppingDao(),
            clock = { 1_000L },
            operationId = { "update-operation" },
            syncMutex = mutex,
        )
        repository.updateItem(
            ShoppingListItemUiModel("item-1", "Leche", "1 litro", checked = false, version = 7),
            name = "Leche local",
        )
        val refreshStarted = CountDownLatch(1)
        val releaseRefresh = CountDownLatch(1)
        val mutationStarted = CountDownLatch(1)
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse = when {
                request.method == "GET" -> {
                    refreshStarted.countDown()
                    releaseRefresh.await(2, TimeUnit.SECONDS)
                    json("""{"items":[{"id":"item-1","listId":"list-1","name":"Leche antigua","normalizedName":"leche antigua","quantity":1.0,"unit":"litro","category":null,"note":null,"isChecked":false,"position":0,"version":7,"createdBy":"user-1","updatedBy":"user-1","createdAt":"created","updatedAt":"old"}]}""")
                }
                request.method == "PATCH" -> {
                    mutationStarted.countDown()
                    json("""{"item":{"id":"item-1","listId":"list-1","name":"Leche servidor","normalizedName":"leche servidor","quantity":1.0,"unit":"litro","category":null,"note":null,"isChecked":false,"position":0,"version":8,"createdBy":"user-1","updatedBy":"user-1","createdAt":"created","updatedAt":"new"}}""")
                }
                else -> MockResponse().setResponseCode(404)
            }
        }

        val refresh = launch(Dispatchers.IO) { repository.refreshItems("list-1") }
        assertTrue(refreshStarted.await(1, TimeUnit.SECONDS))
        val sync = launch(Dispatchers.IO) {
            OperationSynchronizer(retrofitApi(server), database.shoppingDao(), syncMutex = mutex).syncNext()
        }
        assertFalse(mutationStarted.await(200, TimeUnit.MILLISECONDS))
        releaseRefresh.countDown()
        refresh.join()
        sync.join()

        assertEquals("Leche servidor", database.shoppingDao().item("item-1")?.name)
        assertEquals(8, database.shoppingDao().item("item-1")?.version)
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

    private fun itemResponse(name: String, version: Int) = json(
        """{"item":${serverItemJson(name, version)}}""",
    )

    private fun conflictResponse(name: String, version: Int) =
        MockResponse()
            .setResponseCode(409)
            .setHeader("content-type", "application/json")
            .setBody("""{"error":{"code":"ITEM_VERSION_CONFLICT","message":"Conflicto","details":{"current":${serverItemJson(name, version)}}}}""")

    private fun serverItemJson(name: String, version: Int) =
        """{"id":"item-1","listId":"list-1","name":"$name","normalizedName":"${name.lowercase()}","quantity":1.0,"unit":"litro","category":null,"note":null,"isChecked":false,"position":0,"version":$version,"createdBy":"user-1","updatedBy":"user-2","createdAt":"2026-07-27T00:00:00Z","updatedAt":"2026-07-27T00:00:00Z"}"""
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

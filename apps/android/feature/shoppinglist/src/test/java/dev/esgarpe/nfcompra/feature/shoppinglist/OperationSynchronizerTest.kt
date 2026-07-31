package dev.esgarpe.nfcompra.feature.shoppinglist

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.work.BackoffPolicy
import androidx.work.Configuration
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import androidx.work.testing.WorkManagerTestInitHelper
import dev.esgarpe.nfcompra.core.database.LocalHousehold
import dev.esgarpe.nfcompra.core.database.LocalShoppingItem
import dev.esgarpe.nfcompra.core.database.LocalShoppingList
import dev.esgarpe.nfcompra.core.database.NfCompraDatabase
import dev.esgarpe.nfcompra.core.database.PendingOperation
import dev.esgarpe.nfcompra.core.database.PendingOperationState
import dev.esgarpe.nfcompra.core.database.PendingOperationType
import dev.esgarpe.nfcompra.core.database.ShoppingDao
import dev.esgarpe.nfcompra.core.network.NetworkClient
import dev.esgarpe.nfcompra.core.network.SessionSnapshot
import dev.esgarpe.nfcompra.core.network.SessionTokens
import dev.esgarpe.nfcompra.core.network.TokenStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.util.concurrent.TimeUnit
import java.util.Base64
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger

@RunWith(RobolectricTestRunner::class)
class OperationSynchronizerTest {
    private lateinit var database: NfCompraDatabase
    private lateinit var dao: ShoppingDao
    private lateinit var server: MockWebServer

    @Before
    fun setUp() = runTest {
        database = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext<Context>(),
            NfCompraDatabase::class.java,
        ).allowMainThreadQueries().build()
        dao = database.shoppingDao()
        dao.upsertHouseholdAndList(household(), shoppingList())
        server = MockWebServer()
        server.start()
    }

    @After
    fun tearDown() {
        database.close()
        server.shutdown()
    }

    @Test
    fun `syncNext executes the oldest operation with its stored operation id and removes only it`() = runTest {
        dao.upsertItemAndEnqueue(
            item("local-newer", "Huevos"),
            createOperation("operation-newer", "local-newer", "Huevos", createdAt = 200),
        )
        dao.upsertItemAndEnqueue(
            item("local-older", "Pan"),
            createOperation("operation-older", "local-older", "Pan", createdAt = 100),
        )
        server.enqueue(itemResponse("server-pan", "Pan", version = 1, status = 201))

        val result = synchronizer().syncNext()

        assertEquals(SyncResult.Succeeded, result)
        val request = server.takeRequest(1, TimeUnit.SECONDS)
        assertEquals("/v1/lists/list-1/items", request?.path)
        assertTrue(request?.body?.readUtf8()?.contains("\"operationId\":\"operation-older\"") == true)
        assertEquals(listOf("operation-newer"), dao.pendingOperations().map { it.operationId })
        assertEquals(listOf("local-newer", "server-pan"), dao.items("list-1").map { it.id }.sorted())
    }

    @Test
    fun `a confirmed create remaps later operations from the temporary id to the server id`() = runTest {
        dao.upsertItemAndEnqueue(
            item("local-created", "Pan integral"),
            createOperation("operation-create", "local-created", "Pan", createdAt = 100),
        )
        dao.enqueue(
            PendingOperation(
                operationId = "operation-update",
                type = PendingOperationType.UPDATE,
                listId = "list-1",
                itemId = "local-created",
                payloadJson = """{"name":"Pan integral","expectedVersion":0,"operationId":"operation-update"}""",
                createdAt = 200,
            ),
        )
        server.enqueue(itemResponse("server-created", "Pan", version = 1, status = 201))
        server.enqueue(itemResponse("server-created", "Pan integral", version = 2, status = 200))

        assertEquals(SyncResult.Succeeded, synchronizer().syncNext())
        val rebased = dao.pendingOperations().single()
        assertEquals("server-created", rebased.itemId)
        assertTrue(rebased.payloadJson.contains("\"expectedVersion\":1"))
        assertEquals("Pan integral", dao.item("server-created")?.name)
        assertEquals(2, dao.item("server-created")?.version)
        assertEquals(SyncResult.Succeeded, synchronizer().syncNext())

        server.takeRequest(1, TimeUnit.SECONDS)
        val update = server.takeRequest(1, TimeUnit.SECONDS)
        assertEquals("/v1/items/server-created", update?.path)
        assertTrue(update?.body?.readUtf8()?.contains("\"operationId\":\"operation-update\"") == true)
        assertEquals("Pan integral", dao.item("server-created")?.name)
    }

    @Test
    fun `a retryable server response keeps the same operation id pending and increments attempts`() = runTest {
        dao.upsertItemAndEnqueue(
            item("item-1", "Leche"),
            updateOperation("operation-stable", state = PendingOperationState.PENDING),
        )
        server.enqueue(json("{", 503))
        server.enqueue(json("""{"error":{"code":"TEMPORARY","message":"Temporal","details":{}}}""", 500))

        assertEquals(SyncResult.Retry, synchronizer().syncNext())
        assertEquals(SyncResult.Retry, synchronizer().syncNext())

        val first = server.takeRequest(1, TimeUnit.SECONDS)?.body?.readUtf8()
        val second = server.takeRequest(1, TimeUnit.SECONDS)?.body?.readUtf8()
        assertTrue(first?.contains("\"operationId\":\"operation-stable\"") == true)
        assertTrue(second?.contains("\"operationId\":\"operation-stable\"") == true)
        val retained = dao.pendingOperations().single()
        assertEquals(PendingOperationState.PENDING, retained.state)
        assertEquals(2, retained.attempts)
    }

    @Test
    fun `operation in progress remains pending for the same idempotent request`() = runTest {
        dao.upsertItemAndEnqueue(
            item("item-1", "Leche"),
            updateOperation("operation-progress", state = PendingOperationState.PENDING),
        )
        server.enqueue(json("""{"error":{"code":"OPERATION_IN_PROGRESS","message":"En curso","details":{}}}""", 409))

        assertEquals(SyncResult.Retry, synchronizer().syncNext())

        val retained = dao.pendingOperations().single()
        assertEquals(PendingOperationState.PENDING, retained.state)
        assertEquals("operation-progress", retained.operationId)
        assertEquals(1, retained.attempts)
    }

    @Test
    fun `operation id reused fails permanently and the ordered queue advances`() = runTest {
        dao.upsertItemAndEnqueue(
            item("item-1", "Leche"),
            updateOperation("operation-reused", state = PendingOperationState.PENDING),
        )
        dao.upsertItemAndEnqueue(
            item("local-later", "Pan"),
            createOperation("operation-later", "local-later", "Pan", createdAt = 2_000),
        )
        server.enqueue(json("""{"error":{"code":"OPERATION_ID_REUSED","message":"UUID reutilizado","details":{}}}""", 409))
        server.enqueue(itemResponse("server-later", "Pan", version = 1, status = 201))

        assertEquals(SyncResult.Failed, synchronizer().syncNext())
        assertEquals(SyncResult.Succeeded, synchronizer().syncNext())

        val failed = dao.pendingOperations().single()
        assertEquals("operation-reused", failed.operationId)
        assertEquals(PendingOperationState.FAILED, failed.state)
        assertEquals("server-later", dao.item("server-later")?.id)
        assertEquals(2, server.requestCount)
    }

    @Test
    fun `operation lost becomes failed instead of retrying forever`() = runTest {
        dao.upsertItemAndEnqueue(
            item("item-1", "Leche"),
            updateOperation("operation-lost", state = PendingOperationState.PENDING),
        )
        server.enqueue(json("""{"error":{"code":"OPERATION_LOST","message":"Lease perdido","details":{}}}""", 409))

        assertEquals(SyncResult.Failed, synchronizer().syncNext())

        val retained = dao.pendingOperations().single()
        assertEquals(PendingOperationState.FAILED, retained.state)
        assertEquals(1, retained.attempts)
    }

    @Test
    fun `a malformed unknown conflict fails and does not block the next operation`() = runTest {
        dao.upsertItemAndEnqueue(
            item("item-1", "Leche"),
            updateOperation("operation-unknown", state = PendingOperationState.PENDING),
        )
        dao.upsertItemAndEnqueue(
            item("local-later", "Pan"),
            createOperation("operation-later", "local-later", "Pan", createdAt = 2_000),
        )
        server.enqueue(json("<html>conflict</html>", 409))
        server.enqueue(itemResponse("server-later", "Pan", version = 1, status = 201))

        assertEquals(SyncResult.Failed, synchronizer().syncNext())
        assertEquals(SyncResult.Succeeded, synchronizer().syncNext())

        val failed = dao.pendingOperations().single()
        assertEquals("operation-unknown", failed.operationId)
        assertEquals(PendingOperationState.FAILED, failed.state)
        assertEquals("server-later", dao.item("server-later")?.id)
    }

    @Test
    fun `an io failure returns retry and restores the operation to pending`() = runTest {
        dao.upsertItemAndEnqueue(
            item("item-1", "Leche"),
            updateOperation("operation-io", state = PendingOperationState.PENDING),
        )
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))

        assertEquals(SyncResult.Retry, synchronizer().syncNext())

        val retained = dao.pendingOperations().single()
        assertEquals(PendingOperationState.PENDING, retained.state)
        assertEquals(1, retained.attempts)
    }

    @Test
    fun `an operation left syncing by a stopped worker resumes with the stored operation id`() = runTest {
        dao.upsertItemAndEnqueue(
            item("item-1", "Leche"),
            updateOperation("operation-resumed", state = PendingOperationState.SYNCING),
        )
        server.enqueue(itemResponse("item-1", "Leche local", version = 2, status = 200))

        assertEquals(SyncResult.Succeeded, synchronizer().syncNext())

        val request = server.takeRequest(1, TimeUnit.SECONDS)
        assertTrue(request?.body?.readUtf8()?.contains("\"operationId\":\"operation-resumed\"") == true)
        assertTrue(dao.pendingOperations().isEmpty())
    }

    @Test
    fun `a validation response marks the operation failed without deleting it`() = runTest {
        dao.upsertItemAndEnqueue(
            item("item-1", "Leche"),
            updateOperation("operation-invalid", state = PendingOperationState.PENDING),
        )
        server.enqueue(json("""{"error":{"code":"VALIDATION_ERROR","message":"Inválido","details":{}}}""", 422))

        assertEquals(SyncResult.Failed, synchronizer().syncNext())

        val retained = dao.pendingOperations().single()
        assertEquals(PendingOperationState.FAILED, retained.state)
        assertEquals(1, retained.attempts)
    }

    @Test
    fun `an authorization response remains pending for a later interactive session refresh`() = runTest {
        dao.upsertItemAndEnqueue(
            item("item-1", "Leche"),
            updateOperation("operation-auth", state = PendingOperationState.PENDING),
        )
        server.enqueue(json("""{"error":{"code":"UNAUTHORIZED","message":"Sesión caducada","details":{}}}""", 401))

        assertEquals(SyncResult.Retry, synchronizer().syncNext())

        val retained = dao.pendingOperations().single()
        assertEquals("operation-auth", retained.operationId)
        assertEquals(PendingOperationState.PENDING, retained.state)
        assertEquals(1, retained.attempts)
    }

    @Test
    fun `the background bearer client does not call refresh after an authorization response`() = runTest {
        server.enqueue(json("""{"error":{"code":"UNAUTHORIZED","message":"Sesión caducada","details":{}}}""", 401))
        val api = NetworkClient.bearerApi(
            server.url("/").toString(),
            TestTokenStore(),
            ShoppingListApi::class.java,
        )

        val response = api.updateItem(
            "item-1",
            UpdateItemRequest(name = "Leche", expectedVersion = 1, operationId = "operation-auth"),
        )

        assertEquals(401, response.code())
        assertEquals(1, server.requestCount)
        assertEquals("/v1/items/item-1", server.takeRequest(1, TimeUnit.SECONDS)?.path)
    }

    @Test
    fun `a local reconciliation failure after server success retries the same operation`() = runTest {
        dao.upsertItemAndEnqueue(
            item("item-1", "Leche"),
            updateOperation("operation-applied", state = PendingOperationState.PENDING),
        )
        server.enqueue(
            json(
                serverItemJson("Leche servidor", version = 2).replace(
                    "\"listId\":\"list-1\"",
                    "\"listId\":\"missing-list\"",
                ).let { """{"item":$it}""" },
                200,
            ),
        )

        assertEquals(SyncResult.Retry, synchronizer().syncNext())

        val retained = dao.pendingOperations().single()
        assertEquals("operation-applied", retained.operationId)
        assertEquals(PendingOperationState.PENDING, retained.state)
        assertEquals(1, retained.attempts)
    }

    @Test
    fun `a version conflict stores the current server item and preserves local intent`() = runTest {
        dao.upsertItemAndEnqueue(
            item("item-1", "Leche local", version = 1),
            updateOperation("operation-conflict", state = PendingOperationState.PENDING),
        )
        server.enqueue(conflictResponse("Leche servidor", version = 4))

        assertEquals(SyncResult.Conflict, synchronizer().syncNext())

        val retained = dao.pendingOperations().single()
        assertEquals(PendingOperationState.CONFLICT, retained.state)
        assertTrue(retained.serverItemJson?.contains("\"name\":\"Leche servidor\"") == true)
        assertEquals("Leche local", dao.item("item-1")?.name)
    }

    @Test
    fun `an unresolved older conflict blocks later operations in the ordered queue`() = runTest {
        dao.enqueue(
            updateOperation(
                operationId = "operation-conflict",
                state = PendingOperationState.CONFLICT,
                serverItemJson = serverItemJson("Leche servidor", version = 4),
            ),
        )
        dao.enqueue(createOperation("operation-later", "local-later", "Pan", createdAt = 2_000))

        assertEquals(SyncResult.Conflict, synchronizer().syncNext())

        assertEquals(0, server.requestCount)
        assertEquals(
            listOf("operation-conflict", "operation-later"),
            dao.pendingOperations().map { it.operationId },
        )
    }

    @Test
    fun `use server replaces the local item and discards only the selected conflict`() = runTest {
        dao.upsertItemAndEnqueue(
            item("item-1", "Leche local", version = 1),
            updateOperation(
                operationId = "operation-conflict",
                state = PendingOperationState.CONFLICT,
                serverItemJson = serverItemJson("Leche servidor", version = 4),
            ),
        )
        dao.enqueue(createOperation("operation-other", "local-other", "Pan", createdAt = 2_000))

        assertTrue(synchronizer().resolve(ResolveConflict.UseServer("operation-conflict")))

        assertEquals(listOf("operation-other"), dao.pendingOperations().map { it.operationId })
        val item = dao.item("item-1")
        assertEquals("Leche servidor", item?.name)
        assertEquals(4, item?.version)
    }

    @Test
    fun `use server rebases and replays later changes for the same item`() = runTest {
        dao.upsertItemAndEnqueue(
            item("item-1", "Leche local", version = 1),
            updateOperation(
                operationId = "operation-conflict",
                state = PendingOperationState.CONFLICT,
                serverItemJson = serverItemJson("Leche servidor", version = 4),
            ),
        )
        dao.enqueue(
            PendingOperation(
                operationId = "operation-later",
                type = PendingOperationType.UPDATE,
                listId = "list-1",
                itemId = "item-1",
                payloadJson = """{"isChecked":true,"expectedVersion":1,"operationId":"operation-later"}""",
                createdAt = 2_000,
            ),
        )

        assertTrue(synchronizer().resolve(ResolveConflict.UseServer("operation-conflict")))

        val later = dao.pendingOperations().single()
        assertEquals("operation-later", later.operationId)
        assertTrue(later.payloadJson.contains("\"expectedVersion\":4"))
        val projected = dao.item("item-1")
        assertEquals("Leche servidor", projected?.name)
        assertEquals(true, projected?.isChecked)
        assertEquals(5, projected?.version)
    }

    @Test
    fun `retry local creates a new operation using the server version and a new id`() = runTest {
        dao.upsertItemAndEnqueue(
            item("item-1", "Leche local", version = 1),
            updateOperation(
                operationId = "operation-conflict",
                state = PendingOperationState.CONFLICT,
                serverItemJson = serverItemJson("Leche servidor", version = 4),
            ),
        )

        assertTrue(synchronizer(operationIds = { "operation-retry" }).resolve(ResolveConflict.RetryLocal("operation-conflict")))

        val retried = dao.pendingOperations().single()
        assertEquals("operation-retry", retried.operationId)
        assertNotEquals("operation-conflict", retried.operationId)
        assertEquals(PendingOperationState.PENDING, retried.state)
        assertTrue(retried.payloadJson.contains("\"expectedVersion\":4"))
        assertTrue(retried.payloadJson.contains("\"operationId\":\"operation-retry\""))
        assertFalse(retried.payloadJson.contains("operation-conflict"))
        assertEquals("Leche local", dao.item("item-1")?.name)
    }

    @Test
    fun `retry local keeps the replacement before later changes for the same item`() = runTest {
        dao.upsertItemAndEnqueue(
            item("item-1", "Leche local", version = 1),
            updateOperation(
                operationId = "operation-conflict",
                state = PendingOperationState.CONFLICT,
                serverItemJson = serverItemJson("Leche servidor", version = 4),
            ),
        )
        dao.enqueue(
            PendingOperation(
                operationId = "operation-later",
                type = PendingOperationType.UPDATE,
                listId = "list-1",
                itemId = "item-1",
                payloadJson = """{"isChecked":true,"expectedVersion":1,"operationId":"operation-later"}""",
                createdAt = 2_000,
            ),
        )

        assertTrue(synchronizer(operationIds = { "operation-retry" }).resolve(ResolveConflict.RetryLocal("operation-conflict")))

        val queued = dao.pendingOperations()
        assertEquals(listOf("operation-retry", "operation-later"), queued.map { it.operationId })
        assertEquals(queued[0].id + 1, queued[1].id)
        assertTrue(queued[0].payloadJson.contains("\"expectedVersion\":4"))
    }

    @Test
    fun `sync work requires connectivity and exponential retry without exposing tokens`() {
        val request = SyncWorker.request("account-1", "http://localhost/")

        assertEquals(NetworkType.CONNECTED, request.workSpec.constraints.requiredNetworkType)
        assertEquals(BackoffPolicy.EXPONENTIAL, request.workSpec.backoffPolicy)
        assertEquals("account-1", request.workSpec.input.getString(SyncWorker.ACCOUNT_ID))
        assertEquals("http://localhost/", request.workSpec.input.getString(SyncWorker.BASE_URL))
        assertFalse(request.workSpec.input.keyValueMap.keys.any { it.contains("token", ignoreCase = true) })
    }

    @Test
    fun `sync work never sends the active credentials for a different account queue`() {
        val payload = Base64.getUrlEncoder().withoutPadding()
            .encodeToString("""{"sub":"account-b"}""".toByteArray())
        val accessToken = "header.$payload.signature"

        assertTrue(SyncWorker.tokenBelongsToAccount(accessToken, "account-b"))
        assertFalse(SyncWorker.tokenBelongsToAccount(accessToken, "account-a"))
    }

    @Test
    fun `a worker cannot refresh account A after the persisted session switches to B`() = runTest {
        val accountA = SwitchingTokenStore(tokensFor("account-a", "old"))
        val accountB = SwitchingTokenStore(tokensFor("account-b", "current"))
        var active: TokenStore = accountA
        val workerStore = ReloadingAccountTokenStore(load = { active }, accountId = "account-a")
        val expectedA = requireNotNull(workerStore.snapshot())
        active = accountB

        val saved = workerStore.compareAndSave(expectedA, tokensFor("account-a", "refreshed"))

        assertFalse(saved)
        assertEquals(tokensFor("account-b", "current"), accountB.current())
        assertEquals(null, workerStore.current())
    }

    @Test
    fun `a background worker token store never replaces the interactive session`() = runTest {
        val interactive = SwitchingTokenStore(tokensFor("account-a", "old"))
        val workerStore = ReloadingAccountTokenStore(load = { interactive }, accountId = "account-a")
        val expected = requireNotNull(workerStore.snapshot())

        val saved = workerStore.compareAndSave(expected, tokensFor("account-a", "refreshed"))

        assertFalse(saved)
        assertEquals(tokensFor("account-a", "old"), interactive.current())
    }

    @Test
    fun `shared account ownership keeps unique work until the last repository closes`() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val executor = Executors.newSingleThreadExecutor()
        val accountId = "account-${UUID.randomUUID()}"
        val firstOwner = NfCompraDatabase.create(context, accountId)
        val secondOwner = NfCompraDatabase.create(context, accountId)
        val firstState = ShoppingSyncCoordinator.acquireRepository(accountId)
        val secondState = ShoppingSyncCoordinator.acquireRepository(accountId)
        try {
            WorkManagerTestInitHelper.initializeTestWorkManager(
                context,
                Configuration.Builder().setExecutor(executor).build(),
            )

            SyncWorker.enqueue(context, accountId, "http://localhost/")

            val workManager = WorkManager.getInstance(context)
            val work = workManager
                .getWorkInfosForUniqueWork(SyncWorker.uniqueWorkName(accountId))
                .get(2, TimeUnit.SECONDS)
            assertEquals(1, work.size)
            assertEquals(NetworkType.CONNECTED, work.single().constraints.requiredNetworkType)

            releaseShoppingRepository(context, accountId, firstOwner, firstState)
            val afterFirstClose = workManager
                .getWorkInfosForUniqueWork(SyncWorker.uniqueWorkName(accountId))
                .get(2, TimeUnit.SECONDS)
            assertFalse(afterFirstClose.single().state == WorkInfo.State.CANCELLED)

            releaseShoppingRepository(context, accountId, secondOwner, secondState)
            val afterLastClose = workManager
                .getWorkInfosForUniqueWork(SyncWorker.uniqueWorkName(accountId))
                .get(2, TimeUnit.SECONDS)
            assertEquals(WorkInfo.State.CANCELLED, afterLastClose.single().state)
        } finally {
            executor.shutdownNow()
        }
    }

    @Test
    fun `last repository logout cancels an active worker and its appended successor`() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val executor = Executors.newFixedThreadPool(4)
        val accountId = "account-${UUID.randomUUID()}"
        val repositoryDatabase = NfCompraDatabase.create(context, accountId)
        val repositoryState = ShoppingSyncCoordinator.acquireRepository(accountId)
        LogoutWorkProbe.reset()
        try {
            WorkManagerTestInitHelper.initializeTestWorkManager(
                context,
                Configuration.Builder().setExecutor(executor).build(),
            )
            val workManager = WorkManager.getInstance(context)
            val uniqueName = SyncWorker.uniqueWorkName(accountId)
            workManager.enqueueUniqueWork(
                uniqueName,
                ExistingWorkPolicy.APPEND_OR_REPLACE,
                OneTimeWorkRequestBuilder<LogoutRetryWorker>()
                    .setInputData(workDataOf(LogoutRetryWorker.ACCOUNT_ID to accountId))
                    .build(),
            ).result.get(2, TimeUnit.SECONDS)
            assertTrue(LogoutWorkProbe.started.await(2, TimeUnit.SECONDS))
            workManager.enqueueUniqueWork(
                uniqueName,
                ExistingWorkPolicy.APPEND_OR_REPLACE,
                OneTimeWorkRequestBuilder<LogoutRetryWorker>()
                    .setInputData(workDataOf(LogoutRetryWorker.ACCOUNT_ID to accountId))
                    .build(),
            ).result.get(2, TimeUnit.SECONDS)

            releaseShoppingRepository(context, accountId, repositoryDatabase, repositoryState)
            LogoutWorkProbe.release.countDown()

            val terminal = awaitUniqueWork(workManager, uniqueName) { work ->
                work.size == 2 && work.all { it.state == WorkInfo.State.CANCELLED }
            }
            assertTrue(terminal.all { it.state == WorkInfo.State.CANCELLED })
            assertEquals(1, LogoutWorkProbe.attempts.get())
        } finally {
            LogoutWorkProbe.release.countDown()
            WorkManager.getInstance(context).cancelUniqueWork(SyncWorker.uniqueWorkName(accountId)).result
                .get(2, TimeUnit.SECONDS)
            executor.shutdownNow()
        }
    }

    private fun awaitUniqueWork(
        workManager: WorkManager,
        uniqueName: String,
        condition: (List<WorkInfo>) -> Boolean,
    ): List<WorkInfo> {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2)
        var latest = emptyList<WorkInfo>()
        while (System.nanoTime() < deadline) {
            latest = workManager.getWorkInfosForUniqueWork(uniqueName).get(2, TimeUnit.SECONDS)
            if (condition(latest)) return latest
            Thread.yield()
        }
        return latest
    }

    private fun synchronizer(operationIds: () -> String = { "unused-operation-id" }) = OperationSynchronizer(
        api = NetworkClient.authenticatedApi(server.url("/").toString(), TestTokenStore(), ShoppingListApi::class.java),
        dao = dao,
        clock = { 3_000L },
        operationId = operationIds,
    )

    private fun createOperation(operationId: String, itemId: String, name: String, createdAt: Long) = PendingOperation(
        operationId = operationId,
        type = PendingOperationType.CREATE,
        listId = "list-1",
        itemId = itemId,
        payloadJson = """{"name":"$name","quantity":1.0,"operationId":"$operationId"}""",
        createdAt = createdAt,
    )

    private fun updateOperation(
        operationId: String,
        state: String,
        serverItemJson: String? = null,
        createdAt: Long = 1_000,
    ) = PendingOperation(
        operationId = operationId,
        type = PendingOperationType.UPDATE,
        listId = "list-1",
        itemId = "item-1",
        payloadJson = """{"name":"Leche local","expectedVersion":1,"operationId":"$operationId"}""",
        createdAt = createdAt,
        state = state,
        serverItemJson = serverItemJson,
    )

    private fun household() = LocalHousehold("home-1", "Casa", "owner-1", "created", "updated")

    private fun shoppingList() = LocalShoppingList("list-1", "home-1", "Compra", true, 1, "created", "updated")

    private fun item(id: String, name: String, version: Int = 0) = LocalShoppingItem(
        id = id,
        listId = "list-1",
        name = name,
        normalizedName = name.lowercase(),
        quantity = 1.0,
        unit = null,
        category = null,
        note = null,
        isChecked = false,
        position = 0,
        version = version,
        createdBy = "owner-1",
        updatedBy = "owner-1",
        createdAt = "created",
        updatedAt = "updated",
    )

    private fun itemResponse(id: String, name: String, version: Int, status: Int) = json(
        """{"item":${serverItemJson(name, version, id)}}""",
        status,
    )

    private fun conflictResponse(name: String, version: Int) = json(
        """{"error":{"code":"ITEM_VERSION_CONFLICT","message":"Conflicto","details":{"current":${serverItemJson(name, version)}}}}""",
        409,
    )

    private fun serverItemJson(name: String, version: Int, id: String = "item-1") =
        """{"id":"$id","listId":"list-1","name":"$name","normalizedName":"${name.lowercase()}","quantity":1.0,"unit":null,"category":null,"note":null,"isChecked":false,"position":0,"version":$version,"createdBy":"owner-1","updatedBy":"owner-2","createdAt":"created","updatedAt":"updated"}"""

    private fun json(body: String, status: Int) = MockResponse()
        .setResponseCode(status)
        .setHeader("content-type", "application/json")
        .setBody(body)

    private fun tokensFor(accountId: String, suffix: String): SessionTokens {
        val payload = Base64.getUrlEncoder().withoutPadding()
            .encodeToString("""{"sub":"$accountId"}""".toByteArray())
        return SessionTokens("header.$payload.$suffix", "refresh-$suffix")
    }
}

private object LogoutWorkProbe {
    var started = CountDownLatch(1)
    var release = CountDownLatch(1)
    val attempts = AtomicInteger()

    fun reset() {
        started = CountDownLatch(1)
        release = CountDownLatch(1)
        attempts.set(0)
    }
}

class LogoutRetryWorker(
    appContext: Context,
    workerParameters: WorkerParameters,
) : CoroutineWorker(appContext, workerParameters) {
    override suspend fun doWork(): Result {
        val accountId = requireNotNull(inputData.getString(ACCOUNT_ID))
        val database = NfCompraDatabase.create(applicationContext, accountId)
        return try {
            LogoutWorkProbe.attempts.incrementAndGet()
            LogoutWorkProbe.started.countDown()
            LogoutWorkProbe.release.await(5, TimeUnit.SECONDS)
            Result.retry()
        } finally {
            NfCompraDatabase.release(accountId, database)
        }
    }

    companion object {
        const val ACCOUNT_ID = "accountId"
    }
}

private class TestTokenStore : TokenStore {
    private val tokens = SessionTokens("access-token", "refresh-token")
    private val mutableSession = MutableStateFlow<SessionTokens?>(tokens)
    override val session: StateFlow<SessionTokens?> = mutableSession
    override fun current() = tokens
    override fun generation() = 1L
    override fun snapshot() = SessionSnapshot(1L, tokens)
    override suspend fun read() = tokens
    override suspend fun save(tokens: SessionTokens) = Unit
    override suspend fun clear() = Unit
    override suspend fun compareAndStart(expectedGeneration: Long, tokens: SessionTokens) = true
    override suspend fun compareAndSave(expected: SessionSnapshot, tokens: SessionTokens) = true
    override suspend fun compareAndClear(expected: SessionSnapshot) = true
}

private class SwitchingTokenStore(initial: SessionTokens) : TokenStore {
    private val mutableSession = MutableStateFlow<SessionTokens?>(initial)
    private var identity = 1L
    override val session: StateFlow<SessionTokens?> = mutableSession
    override fun current() = mutableSession.value
    override fun generation() = identity
    override fun snapshot() = current()?.let { SessionSnapshot(identity, it) }
    override suspend fun read() = current()
    override suspend fun save(tokens: SessionTokens) {
        identity++
        mutableSession.value = tokens
    }
    override suspend fun clear() {
        identity++
        mutableSession.value = null
    }
    override suspend fun compareAndStart(expectedGeneration: Long, tokens: SessionTokens): Boolean {
        if (identity != expectedGeneration) return false
        save(tokens)
        return true
    }
    override suspend fun compareAndSave(expected: SessionSnapshot, tokens: SessionTokens): Boolean {
        if (snapshot() != expected) return false
        mutableSession.value = tokens
        return true
    }
    override suspend fun compareAndClear(expected: SessionSnapshot): Boolean {
        if (snapshot() != expected) return false
        clear()
        return true
    }
}

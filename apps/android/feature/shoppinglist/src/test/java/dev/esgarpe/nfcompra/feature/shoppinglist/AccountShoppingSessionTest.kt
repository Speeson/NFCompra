package dev.esgarpe.nfcompra.feature.shoppinglist

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.work.Configuration
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.testing.WorkManagerTestInitHelper
import dev.esgarpe.nfcompra.core.database.LocalShoppingItem
import dev.esgarpe.nfcompra.core.database.LocalHousehold
import dev.esgarpe.nfcompra.core.database.LocalShoppingList
import dev.esgarpe.nfcompra.core.database.NfCompraDatabase
import dev.esgarpe.nfcompra.core.network.NetworkClient
import dev.esgarpe.nfcompra.core.network.SessionTokens
import dev.esgarpe.nfcompra.core.network.SessionSnapshot
import dev.esgarpe.nfcompra.core.network.TokenStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withTimeout
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@RunWith(RobolectricTestRunner::class)
@OptIn(ExperimentalCoroutinesApi::class)
class AccountShoppingSessionTest {
    private lateinit var server: MockWebServer
    private lateinit var databaseA: NfCompraDatabase
    private lateinit var databaseB: NfCompraDatabase

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        server = MockWebServer()
        server.start()
        databaseA = inMemoryDatabase()
        databaseB = inMemoryDatabase()
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
        databaseA.close()
        databaseB.close()
        server.shutdown()
    }

    @Test
    fun `closing account A cancels its delayed load persistence and collector before account B starts`() = runBlocking {
        enqueueLoad("a", "Casa A", "Compra A", "Producto A")
        server.enqueue(
            json(householdsJson("a", "Casa A tardía"))
                .setBodyDelay(500, TimeUnit.MILLISECONDS),
        )
        enqueueLoad("b", "Casa B", "Compra B", "Producto B")
        val tokens = MutableAccountTokenStore(SessionTokens("access-a", "refresh-a"))
        var databaseAReleased = false
        val sessionA = session(databaseA, tokens) { databaseAReleased = true }

        sessionA.viewModel.load()
        val loadedA = withTimeout(5_000) {
            sessionA.viewModel.state.first { it is ShoppingListViewState.Data }
        } as ShoppingListViewState.Data
        sessionA.viewModel.openContext("home-a", "list-a")
        withTimeout(5_000) {
            while (server.requestCount < 4) delay(10)
        }

        tokens.clear()
        sessionA.close()
        tokens.save(SessionTokens("access-b", "refresh-b"))
        val frozenA = sessionA.viewModel.state.value
        val sessionB = session(databaseB, tokens)
        sessionB.viewModel.load()
        val loadedB = withTimeout(5_000) {
            sessionB.viewModel.state.first {
                it is ShoppingListViewState.Data && it.selectedHouseholdId == "home-b"
            }
        } as ShoppingListViewState.Data
        delay(700)

        databaseA.shoppingDao().replaceItems(
            "list-a",
            listOf(item("late-local", "list-a", "No debe llegar al collector")),
        )
        delay(100)

        assertEquals("Producto A", loadedA.content.pending.single().name)
        assertEquals("Producto B", loadedB.content.pending.single().name)
        assertTrue(databaseAReleased)
        assertEquals("Casa A", databaseA.shoppingDao().households().single().name)
        assertEquals(frozenA, sessionA.viewModel.state.value)
        assertEquals(7, server.requestCount)
        val requests = List(7) { server.takeRequest(1, TimeUnit.SECONDS)!! }
        assertTrue(requests.take(4).all { it.getHeader("Authorization") == "Bearer access-a" })
        assertTrue(requests.drop(4).all { it.getHeader("Authorization") == "Bearer access-b" })
        sessionB.close()
    }

    @Test
    fun `cold launch renders the Room snapshot while the network refresh is still delayed`() = runBlocking {
        databaseA.shoppingDao().replaceServerSnapshot(
            households = listOf(household("Casa guardada")),
            lists = listOf(shoppingList("Compra guardada")),
            items = listOf(item("cached-item", "list-1", "Leche guardada")),
        )
        val refreshStarted = CountDownLatch(1)
        val releaseRefresh = CountDownLatch(1)
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse = when (request.path) {
                "/v1/households" -> {
                    refreshStarted.countDown()
                    releaseRefresh.await(5, TimeUnit.SECONDS)
                    json(householdsJson("1", "Casa remota"))
                }
                "/v1/households/home-1/lists" -> json(
                    """{"lists":[{"id":"list-1","householdId":"home-1","name":"Compra remota","isDefault":true,"version":2,"createdAt":"2026-07-28T00:00:00Z","updatedAt":"2026-07-28T00:01:00Z"}]}""",
                )
                "/v1/lists/list-1/items" -> json(
                    """{"items":[{"id":"remote-item","listId":"list-1","name":"Pan remoto","normalizedName":"pan remoto","quantity":1,"unit":null,"category":null,"note":null,"isChecked":false,"position":0,"version":1,"createdBy":"user-1","updatedBy":"user-1","createdAt":"2026-07-28T00:00:00Z","updatedAt":"2026-07-28T00:00:00Z"}]}""",
                )
                else -> MockResponse().setResponseCode(404)
            }
        }
        val tokens = MutableAccountTokenStore(SessionTokens("access", "refresh"))
        val session = session(databaseA, tokens)
        try {
            session.viewModel.load()

            val cached = withTimeout(2_000) {
                session.viewModel.state.first { it is ShoppingListViewState.Data }
            } as ShoppingListViewState.Data
            assertEquals("Compra guardada", cached.content.title)
            assertEquals(listOf("Leche guardada"), cached.content.pending.map { it.name })
            assertTrue(refreshStarted.await(1, TimeUnit.SECONDS))

            releaseRefresh.countDown()
            val refreshed = withTimeout(5_000) {
                session.viewModel.state.first {
                    it is ShoppingListViewState.Data &&
                        it.content.title == "Compra remota" &&
                        it.content.pending.singleOrNull()?.name == "Pan remoto"
                }
            } as ShoppingListViewState.Data
            assertEquals("Compra remota", refreshed.content.title)
        } finally {
            releaseRefresh.countDown()
            session.close()
        }
    }

    @Test
    fun `revoke cancels unique work after an in flight repository operation finishes scheduling`() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val workExecutor = Executors.newFixedThreadPool(2)
        val callerExecutor = Executors.newFixedThreadPool(2)
        val accountId = "account-${UUID.randomUUID()}"
        val scheduleStarted = CountDownLatch(1)
        val releaseSchedule = CountDownLatch(1)
        val finalCancelCalled = CountDownLatch(1)
        WorkManagerTestInitHelper.initializeTestWorkManager(
            context,
            Configuration.Builder().setExecutor(workExecutor).build(),
        )
        databaseA.shoppingDao().replaceServerSnapshot(
            households = listOf(household("Casa")),
            lists = listOf(shoppingList("Compra")),
            items = emptyList(),
        )
        val repository = OfflineShoppingRepository(
            api = NetworkClient.authenticatedApi(
                server.url("/").toString(),
                MutableAccountTokenStore(SessionTokens("access", "refresh")),
                ShoppingListApi::class.java,
            ),
            dao = databaseA.shoppingDao(),
            scheduleSync = {
                scheduleStarted.countDown()
                releaseSchedule.await(2, TimeUnit.SECONDS)
                SyncWorker.enqueue(context, accountId, server.url("/").toString())
            },
        )
        val session = AccountShoppingSession(
            repository = repository,
            revokeSync = {
                revokeShoppingAccount(context, accountId)
                finalCancelCalled.countDown()
            },
        )

        try {
            val mutation = callerExecutor.submit {
                runCatching { runBlocking { repository.createItem("list-1", "Pan") } }
            }
            assertTrue(scheduleStarted.await(2, TimeUnit.SECONDS))
            val revoke = callerExecutor.submit { session.revoke() }

            finalCancelCalled.await(200, TimeUnit.MILLISECONDS)
            releaseSchedule.countDown()
            mutation.get(2, TimeUnit.SECONDS)
            revoke.get(2, TimeUnit.SECONDS)

            val terminal = awaitUniqueWork(context, accountId)
            assertEquals(0, finalCancelCalled.count)
            assertTrue(terminal.isNotEmpty())
            assertTrue(terminal.all { it.state == WorkInfo.State.CANCELLED })
        } finally {
            releaseSchedule.countDown()
            WorkManager.getInstance(context)
                .cancelUniqueWork(SyncWorker.uniqueWorkName(accountId))
                .result.get(2, TimeUnit.SECONDS)
            callerExecutor.shutdownNow()
            workExecutor.shutdownNow()
        }
    }

    private fun session(
        database: NfCompraDatabase,
        tokens: TokenStore,
        releaseDatabase: () -> Unit = {},
    ): AccountShoppingSession {
        val api = NetworkClient.authenticatedApi(
            server.url("/").toString(),
            tokens,
            ShoppingListApi::class.java,
        )
        return AccountShoppingSession(
            OfflineShoppingRepository(
                api = api,
                dao = database.shoppingDao(),
                closeDatabase = releaseDatabase,
            ),
        )
    }

    private fun enqueueLoad(account: String, householdName: String, listName: String, itemName: String) {
        server.enqueue(json(householdsJson(account, householdName)))
        server.enqueue(
            json(
                """
                {"lists":[{"id":"list-$account","householdId":"home-$account","name":"$listName","isDefault":true,"version":1,"createdAt":"2026-07-28T00:00:00Z","updatedAt":"2026-07-28T00:00:00Z"}]}
                """.trimIndent(),
            ),
        )
        server.enqueue(
            json(
                """
                {"items":[{"id":"item-$account","listId":"list-$account","name":"$itemName","normalizedName":"producto","quantity":1,"unit":null,"category":null,"note":null,"isChecked":false,"position":0,"version":1,"createdBy":"user-$account","updatedBy":"user-$account","createdAt":"2026-07-28T00:00:00Z","updatedAt":"2026-07-28T00:00:00Z"}]}
                """.trimIndent(),
            ),
        )
    }

    private fun householdsJson(account: String, name: String) =
        """
        {"households":[{"id":"home-$account","name":"$name","ownerId":"user-$account","createdAt":"2026-07-28T00:00:00Z","updatedAt":"2026-07-28T00:00:00Z"}]}
        """.trimIndent()

    private fun item(id: String, listId: String, name: String) = LocalShoppingItem(
        id = id,
        listId = listId,
        name = name,
        normalizedName = name.lowercase(),
        quantity = 1.0,
        unit = null,
        category = null,
        note = null,
        isChecked = false,
        position = 0,
        version = 1,
        createdBy = "test",
        updatedBy = "test",
        createdAt = "2026-07-28T00:00:00Z",
        updatedAt = "2026-07-28T00:00:00Z",
    )

    private fun household(name: String) = LocalHousehold(
        id = "home-1",
        name = name,
        ownerId = "user-1",
        createdAt = "2026-07-28T00:00:00Z",
        updatedAt = "2026-07-28T00:00:00Z",
    )

    private fun shoppingList(name: String) = LocalShoppingList(
        id = "list-1",
        householdId = "home-1",
        name = name,
        isDefault = true,
        version = 1,
        createdAt = "2026-07-28T00:00:00Z",
        updatedAt = "2026-07-28T00:00:00Z",
    )

    private fun inMemoryDatabase() = Room.inMemoryDatabaseBuilder(
        ApplicationProvider.getApplicationContext<Context>(),
        NfCompraDatabase::class.java,
    ).allowMainThreadQueries().build()

    private fun json(body: String) =
        MockResponse()
            .setResponseCode(200)
            .setHeader("content-type", "application/json")
            .setBody(body)

    private fun awaitUniqueWork(context: Context, accountId: String): List<WorkInfo> {
        val workManager = WorkManager.getInstance(context)
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2)
        var latest = emptyList<WorkInfo>()
        while (System.nanoTime() < deadline) {
            latest = workManager
                .getWorkInfosForUniqueWork(SyncWorker.uniqueWorkName(accountId))
                .get(2, TimeUnit.SECONDS)
            if (latest.isNotEmpty() && latest.all { it.state.isFinished }) return latest
            Thread.yield()
        }
        return latest
    }
}

private class MutableAccountTokenStore(initial: SessionTokens) : TokenStore {
    override val session = MutableStateFlow<SessionTokens?>(initial)
    private var identity = 1L
    override fun current() = session.value
    override fun generation() = identity
    override fun snapshot() = session.value?.let { SessionSnapshot(identity, it) }
    override suspend fun read() = session.value
    override suspend fun save(tokens: SessionTokens) {
        identity++
        session.value = tokens
    }
    override suspend fun clear() {
        identity++
        session.value = null
    }
    override suspend fun compareAndStart(expectedGeneration: Long, tokens: SessionTokens): Boolean {
        if (identity != expectedGeneration) return false
        identity++
        session.value = tokens
        return true
    }
    override suspend fun compareAndSave(expected: SessionSnapshot, tokens: SessionTokens): Boolean {
        if (snapshot() != expected) return false
        session.value = tokens
        return true
    }
    override suspend fun compareAndClear(expected: SessionSnapshot): Boolean {
        if (snapshot() != expected) return false
        identity++
        session.value = null
        return true
    }
}

package dev.esgarpe.nfcompra.feature.shoppinglist

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import dev.esgarpe.nfcompra.core.database.LocalShoppingItem
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
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
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

    private fun inMemoryDatabase() = Room.inMemoryDatabaseBuilder(
        ApplicationProvider.getApplicationContext<Context>(),
        NfCompraDatabase::class.java,
    ).allowMainThreadQueries().build()

    private fun json(body: String) =
        MockResponse()
            .setResponseCode(200)
            .setHeader("content-type", "application/json")
            .setBody(body)
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

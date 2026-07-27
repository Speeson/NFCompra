package dev.esgarpe.nfcompra.feature.auth

import app.cash.turbine.test
import dev.esgarpe.nfcompra.core.network.NetworkClient
import dev.esgarpe.nfcompra.core.network.SessionTokens
import dev.esgarpe.nfcompra.core.network.TokenStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import okhttp3.Request
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

class AuthRepositoryTest {
    @Test
    fun `login saves Android access and refresh tokens`() = runTest {
        val server = MockWebServer()
        server.enqueue(
            MockResponse().setResponseCode(200).setBody(
                """{"accessToken":"access-token","refreshToken":"refresh-token"}""",
            ),
        )
        server.start()
        try {
            val store = FakeTokenStore()
            val repository = AuthRepository(
                api = NetworkClient.authApi(server.url("/").toString()),
                tokenStore = store,
            )

            repository.login("ana@example.test", "a secure password").test {
                assertEquals(AuthResult.SignedIn, awaitItem())
                awaitComplete()
            }

            assertEquals(SessionTokens("access-token", "refresh-token"), store.tokens)
            val request = server.takeRequest()
            assertEquals("/v1/auth/login", request.path)
            assertEquals(
                """{"email":"ana@example.test","password":"a secure password","clientType":"android"}""",
                request.body.readUtf8(),
            )
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun `an unauthorized retry refreshes the session once only`() {
        val server = MockWebServer()
        var protectedRequests = 0
        var refreshRequests = 0
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse = when (request.path) {
                "/v1/auth/refresh" -> {
                    refreshRequests++
                    MockResponse().setBody("""{"accessToken":"new-access","refreshToken":"new-refresh"}""")
                }
                else -> {
                    protectedRequests++
                    MockResponse().setResponseCode(401)
                }
            }
        }
        server.start()
        try {
            val store = FakeTokenStore().apply { tokens = SessionTokens("expired-access", "refresh-token") }
            val client = NetworkClient.authenticatedClient(server.url("/").toString(), store)

            client.newCall(Request.Builder().url(server.url("/v1/protected")).build()).execute().use { response ->
                assertEquals(401, response.code)
            }

            assertEquals(1, refreshRequests)
            assertEquals(2, protectedRequests)
            assertEquals(SessionTokens("new-access", "new-refresh"), store.tokens)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun `concurrent unauthorized requests share one refresh result`() {
        val server = MockWebServer()
        val initialRequests = CountDownLatch(2)
        val protectedRequests = AtomicInteger()
        val refreshRequests = AtomicInteger()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse = when (request.path) {
                "/v1/auth/refresh" -> {
                    refreshRequests.incrementAndGet()
                    MockResponse().setBody("""{"accessToken":"new-access","refreshToken":"new-refresh"}""")
                }
                else -> {
                    protectedRequests.incrementAndGet()
                    if (request.getHeader("X-NFCompra-Refresh-Attempt") != null) {
                        MockResponse().setBody("ok")
                    } else {
                        initialRequests.countDown()
                        assertTrue(initialRequests.await(5, TimeUnit.SECONDS))
                        MockResponse().setResponseCode(401)
                    }
                }
            }
        }
        server.start()
        val executor = Executors.newFixedThreadPool(2)
        try {
            val store = FakeTokenStore().apply { tokens = SessionTokens("expired-access", "refresh-token") }
            val client = NetworkClient.authenticatedClient(server.url("/").toString(), store)
            val responses = List(2) {
                executor.submit<Int> {
                    client.newCall(Request.Builder().url(server.url("/v1/protected")).build()).execute().use { it.code }
                }
            }.map { it.get(10, TimeUnit.SECONDS) }

            assertEquals(listOf(200, 200), responses)
            assertEquals(1, refreshRequests.get())
            assertEquals(4, protectedRequests.get())
            assertEquals(SessionTokens("new-access", "new-refresh"), store.tokens)
        } finally {
            executor.shutdownNow()
            server.shutdown()
        }
    }

    @Test
    fun `a delayed old bearer 401 reuses the newer session without refreshing again`() {
        val server = MockWebServer()
        val firstOldRequest = CountDownLatch(1)
        val secondOldRequest = CountDownLatch(1)
        val newTokenSaved = CountDownLatch(1)
        val oldRequests = AtomicInteger()
        val refreshRequests = AtomicInteger()
        val store = FakeTokenStore().apply {
            tokens = SessionTokens("old-access", "old-refresh")
            onSave = { saved ->
                if (saved == SessionTokens("new-access", "new-refresh")) newTokenSaved.countDown()
            }
        }
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse = when (request.path) {
                "/v1/auth/refresh" -> {
                    refreshRequests.incrementAndGet()
                    assertTrue(secondOldRequest.await(5, TimeUnit.SECONDS))
                    MockResponse().setBody("""{"accessToken":"new-access","refreshToken":"new-refresh"}""")
                }
                else -> when (request.getHeader("Authorization")) {
                    "Bearer old-access" -> when (oldRequests.incrementAndGet()) {
                        1 -> {
                            firstOldRequest.countDown()
                            MockResponse().setResponseCode(401)
                        }
                        2 -> {
                            secondOldRequest.countDown()
                            assertTrue(newTokenSaved.await(5, TimeUnit.SECONDS))
                            MockResponse().setResponseCode(401)
                        }
                        else -> throw AssertionError("Unexpected old-token retry")
                    }
                    "Bearer new-access" -> MockResponse().setBody("ok")
                    else -> throw AssertionError("Unexpected authorization header: ${request.getHeader("Authorization")}")
                }
            }
        }
        server.start()
        val executor = Executors.newFixedThreadPool(2)
        try {
            val client = NetworkClient.authenticatedClient(server.url("/").toString(), store)
            val first = executor.submit<Int> {
                client.newCall(Request.Builder().url(server.url("/v1/protected")).build()).execute().use { it.code }
            }
            assertTrue(firstOldRequest.await(5, TimeUnit.SECONDS))
            val second = executor.submit<Int> {
                client.newCall(Request.Builder().url(server.url("/v1/protected")).build()).execute().use { it.code }
            }

            assertEquals(200, first.get(10, TimeUnit.SECONDS))
            assertEquals(200, second.get(10, TimeUnit.SECONDS))
            assertEquals(1, refreshRequests.get())
            assertEquals(SessionTokens("new-access", "new-refresh"), store.tokens)
        } finally {
            executor.shutdownNow()
            server.shutdown()
        }
    }

    @Test
    fun `refresh failure does not clear a newer session`() {
        val server = MockWebServer()
        val store = FakeTokenStore().apply { tokens = SessionTokens("old-access", "old-refresh") }
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse = when (request.path) {
                "/v1/auth/refresh" -> {
                    store.tokens = SessionTokens("newer-access", "newer-refresh")
                    MockResponse().setResponseCode(401)
                }
                else -> MockResponse().setResponseCode(401)
            }
        }
        server.start()
        try {
            val client = NetworkClient.authenticatedClient(server.url("/").toString(), store)

            client.newCall(Request.Builder().url(server.url("/v1/protected")).build()).execute().use { response ->
                assertEquals(401, response.code)
            }

            assertEquals(SessionTokens("newer-access", "newer-refresh"), store.tokens)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun `refresh failure publishes an anonymous observable session`() {
        val server = MockWebServer()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse = MockResponse().setResponseCode(401)
        }
        server.start()
        try {
            val store = FakeTokenStore().apply { tokens = SessionTokens("expired-access", "expired-refresh") }
            val client = NetworkClient.authenticatedClient(server.url("/").toString(), store)

            client.newCall(Request.Builder().url(server.url("/v1/protected")).build()).execute().use { response ->
                assertEquals(401, response.code)
            }

            assertNull(store.session.value)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun `atomic cleanup cannot erase tokens saved after failure handling starts`() {
        val cleanupStarted = CountDownLatch(1)
        val allowCleanup = CountDownLatch(1)
        val saveStarted = CountDownLatch(1)
        val store = PausingTokenStore(
            initial = SessionTokens("old-access", "old-refresh"),
            cleanupStarted = cleanupStarted,
            allowCleanup = allowCleanup,
            saveStarted = saveStarted,
        )
        val server = MockWebServer()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse =
                if (request.path == "/v1/auth/refresh") MockResponse().setResponseCode(401)
                else MockResponse().setResponseCode(401)
        }
        server.start()
        val executor = Executors.newFixedThreadPool(2)
        try {
            val client = NetworkClient.authenticatedClient(server.url("/").toString(), store)
            val failedRequest = executor.submit<Int> {
                client.newCall(Request.Builder().url(server.url("/v1/protected")).build()).execute().use { it.code }
            }
            assertTrue(cleanupStarted.await(5, TimeUnit.SECONDS))
            val newerTokens = SessionTokens("newer-access", "newer-refresh")
            val concurrentSave = executor.submit<Unit> {
                runBlocking { store.save(newerTokens) }
                Unit
            }
            assertTrue(saveStarted.await(5, TimeUnit.SECONDS))

            allowCleanup.countDown()

            assertEquals(401, failedRequest.get(10, TimeUnit.SECONDS))
            concurrentSave.get(10, TimeUnit.SECONDS)
            assertEquals(newerTokens, store.current())
        } finally {
            allowCleanup.countDown()
            executor.shutdownNow()
            server.shutdown()
        }
    }

    @Test
    fun `login reports storage failure without publishing a session`() = runTest {
        val server = MockWebServer()
        server.enqueue(MockResponse().setBody("""{"accessToken":"access-token","refreshToken":"refresh-token"}"""))
        server.start()
        try {
            val store = FailingTokenStore()
            val repository = AuthRepository(NetworkClient.authApi(server.url("/").toString()), store)

            repository.login("ana@example.test", "a secure password").test {
                assertTrue(awaitItem() is AuthResult.Failure)
                awaitComplete()
            }

            assertNull(store.current())
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun `logout revokes the Android refresh token and publishes an anonymous session`() = runTest {
        val server = MockWebServer()
        server.enqueue(MockResponse().setBody("""{"status":"logged_out"}"""))
        server.start()
        try {
            val store = FakeTokenStore().apply { tokens = SessionTokens("access-token", "refresh-token") }
            val repository = AuthRepository(NetworkClient.authApi(server.url("/").toString()), store)

            repository.logout()

            assertNull(store.session.value)
            val request = server.takeRequest()
            assertEquals("/v1/auth/logout", request.path)
            assertEquals(
                """{"clientType":"android","refreshToken":"refresh-token"}""",
                request.body.readUtf8(),
            )
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun `logout publishes an anonymous session even when remote revocation fails`() = runTest {
        val server = MockWebServer()
        server.enqueue(MockResponse().setResponseCode(503))
        server.start()
        try {
            val store = FakeTokenStore().apply { tokens = SessionTokens("access-token", "refresh-token") }
            val repository = AuthRepository(NetworkClient.authApi(server.url("/").toString()), store)

            runCatching { repository.logout() }

            assertNull(store.session.value)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun `resend verification retries delivery for the registered email`() = runTest {
        val server = MockWebServer()
        server.enqueue(MockResponse().setResponseCode(202).setBody("""{"status":"accepted"}"""))
        server.start()
        try {
            val repository = AuthRepository(NetworkClient.authApi(server.url("/").toString()), FakeTokenStore())

            repository.resendVerification("ana@example.test").test {
                assertEquals(AuthResult.Success("Hemos vuelto a enviar el correo de verificación."), awaitItem())
                awaitComplete()
            }

            val request = server.takeRequest()
            assertEquals("/v1/auth/resend-verification", request.path)
            assertEquals("""{"email":"ana@example.test"}""", request.body.readUtf8())
        } finally {
            server.shutdown()
        }
    }

    private class FakeTokenStore : TokenStore {
        private val mutableSession = MutableStateFlow<SessionTokens?>(null)
        override val session: StateFlow<SessionTokens?> = mutableSession
        var tokens: SessionTokens?
            get() = mutableSession.value
            set(value) { mutableSession.value = value }
        var onSave: ((SessionTokens) -> Unit)? = null

        override fun current(): SessionTokens? = tokens

        override suspend fun read(): SessionTokens? = tokens

        override suspend fun save(tokens: SessionTokens) {
            this.tokens = tokens
            onSave?.invoke(tokens)
        }

        override suspend fun clear() {
            tokens = null
        }

        override suspend fun compareAndClear(expected: SessionTokens): Boolean =
            if (tokens == expected) {
                tokens = null
                true
            } else {
                false
            }
    }

    private class FailingTokenStore : TokenStore {
        override val session = MutableStateFlow<SessionTokens?>(null)
        override fun current(): SessionTokens? = null
        override suspend fun read(): SessionTokens? = null
        override suspend fun save(tokens: SessionTokens): Nothing = throw IOException("disk full")
        override suspend fun clear() = Unit
        override suspend fun compareAndClear(expected: SessionTokens) = false
    }

    private class PausingTokenStore(
        initial: SessionTokens,
        private val cleanupStarted: CountDownLatch,
        private val allowCleanup: CountDownLatch,
        private val saveStarted: CountDownLatch,
    ) : TokenStore {
        private val lock = Any()
        private val mutableSession = MutableStateFlow<SessionTokens?>(initial)
        override val session: StateFlow<SessionTokens?> = mutableSession
        private var tokens: SessionTokens?
            get() = mutableSession.value
            set(value) { mutableSession.value = value }

        override fun current(): SessionTokens? = synchronized(lock) { tokens }
        override suspend fun read(): SessionTokens? = current()

        override suspend fun save(tokens: SessionTokens) {
            saveStarted.countDown()
            synchronized(lock) { this.tokens = tokens }
        }

        override suspend fun clear() {
            synchronized(lock) { tokens = null }
        }

        override suspend fun compareAndClear(expected: SessionTokens): Boolean = synchronized(lock) {
            cleanupStarted.countDown()
            assertTrue(allowCleanup.await(5, TimeUnit.SECONDS))
            if (tokens != expected) return@synchronized false
            tokens = null
            true
        }
    }
}

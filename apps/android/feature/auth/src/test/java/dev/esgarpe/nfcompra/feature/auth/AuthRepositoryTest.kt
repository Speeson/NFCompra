package dev.esgarpe.nfcompra.feature.auth

import app.cash.turbine.test
import dev.esgarpe.nfcompra.core.network.NetworkClient
import dev.esgarpe.nfcompra.core.network.SessionSnapshot
import dev.esgarpe.nfcompra.core.network.SessionTokens
import dev.esgarpe.nfcompra.core.network.TokenStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.single
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import okhttp3.Request
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import okhttp3.mockwebserver.SocketPolicy
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
    fun `register sends the extended account fields expected by the API`() = runTest {
        val server = MockWebServer()
        server.enqueue(MockResponse().setResponseCode(201).setBody("""{"user":{"id":"user-1"}}"""))
        server.start()
        try {
            val repository = AuthRepository(NetworkClient.authApi(server.url("/").toString()), FakeTokenStore())

            repository.register(
                firstName = "Esteban",
                lastName = "García Pérez",
                birthDate = "1995-04-23",
                username = "Spee",
                email = "esteban@example.test",
                password = "a secure password",
            ).test {
                assertEquals(AuthResult.Success("Te hemos enviado un enlace de verificación."), awaitItem())
                awaitComplete()
            }

            val request = server.takeRequest()
            assertEquals("/v1/auth/register", request.path)
            assertEquals(
                """{"firstName":"Esteban","lastName":"García Pérez","birthDate":"1995-04-23","username":"Spee","email":"esteban@example.test","password":"a secure password"}""",
                request.body.readUtf8(),
            )
        } finally {
            server.shutdown()
        }
    }

    @Test
    @OptIn(ExperimentalCoroutinesApi::class)
    fun `register success exposes verification dialog state without signing in`() = runTest {
        Dispatchers.setMain(UnconfinedTestDispatcher(testScheduler))
        val server = MockWebServer()
        server.enqueue(MockResponse().setResponseCode(201).setBody("""{"user":{"id":"user-1"}}"""))
        server.start()
        try {
            val repository = AuthRepository(NetworkClient.authApi(server.url("/").toString()), FakeTokenStore())
            val viewModel = AuthViewModel(repository)

            viewModel.state.test {
                assertEquals(AuthUiState(), awaitItem())
                viewModel.register(
                    firstName = "Esteban",
                    lastName = "Garcia",
                    birthDate = "1995-04-23",
                    username = "Spee",
                    email = " esteban@example.test ",
                    password = "a secure password",
                )
                assertTrue(awaitItem().isSubmitting)
                val result = awaitItem()
                assertEquals("esteban@example.test", result.registrationSuccessEmail)
                assertNull(result.message)
                assertEquals(false, result.isSignedIn)
                cancelAndIgnoreRemainingEvents()
            }
        } finally {
            server.shutdown()
            Dispatchers.resetMain()
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
    fun `a delayed login cannot replace the session established by a newer login`() {
        val server = MockWebServer()
        val firstLoginStarted = CountDownLatch(1)
        val allowFirstLogin = CountDownLatch(1)
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val body = request.body.readUtf8()
                return if (body.contains("a@example.test")) {
                    firstLoginStarted.countDown()
                    assertTrue(allowFirstLogin.await(5, TimeUnit.SECONDS))
                    MockResponse().setBody("""{"accessToken":"access-a","refreshToken":"refresh-a"}""")
                } else {
                    MockResponse().setBody("""{"accessToken":"access-b","refreshToken":"refresh-b"}""")
                }
            }
        }
        server.start()
        val executor = Executors.newFixedThreadPool(2)
        try {
            val store = FakeTokenStore()
            val repository = AuthRepository(NetworkClient.authApi(server.url("/").toString()), store)
            val delayedA = executor.submit<AuthResult> {
                runBlocking { repository.login("a@example.test", "password A").single() }
            }
            assertTrue(firstLoginStarted.await(5, TimeUnit.SECONDS))

            val resultB = runBlocking { repository.login("b@example.test", "password B").single() }
            allowFirstLogin.countDown()
            val resultA = delayedA.get(10, TimeUnit.SECONDS)

            assertEquals(AuthResult.SignedIn, resultB)
            assertTrue(resultA is AuthResult.Failure)
            assertEquals(SessionTokens("access-b", "refresh-b"), store.tokens)
        } finally {
            allowFirstLogin.countDown()
            executor.shutdownNow()
            server.shutdown()
        }
    }

    @Test
    fun `login storage failure cannot clear a session saved concurrently`() = runTest {
        val server = MockWebServer()
        server.enqueue(MockResponse().setBody("""{"accessToken":"access-a","refreshToken":"refresh-a"}"""))
        server.start()
        try {
            val store = FakeTokenStore()
            val accountB = SessionTokens("access-b", "refresh-b")
            store.onSave = { saved ->
                if (saved.accessToken == "access-a") {
                    store.tokens = accountB
                    throw IOException("disk full")
                }
            }
            val repository = AuthRepository(NetworkClient.authApi(server.url("/").toString()), store)

            val result = repository.login("a@example.test", "password A").single()

            assertTrue(result is AuthResult.Failure)
            assertEquals(accountB, store.tokens)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun `delayed account A 401 and refresh cannot use or replace account B session`() {
        val server = MockWebServer()
        val refreshStarted = CountDownLatch(1)
        val allowRefreshResponse = CountDownLatch(1)
        val lateRequestStarted = CountDownLatch(1)
        val accountSwitched = CountDownLatch(1)
        val protectedHeaders = mutableListOf<Pair<String, String?>>()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse = when (request.path) {
                "/v1/auth/refresh" -> {
                    refreshStarted.countDown()
                    assertTrue(allowRefreshResponse.await(5, TimeUnit.SECONDS))
                    MockResponse().setBody("""{"accessToken":"refreshed-a","refreshToken":"refreshed-refresh-a"}""")
                }
                "/v1/refreshing" -> {
                    synchronized(protectedHeaders) {
                        protectedHeaders += request.path!! to request.getHeader("Authorization")
                    }
                    if (request.getHeader("X-NFCompra-Refresh-Attempt") == null) {
                        MockResponse().setResponseCode(401)
                    } else {
                        MockResponse().setBody("unexpected retry")
                    }
                }
                "/v1/late-401" -> {
                    synchronized(protectedHeaders) {
                        protectedHeaders += request.path!! to request.getHeader("Authorization")
                    }
                    if (request.getHeader("X-NFCompra-Refresh-Attempt") == null) {
                        lateRequestStarted.countDown()
                        assertTrue(accountSwitched.await(5, TimeUnit.SECONDS))
                        MockResponse().setResponseCode(401)
                    } else {
                        MockResponse().setBody("unexpected retry")
                    }
                }
                else -> throw AssertionError("Unexpected path: ${request.path}")
            }
        }
        server.start()
        val executor = Executors.newFixedThreadPool(2)
        try {
            val store = FakeTokenStore().apply {
                tokens = SessionTokens("access-a", "refresh-a")
            }
            val refreshingClient = NetworkClient.authenticatedClient(server.url("/").toString(), store)
            val lateClient = NetworkClient.authenticatedClient(server.url("/").toString(), store)
            val refreshingRequest = executor.submit<Int> {
                refreshingClient.newCall(Request.Builder().url(server.url("/v1/refreshing")).build())
                    .execute().use { it.code }
            }
            assertTrue(refreshStarted.await(5, TimeUnit.SECONDS))
            val lateRequest = executor.submit<Int> {
                lateClient.newCall(Request.Builder().url(server.url("/v1/late-401")).build())
                    .execute().use { it.code }
            }
            assertTrue(lateRequestStarted.await(5, TimeUnit.SECONDS))

            runBlocking {
                store.clear()
                store.save(SessionTokens("access-b", "refresh-b"))
            }
            accountSwitched.countDown()

            assertEquals(401, lateRequest.get(10, TimeUnit.SECONDS))
            allowRefreshResponse.countDown()
            assertEquals(401, refreshingRequest.get(10, TimeUnit.SECONDS))
            assertEquals(SessionTokens("access-b", "refresh-b"), store.tokens)
            assertEquals(
                listOf(
                    "/v1/refreshing" to "Bearer access-a",
                    "/v1/late-401" to "Bearer access-a",
                ),
                synchronized(protectedHeaders) { protectedHeaders.toList() },
            )
        } finally {
            accountSwitched.countDown()
            allowRefreshResponse.countDown()
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
    fun `auto sign in refresh keeps the session on transient server failures`() = runTest {
        val server = MockWebServer()
        server.enqueue(MockResponse().setResponseCode(503))
        server.start()
        try {
            val tokens = SessionTokens("expired-access", "refresh-still-valid")
            val store = FakeTokenStore().apply { this.tokens = tokens }
            val repository = AuthRepository(NetworkClient.authApi(server.url("/").toString()), store)

            val result = repository.refresh()

            assertTrue(result is AuthResult.Failure)
            assertEquals(tokens, store.tokens)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun `auto sign in refresh clears the session when the refresh token is unauthorized`() = runTest {
        val server = MockWebServer()
        server.enqueue(MockResponse().setResponseCode(401))
        server.start()
        try {
            val store = FakeTokenStore().apply { tokens = SessionTokens("expired-access", "expired-refresh") }
            val repository = AuthRepository(NetworkClient.authApi(server.url("/").toString()), store)

            val result = repository.refresh()

            assertTrue(result is AuthResult.Failure)
            assertNull(store.tokens)
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

    @Test
    fun `reset password with OTP sends email code and replacement password`() = runTest {
        val server = MockWebServer()
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"status":"password_reset"}"""))
        server.start()
        try {
            val repository = AuthRepository(NetworkClient.authApi(server.url("/").toString()), FakeTokenStore())

            repository.resetPasswordWithOtp("ana@example.test", "123456", "a replacement password").test {
                assertEquals(AuthResult.Success("Contraseña restablecida. Ya puedes iniciar sesión."), awaitItem())
                awaitComplete()
            }

            val request = server.takeRequest()
            assertEquals("/v1/auth/reset-password", request.path)
            assertEquals(
                """{"email":"ana@example.test","otp":"123456","password":"a replacement password"}""",
                request.body.readUtf8(),
            )
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun `verify password reset OTP sends email and code before navigation`() = runTest {
        val server = MockWebServer()
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"status":"otp_verified"}"""))
        server.start()
        try {
            val repository = AuthRepository(NetworkClient.authApi(server.url("/").toString()), FakeTokenStore())

            repository.verifyPasswordResetOtp("ana@example.test", "123456").test {
                assertEquals(AuthResult.Success("Código verificado."), awaitItem())
                awaitComplete()
            }

            val request = server.takeRequest()
            assertEquals("/v1/auth/verify-password-reset-otp", request.path)
            assertEquals(
                """{"email":"ana@example.test","otp":"123456"}""",
                request.body.readUtf8(),
            )
        } finally {
            server.shutdown()
        }
    }

    private class FakeTokenStore : TokenStore {
        private val lock = Any()
        private val mutableSession = MutableStateFlow<SessionTokens?>(null)
        override val session: StateFlow<SessionTokens?> = mutableSession
        private var identity = 0L
        var tokens: SessionTokens?
            get() = synchronized(lock) { mutableSession.value }
            set(value) {
                synchronized(lock) {
                    identity++
                    mutableSession.value = value
                }
            }
        var onSave: ((SessionTokens) -> Unit)? = null

        override fun current(): SessionTokens? = tokens
        override fun generation(): Long = synchronized(lock) { identity }
        override fun snapshot(): SessionSnapshot? = synchronized(lock) {
            mutableSession.value?.let { SessionSnapshot(identity, it) }
        }

        override suspend fun read(): SessionTokens? = tokens

        override suspend fun save(tokens: SessionTokens) {
            this.tokens = tokens
            onSave?.invoke(tokens)
        }

        override suspend fun clear() {
            tokens = null
        }

        override suspend fun compareAndStart(expectedGeneration: Long, tokens: SessionTokens): Boolean =
            synchronized(lock) {
                if (identity != expectedGeneration) return@synchronized false
                identity++
                mutableSession.value = tokens
                onSave?.invoke(tokens)
                true
            }

        override suspend fun compareAndSave(expected: SessionSnapshot, tokens: SessionTokens): Boolean =
            synchronized(lock) {
                if (identity != expected.identity || mutableSession.value != expected.tokens) return@synchronized false
                mutableSession.value = tokens
                onSave?.invoke(tokens)
                true
            }

        override suspend fun compareAndClear(expected: SessionSnapshot): Boolean = synchronized(lock) {
            if (identity != expected.identity || mutableSession.value != expected.tokens) {
                false
            } else {
                identity++
                mutableSession.value = null
                true
            }
        }
    }

    @Test
    fun `a transient refresh disconnect keeps the observable session and its offline queue owner`() {
        val server = MockWebServer()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse =
                if (request.path == "/v1/auth/refresh") {
                    MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START)
                } else {
                    MockResponse().setResponseCode(401)
                }
        }
        server.start()
        try {
            val tokens = SessionTokens("expired-access", "refresh-still-valid")
            val store = FakeTokenStore().apply { this.tokens = tokens }
            val client = NetworkClient.authenticatedClient(server.url("/").toString(), store)

            client.newCall(Request.Builder().url(server.url("/v1/protected")).build()).execute().use { response ->
                assertEquals(401, response.code)
            }

            assertEquals(tokens, store.session.value)
        } finally {
            server.shutdown()
        }
    }

    private class FailingTokenStore : TokenStore {
        override val session = MutableStateFlow<SessionTokens?>(null)
        override fun current(): SessionTokens? = null
        override fun generation() = 0L
        override fun snapshot(): SessionSnapshot? = null
        override suspend fun read(): SessionTokens? = null
        override suspend fun save(tokens: SessionTokens): Nothing = throw IOException("disk full")
        override suspend fun clear() = Unit
        override suspend fun compareAndStart(expectedGeneration: Long, tokens: SessionTokens): Nothing =
            throw IOException("disk full")
        override suspend fun compareAndSave(expected: SessionSnapshot, tokens: SessionTokens) = false
        override suspend fun compareAndClear(expected: SessionSnapshot) = false
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
        private var identity = 1L
        private var tokens: SessionTokens?
            get() = mutableSession.value
            set(value) { mutableSession.value = value }

        override fun current(): SessionTokens? = synchronized(lock) { tokens }
        override fun generation(): Long = synchronized(lock) { identity }
        override fun snapshot(): SessionSnapshot? = synchronized(lock) {
            tokens?.let { SessionSnapshot(identity, it) }
        }
        override suspend fun read(): SessionTokens? = current()

        override suspend fun save(tokens: SessionTokens) {
            saveStarted.countDown()
            synchronized(lock) {
                identity++
                this.tokens = tokens
            }
        }

        override suspend fun clear() {
            synchronized(lock) {
                identity++
                tokens = null
            }
        }

        override suspend fun compareAndStart(expectedGeneration: Long, tokens: SessionTokens): Boolean = synchronized(lock) {
            if (identity != expectedGeneration) return@synchronized false
            identity++
            this.tokens = tokens
            true
        }

        override suspend fun compareAndSave(expected: SessionSnapshot, tokens: SessionTokens): Boolean = synchronized(lock) {
            if (identity != expected.identity || this.tokens != expected.tokens) return@synchronized false
            this.tokens = tokens
            true
        }

        override suspend fun compareAndClear(expected: SessionSnapshot): Boolean = synchronized(lock) {
            cleanupStarted.countDown()
            assertTrue(allowCleanup.await(5, TimeUnit.SECONDS))
            if (identity != expected.identity || tokens != expected.tokens) return@synchronized false
            identity++
            tokens = null
            true
        }
    }
}

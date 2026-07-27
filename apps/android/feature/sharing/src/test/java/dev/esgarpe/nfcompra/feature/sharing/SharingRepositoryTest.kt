package dev.esgarpe.nfcompra.feature.sharing

import dev.esgarpe.nfcompra.core.network.NetworkClient
import dev.esgarpe.nfcompra.core.network.SessionTokens
import dev.esgarpe.nfcompra.core.network.TokenStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.concurrent.TimeUnit

class SharingRepositoryTest {
    private val server = MockWebServer()
    @Before fun start() = server.start()
    @After fun stop() = server.shutdown()

    @Test fun `owner mutations send authenticated API requests and surface API errors`() = runTest {
        server.enqueue(json("{\"invitation\":{\"id\":\"invite-1\",\"householdId\":\"home-1\",\"email\":\"ana@example.com\",\"status\":\"pending\",\"expiresAt\":\"2026-08-01T00:00:00Z\",\"invitedBy\":\"owner\",\"createdAt\":\"2026-07-27T00:00:00Z\"}}", 201))
        server.enqueue(json("{\"status\":\"revoked\"}"))
        server.enqueue(json("{\"status\":\"removed\"}"))
        server.enqueue(json("{\"error\":{\"code\":\"INVITATION_REVOKED\",\"message\":\"La invitacion ha sido revocada.\",\"details\":{}}}", 400))
        val repo = SharingRepository(NetworkClient.authenticatedApi(server.url("/").toString(), TestTokenStore(), SharingApi::class.java))
        repo.invite("home-1", "ana@example.com")
        repo.revoke("home-1", "invite-1")
        repo.removeMember("home-1", "member-1")
        try { repo.accept("raw-token") } catch (error: SharingApiException) { assertEquals("INVITATION_REVOKED", error.code) }
        val requests = List(4) { server.takeRequest(1, TimeUnit.SECONDS) }
        assertEquals("Bearer access-token", requests.first()!!.getHeader("Authorization"))
        assertEquals("POST /v1/households/home-1/invitations", "${requests[0]!!.method} ${requests[0]!!.path}")
        assertTrue(requests[0]!!.body.readUtf8().contains("ana@example.com"))
        assertEquals("DELETE /v1/households/home-1/invitations/invite-1", "${requests[1]!!.method} ${requests[1]!!.path}")
        assertEquals("DELETE /v1/households/home-1/members/member-1", "${requests[2]!!.method} ${requests[2]!!.path}")
        assertEquals("POST /v1/invitations/accept", "${requests[3]!!.method} ${requests[3]!!.path}")
    }

    @Test fun `accept by notification and read operations use their safe API endpoints`() = runTest {
        server.enqueue(json("{\"invitation\":{\"id\":\"invite-1\",\"householdId\":\"home-1\",\"email\":\"ana@example.com\",\"status\":\"accepted\",\"expiresAt\":\"2026-08-01T00:00:00Z\",\"invitedBy\":\"owner\",\"createdAt\":\"2026-07-27T00:00:00Z\"},\"householdId\":\"home-1\"}"))
        repeat(2) { server.enqueue(json("{\"status\":\"read\"}")) }
        val repo = SharingRepository(NetworkClient.authenticatedApi(server.url("/").toString(), TestTokenStore(), SharingApi::class.java))
        repo.acceptById("invite-1"); repo.markRead("notice-1"); repo.markAllRead()
        val requests = List(3) { server.takeRequest(1, TimeUnit.SECONDS) }
        assertEquals("/v1/invitations/invite-1/accept", requests[0]!!.path)
        assertEquals("PATCH", requests[1]!!.method); assertEquals("/v1/notifications/notice-1/read", requests[1]!!.path)
        assertEquals("/v1/notifications/read-all", requests[2]!!.path)
    }

    @Test fun `maps member and notification GET responses`() = runTest {
        server.enqueue(json("{\"members\":[{\"userId\":\"owner\",\"name\":\"Ana\",\"email\":\"ana@example.com\",\"role\":\"owner\",\"createdAt\":\"2026-07-27T00:00:00Z\"}]}"))
        server.enqueue(json("{\"notifications\":[{\"id\":\"notice-1\",\"type\":\"item_updated\",\"title\":\"Producto\",\"body\":\"Leche\",\"householdId\":\"home-1\",\"listId\":\"list-1\",\"invitationId\":null,\"readAt\":null,\"createdAt\":\"2026-07-27T00:00:00Z\"}]}"))
        server.enqueue(json("{\"count\":1}"))
        val repo = SharingRepository(NetworkClient.authenticatedApi(server.url("/").toString(), TestTokenStore(), SharingApi::class.java))
        assertEquals("Ana", repo.members("home-1").single().name)
        assertEquals("list-1", repo.notifications().single().listId)
        assertEquals(1, repo.unreadCount())
        assertEquals("/v1/households/home-1/members", server.takeRequest(1, TimeUnit.SECONDS)!!.path)
        assertEquals("/v1/notifications", server.takeRequest(1, TimeUnit.SECONDS)!!.path)
        assertEquals("/v1/notifications/unread-count", server.takeRequest(1, TimeUnit.SECONDS)!!.path)
    }

    private fun json(body: String, status: Int = 200) = MockResponse().setResponseCode(status).setHeader("content-type", "application/json").setBody(body)
}

private class TestTokenStore : TokenStore {
    private val flow = MutableStateFlow<SessionTokens?>(SessionTokens("access-token", "refresh-token"))
    override val session: StateFlow<SessionTokens?> = flow
    override fun current() = flow.value
    override suspend fun read() = flow.value
    override suspend fun save(tokens: SessionTokens) { flow.value = tokens }
    override suspend fun clear() { flow.value = null }
    override suspend fun compareAndClear(expected: SessionTokens) = if (flow.value == expected) { flow.value = null; true } else false
}

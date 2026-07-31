package dev.esgarpe.nfcompra.core.network

import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.Authenticator
import okhttp3.Interceptor
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route
import retrofit2.HttpException

class BearerInterceptor(private val tokenStore: TokenStore) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val snapshot = tokenStore.snapshot()
        val request = if (snapshot == null || chain.request().header("Authorization") != null) chain.request()
        else chain.request().newBuilder()
            .header("Authorization", "Bearer ${snapshot.tokens.accessToken}")
            .tag(AuthenticatedRequestSession::class.java, AuthenticatedRequestSession(snapshot.identity))
            .build()
        return chain.proceed(request)
    }
}

private data class AuthenticatedRequestSession(val identity: Long)

class RefreshAuthenticator(
    private val authApi: AuthApi,
    private val tokenStore: TokenStore,
) : Authenticator {
    private val refreshMutex = Mutex()

    override fun authenticate(route: Route?, response: Response): Request? {
        if (response.request.header(REFRESH_ATTEMPT_HEADER) != null ||
            response.request.url.encodedPath.endsWith("/v1/auth/refresh")) return null
        val failedAccessToken = response.request.header("Authorization")
            ?.takeIf { it.startsWith("Bearer ") }
            ?.removePrefix("Bearer ")
            ?: return null
        val requestSession = response.request.tag(AuthenticatedRequestSession::class.java) ?: return null
        return runBlocking {
            refreshMutex.withLock {
                val attemptedSession = tokenStore.snapshot()
                    ?.takeIf { it.identity == requestSession.identity }
                    ?: return@withLock null
                if (attemptedSession.tokens.accessToken != failedAccessToken) {
                    return@withLock retry(response, attemptedSession)
                }

                val refreshed = try {
                    authApi.refresh(RefreshRequest(refreshToken = attemptedSession.tokens.refreshToken))
                } catch (error: Exception) {
                    if (error is HttpException && error.code() == 401) {
                        runCatching { tokenStore.compareAndClear(attemptedSession) }
                    }
                    return@withLock null
                }
                if (refreshed.accessToken.isBlank() || refreshed.refreshToken.isBlank()) {
                    return@withLock null
                }
                val refreshedTokens = SessionTokens(refreshed.accessToken, refreshed.refreshToken)
                val saved = runCatching {
                    tokenStore.compareAndSave(attemptedSession, refreshedTokens)
                }.getOrElse {
                    return@withLock null
                }
                if (!saved) return@withLock null
                retry(response, attemptedSession.copy(tokens = refreshedTokens))
            }
        }
    }

    private fun retry(response: Response, session: SessionSnapshot): Request = response.request.newBuilder()
        .header("Authorization", "Bearer ${session.tokens.accessToken}")
        .header(REFRESH_ATTEMPT_HEADER, "true")
        .tag(AuthenticatedRequestSession::class.java, AuthenticatedRequestSession(session.identity))
        .build()

    companion object { const val REFRESH_ATTEMPT_HEADER = "X-NFCompra-Refresh-Attempt" }
}

package dev.esgarpe.nfcompra.core.network

import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.Authenticator
import okhttp3.Interceptor
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route

class BearerInterceptor(private val tokenStore: TokenStore) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = tokenStore.current()?.accessToken
        val request = if (token == null || chain.request().header("Authorization") != null) chain.request()
        else chain.request().newBuilder().header("Authorization", "Bearer $token").build()
        return chain.proceed(request)
    }
}

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
        return runBlocking {
            refreshMutex.withLock {
                val attemptedTokens = tokenStore.current() ?: return@withLock null
                if (attemptedTokens.accessToken != failedAccessToken) {
                    return@withLock retry(response, attemptedTokens.accessToken)
                }

                val refreshed = runCatching {
                    authApi.refresh(RefreshRequest(refreshToken = attemptedTokens.refreshToken))
                }.getOrElse {
                    runCatching { tokenStore.compareAndClear(attemptedTokens) }
                    return@withLock null
                }
                if (refreshed.accessToken.isBlank() || refreshed.refreshToken.isBlank()) {
                    runCatching { tokenStore.compareAndClear(attemptedTokens) }
                    return@withLock null
                }
                runCatching {
                    tokenStore.save(SessionTokens(refreshed.accessToken, refreshed.refreshToken))
                }.getOrElse {
                    runCatching { tokenStore.compareAndClear(attemptedTokens) }
                    return@withLock null
                }
                retry(response, refreshed.accessToken)
            }
        }
    }

    private fun retry(response: Response, accessToken: String): Request = response.request.newBuilder()
        .header("Authorization", "Bearer $accessToken")
        .header(REFRESH_ATTEMPT_HEADER, "true")
        .build()

    companion object { const val REFRESH_ATTEMPT_HEADER = "X-NFCompra-Refresh-Attempt" }
}

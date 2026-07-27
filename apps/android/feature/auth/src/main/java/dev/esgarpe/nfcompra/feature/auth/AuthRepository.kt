package dev.esgarpe.nfcompra.feature.auth

import dev.esgarpe.nfcompra.core.network.AuthApi
import dev.esgarpe.nfcompra.core.network.ForgotPasswordRequest
import dev.esgarpe.nfcompra.core.network.LoginRequest
import dev.esgarpe.nfcompra.core.network.LogoutRequest
import dev.esgarpe.nfcompra.core.network.RefreshRequest
import dev.esgarpe.nfcompra.core.network.RegisterRequest
import dev.esgarpe.nfcompra.core.network.ResendVerificationRequest
import dev.esgarpe.nfcompra.core.network.ResetPasswordRequest
import dev.esgarpe.nfcompra.core.network.SessionTokens
import dev.esgarpe.nfcompra.core.network.TokenRequest
import dev.esgarpe.nfcompra.core.network.TokenStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import retrofit2.HttpException

sealed interface AuthResult {
    data object SignedIn : AuthResult
    data class Success(val message: String) : AuthResult
    data class Failure(val message: String) : AuthResult
}

class AuthRepository(private val api: AuthApi, private val tokenStore: TokenStore) {
    fun login(email: String, password: String): Flow<AuthResult> = flow {
        try {
            val session = api.login(LoginRequest(email, password))
            if (session.accessToken.isBlank() || session.refreshToken.isBlank()) {
                emit(AuthResult.Failure("La sesión recibida no es válida."))
                return@flow
            }
            try {
                tokenStore.save(SessionTokens(session.accessToken, session.refreshToken))
            } catch (error: Exception) {
                runCatching { tokenStore.clear() }
                throw error
            }
            emit(AuthResult.SignedIn)
        } catch (error: Exception) {
            emit(AuthResult.Failure(error.messageForUser()))
        }
    }

    fun register(name: String, email: String, password: String): Flow<AuthResult> =
        complete("Te hemos enviado un enlace de verificación.") { api.register(RegisterRequest(name, email, password)) }
    fun resendVerification(email: String): Flow<AuthResult> =
        complete("Hemos vuelto a enviar el correo de verificación.") { api.resendVerification(ResendVerificationRequest(email)) }
    fun verifyEmail(token: String): Flow<AuthResult> =
        complete("Correo verificado. Ya puedes iniciar sesión.") { api.verifyEmail(TokenRequest(token)) }
    fun requestPasswordReset(email: String): Flow<AuthResult> =
        complete("Si existe una cuenta, te hemos enviado un enlace.") { api.forgotPassword(ForgotPasswordRequest(email)) }
    fun resetPassword(token: String, password: String): Flow<AuthResult> =
        complete("Contraseña restablecida. Ya puedes iniciar sesión.") { api.resetPassword(ResetPasswordRequest(token, password)) }

    suspend fun refresh(): AuthResult {
        val refreshToken = tokenStore.read()?.refreshToken ?: return AuthResult.Failure("No hay sesión.")
        return try {
            val session = api.refresh(RefreshRequest(refreshToken = refreshToken))
            tokenStore.save(SessionTokens(session.accessToken, session.refreshToken))
            AuthResult.SignedIn
        } catch (error: Exception) {
            runCatching { tokenStore.clear() }
            AuthResult.Failure(error.messageForUser())
        }
    }

    suspend fun logout() {
        val refreshToken = tokenStore.read()?.refreshToken
        try {
            if (refreshToken != null) api.logout(LogoutRequest(refreshToken = refreshToken))
        } finally {
            tokenStore.clear()
        }
    }

    private fun complete(message: String, request: suspend () -> Unit): Flow<AuthResult> = flow {
        try { request(); emit(AuthResult.Success(message)) }
        catch (error: Exception) { emit(AuthResult.Failure(error.messageForUser())) }
    }

    private fun Exception.messageForUser(): String = when (this) {
        is HttpException -> "No se pudo completar la solicitud (${code()})."
        else -> "No se pudo conectar con el servicio."
    }
}

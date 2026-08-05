package dev.esgarpe.nfcompra.feature.auth

import dev.esgarpe.nfcompra.core.network.AuthApi
import dev.esgarpe.nfcompra.core.network.ForgotPasswordRequest
import dev.esgarpe.nfcompra.core.network.LoginRequest
import dev.esgarpe.nfcompra.core.network.LogoutRequest
import dev.esgarpe.nfcompra.core.network.RefreshRequest
import dev.esgarpe.nfcompra.core.network.RegisterRequest
import dev.esgarpe.nfcompra.core.network.ResendVerificationRequest
import dev.esgarpe.nfcompra.core.network.ResetPasswordRequest
import dev.esgarpe.nfcompra.core.network.ResetPasswordOtpRequest
import dev.esgarpe.nfcompra.core.network.SessionTokens
import dev.esgarpe.nfcompra.core.network.TokenRequest
import dev.esgarpe.nfcompra.core.network.TokenStore
import dev.esgarpe.nfcompra.core.network.VerifyPasswordResetOtpRequest
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import org.json.JSONObject
import retrofit2.HttpException

sealed interface AuthResult {
    data object SignedIn : AuthResult
    data class Success(val message: String) : AuthResult
    data class Failure(val message: String) : AuthResult
}

class AuthRepository(private val api: AuthApi, private val tokenStore: TokenStore) {
    fun login(email: String, password: String): Flow<AuthResult> = flow {
        val expectedGeneration = tokenStore.generation()
        try {
            val session = api.login(LoginRequest(email, password))
            if (session.accessToken.isBlank() || session.refreshToken.isBlank()) {
                emit(AuthResult.Failure("La sesión recibida no es válida."))
                return@flow
            }
            if (!tokenStore.compareAndStart(
                    expectedGeneration,
                    SessionTokens(session.accessToken, session.refreshToken),
                )
            ) {
                emit(AuthResult.Failure("La sesión ha cambiado."))
                return@flow
            }
            emit(AuthResult.SignedIn)
        } catch (error: Exception) {
            emit(AuthResult.Failure(error.messageForUser()))
        }
    }

    fun register(firstName: String, lastName: String, birthDate: String, username: String, email: String, password: String): Flow<AuthResult> =
        complete("Te hemos enviado un enlace de verificación.") {
            api.register(RegisterRequest(firstName, lastName, birthDate, username, email, password))
        }

    fun resendVerification(email: String): Flow<AuthResult> =
        complete("Hemos vuelto a enviar el correo de verificación.") { api.resendVerification(ResendVerificationRequest(email)) }

    fun verifyEmail(token: String): Flow<AuthResult> =
        complete("Correo verificado. Ya puedes iniciar sesión.") { api.verifyEmail(TokenRequest(token)) }

    fun requestPasswordReset(email: String): Flow<AuthResult> =
        complete("Si existe una cuenta, te hemos enviado un enlace.") { api.forgotPassword(ForgotPasswordRequest(email)) }

    fun verifyPasswordResetOtp(email: String, otp: String): Flow<AuthResult> =
        complete("Código verificado.") { api.verifyPasswordResetOtp(VerifyPasswordResetOtpRequest(email, otp)) }

    fun resetPassword(token: String, password: String): Flow<AuthResult> =
        complete("Contraseña restablecida. Ya puedes iniciar sesión.") { api.resetPassword(ResetPasswordRequest(token, password)) }

    fun resetPasswordWithOtp(email: String, otp: String, password: String): Flow<AuthResult> =
        complete("Contraseña restablecida. Ya puedes iniciar sesión.") { api.resetPasswordWithOtp(ResetPasswordOtpRequest(email, otp, password)) }

    suspend fun refresh(): AuthResult {
        val snapshot = tokenStore.snapshot() ?: return AuthResult.Failure("No hay sesión.")
        return try {
            val session = api.refresh(RefreshRequest(refreshToken = snapshot.tokens.refreshToken))
            if (session.accessToken.isBlank() || session.refreshToken.isBlank()) {
                return AuthResult.Failure("La sesión recibida no es válida.")
            }
            if (tokenStore.compareAndSave(snapshot, SessionTokens(session.accessToken, session.refreshToken))) {
                AuthResult.SignedIn
            } else {
                AuthResult.Failure("La sesión ha cambiado.")
            }
        } catch (error: Exception) {
            runCatching { tokenStore.compareAndClear(snapshot) }
            AuthResult.Failure(error.messageForUser())
        }
    }

    suspend fun logout() {
        val snapshot = tokenStore.snapshot()
        try {
            if (snapshot != null) api.logout(LogoutRequest(refreshToken = snapshot.tokens.refreshToken))
        } finally {
            if (snapshot != null) tokenStore.compareAndClear(snapshot)
        }
    }

    private fun complete(message: String, request: suspend () -> Unit): Flow<AuthResult> = flow {
        try {
            request()
            emit(AuthResult.Success(message))
        } catch (error: Exception) {
            emit(AuthResult.Failure(error.messageForUser()))
        }
    }

    private fun Exception.messageForUser(): String = when (this) {
        is HttpException -> apiMessage() ?: "No se pudo completar la solicitud (${code()})."
        else -> "No se pudo conectar con el servicio."
    }

    private fun HttpException.apiMessage(): String? = runCatching {
        response()?.errorBody()?.string()
            ?.takeIf { it.isNotBlank() }
            ?.let { JSONObject(it).optJSONObject("error")?.optString("message") }
            ?.takeIf { it.isNotBlank() }
    }.getOrNull()
}

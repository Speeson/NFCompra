package dev.esgarpe.nfcompra.core.network

import retrofit2.http.Body
import retrofit2.http.POST

data class LoginRequest(val email: String, val password: String, val clientType: String = "android")
data class RegisterRequest(
    val firstName: String,
    val lastName: String,
    val birthDate: String,
    val username: String,
    val email: String,
    val password: String,
)
data class ResendVerificationRequest(val email: String)
data class TokenRequest(val token: String)
data class ForgotPasswordRequest(val email: String)
data class ResetPasswordRequest(val token: String, val password: String)
data class VerifyPasswordResetOtpRequest(val email: String, val otp: String)
data class ResetPasswordOtpRequest(val email: String, val otp: String, val password: String)
data class RefreshRequest(val clientType: String = "android", val refreshToken: String)
data class LogoutRequest(val clientType: String = "android", val refreshToken: String)
data class SessionResponse(
    val accessToken: String,
    val refreshToken: String,
    val name: String? = null,
    val username: String? = null,
)

interface AuthApi {
    @POST("v1/auth/register") suspend fun register(@Body request: RegisterRequest)
    @POST("v1/auth/resend-verification") suspend fun resendVerification(@Body request: ResendVerificationRequest)
    @POST("v1/auth/verify-email") suspend fun verifyEmail(@Body request: TokenRequest)
    @POST("v1/auth/login") suspend fun login(@Body request: LoginRequest): SessionResponse
    @POST("v1/auth/refresh") suspend fun refresh(@Body request: RefreshRequest): SessionResponse
    @POST("v1/auth/logout") suspend fun logout(@Body request: LogoutRequest)
    @POST("v1/auth/forgot-password") suspend fun forgotPassword(@Body request: ForgotPasswordRequest)
    @POST("v1/auth/verify-password-reset-otp") suspend fun verifyPasswordResetOtp(@Body request: VerifyPasswordResetOtpRequest)
    @POST("v1/auth/reset-password") suspend fun resetPassword(@Body request: ResetPasswordRequest)
    @POST("v1/auth/reset-password") suspend fun resetPasswordWithOtp(@Body request: ResetPasswordOtpRequest)
}

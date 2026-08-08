package dev.esgarpe.nfcompra.feature.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch

data class AuthUiState(
    val isSubmitting: Boolean = false,
    val message: String? = null,
    val isSignedIn: Boolean = false,
)

class AuthViewModel(private val repository: AuthRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(AuthUiState())
    val state: StateFlow<AuthUiState> = mutableState.asStateFlow()

    fun login(email: String, password: String) = submit { repository.login(email, password) }
    fun register(firstName: String, lastName: String, birthDate: String, username: String, email: String, password: String) =
        submit { repository.register(firstName, lastName, birthDate, username, email, password) }
    fun resendVerification(email: String) = submit { repository.resendVerification(email) }
    fun verify(token: String) = submit { repository.verifyEmail(token) }
    fun forgotPassword(email: String) = submit { repository.requestPasswordReset(email) }
    fun verifyPasswordResetOtp(email: String, otp: String) = submit { repository.verifyPasswordResetOtp(email, otp) }
    fun resetPassword(token: String, password: String) = submit { repository.resetPassword(token, password) }
    fun resetPasswordWithOtp(email: String, otp: String, password: String) = submit { repository.resetPasswordWithOtp(email, otp, password) }
    fun logout() {
        viewModelScope.launch { runCatching { repository.logout() } }
    }

    fun tryAutoSignIn() {
        viewModelScope.launch {
            mutableState.value = AuthUiState(isSubmitting = true)
            val result = repository.refresh()
            mutableState.value = when (result) {
                AuthResult.SignedIn -> AuthUiState(message = "Sesión iniciada.", isSignedIn = true)
                is AuthResult.Failure -> AuthUiState(message = "no_session")
                else -> AuthUiState(message = "no_session")
            }
        }
    }

    fun resetTransientState() {
        mutableState.value = AuthUiState()
    }

    fun clearMessage() {
        mutableState.value = mutableState.value.copy(message = null)
    }

    private fun submit(action: () -> kotlinx.coroutines.flow.Flow<AuthResult>) {
        viewModelScope.launch {
            mutableState.value = AuthUiState(isSubmitting = true)
            action().collect { result ->
                mutableState.value = when (result) {
                    AuthResult.SignedIn -> AuthUiState(message = "Sesión iniciada.", isSignedIn = true)
                    is AuthResult.Success -> AuthUiState(message = result.message)
                    is AuthResult.Failure -> AuthUiState(message = result.message)
                }
            }
        }
    }
}

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
    fun register(name: String, email: String, password: String) = submit { repository.register(name, email, password) }
    fun verify(token: String) = submit { repository.verifyEmail(token) }
    fun forgotPassword(email: String) = submit { repository.requestPasswordReset(email) }
    fun resetPassword(token: String, password: String) = submit { repository.resetPassword(token, password) }

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

package dev.esgarpe.nfcompra.feature.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp

private enum class AuthRoute { LOGIN, REGISTER, VERIFY, FORGOT, RESET }

@Composable
fun AuthApp(viewModel: AuthViewModel, onSignedIn: () -> Unit = {}) {
    var route by remember { mutableStateOf(AuthRoute.LOGIN) }
    val state by viewModel.state.collectAsState()
    LaunchedEffect(state.isSignedIn) { if (state.isSignedIn) onSignedIn() }
    when (route) {
        AuthRoute.LOGIN -> LoginScreen(
            state = state,
            onLogin = viewModel::login,
            onRegister = { route = AuthRoute.REGISTER },
            onForgotPassword = { route = AuthRoute.FORGOT },
        )
        AuthRoute.REGISTER -> RegisterScreen(state, viewModel::register, viewModel::resendVerification, { route = AuthRoute.LOGIN }, { route = AuthRoute.VERIFY })
        AuthRoute.VERIFY -> VerificationScreen(state, viewModel::verify, { route = AuthRoute.LOGIN })
        AuthRoute.FORGOT -> ForgotPasswordScreen(state, viewModel::forgotPassword, { route = AuthRoute.RESET })
        AuthRoute.RESET -> ResetPasswordScreen(state, viewModel::resetPassword, { route = AuthRoute.LOGIN })
    }
}

@Composable
fun LoginScreen(
    state: AuthUiState,
    onLogin: (String, String) -> Unit,
    onRegister: () -> Unit,
    onForgotPassword: () -> Unit,
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    AuthForm("Iniciar sesión", state) {
        EmailField(email) { email = it }
        PasswordField(password, "Contraseña") { password = it }
        SubmitButton("Entrar", state) { onLogin(email, password) }
        TextButton(onClick = onForgotPassword) { Text("He olvidado mi contraseña") }
        TextButton(onClick = onRegister) { Text("Crear cuenta") }
    }
}

@Composable
fun RegisterScreen(
    state: AuthUiState,
    onRegister: (String, String, String, String, String, String) -> Unit,
    onResendVerification: (String) -> Unit,
    onBack: () -> Unit,
    onVerify: () -> Unit,
) {
    var firstName by remember { mutableStateOf("") }
    var lastName by remember { mutableStateOf("") }
    var day by remember { mutableStateOf("") }
    var month by remember { mutableStateOf("") }
    var year by remember { mutableStateOf("") }
    var username by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    val birthDate = remember(year, month, day) {
        if (year.length == 4 && month.isNotBlank() && day.isNotBlank()) {
            "${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}"
        } else {
            ""
        }
    }
    AuthForm("Crear cuenta", state) {
        OutlinedTextField(firstName, { firstName = it }, Modifier.fillMaxWidth().semantics { contentDescription = "Nombre" }, label = { Text("Nombre") })
        OutlinedTextField(lastName, { lastName = it }, Modifier.fillMaxWidth().semantics { contentDescription = "Apellidos" }, label = { Text("Apellidos") })
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(day, { day = it }, Modifier.weight(1f).semantics { contentDescription = "Día" }, label = { Text("Día") })
            OutlinedTextField(month, { month = it }, Modifier.weight(1f).semantics { contentDescription = "Mes" }, label = { Text("Mes") })
            OutlinedTextField(year, { year = it }, Modifier.weight(1f).semantics { contentDescription = "Año" }, label = { Text("Año") })
        }
        OutlinedTextField(username, { username = it }, Modifier.fillMaxWidth().semantics { contentDescription = "Username" }, label = { Text("Username") })
        EmailField(email) { email = it }
        PasswordField(password, "Password") { password = it }
        PasswordField(confirmPassword, "Confirmar password") { confirmPassword = it }
        SubmitButton("Registrarme", state) {
            if (password == confirmPassword) onRegister(firstName, lastName, birthDate, username, email, password)
        }
        TextButton(onClick = { onResendVerification(email) }, enabled = email.isNotBlank() && !state.isSubmitting) {
            Text("Reenviar verificación")
        }
        TextButton(onClick = onVerify) { Text("Ya tengo un código de verificación") }
        TextButton(onClick = onBack) { Text("Volver a iniciar sesión") }
    }
}

@Composable
fun VerificationScreen(state: AuthUiState, onVerify: (String) -> Unit, onBack: () -> Unit) {
    var token by remember { mutableStateOf("") }
    AuthForm("Verificar correo", state) {
        OutlinedTextField(token, { token = it }, Modifier.fillMaxWidth().semantics { contentDescription = "Código de verificación" }, label = { Text("Código") })
        SubmitButton("Verificar", state) { onVerify(token) }
        TextButton(onClick = onBack) { Text("Volver a iniciar sesión") }
    }
}

@Composable
fun ForgotPasswordScreen(state: AuthUiState, onRequest: (String) -> Unit, onReset: () -> Unit) {
    var email by remember { mutableStateOf("") }
    AuthForm("Recuperar contraseña", state) {
        EmailField(email) { email = it }
        SubmitButton("Enviar enlace", state) { onRequest(email) }
        TextButton(onClick = onReset) { Text("Ya tengo un código") }
    }
}

@Composable
fun ResetPasswordScreen(state: AuthUiState, onReset: (String, String) -> Unit, onBack: () -> Unit) {
    var token by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    AuthForm("Restablecer contraseña", state) {
        OutlinedTextField(token, { token = it }, Modifier.fillMaxWidth().semantics { contentDescription = "Código de recuperación" }, label = { Text("Código") })
        PasswordField(password, "Contraseña") { password = it }
        SubmitButton("Restablecer", state) { onReset(token, password) }
        TextButton(onClick = onBack) { Text("Volver a iniciar sesión") }
    }
}

@Composable
private fun AuthForm(title: String, state: AuthUiState, content: @Composable () -> Unit) {
    Column(
        modifier = Modifier.padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(title)
        state.message?.let { Text(it, modifier = Modifier.semantics { contentDescription = "Estado de autenticación" }) }
        content()
    }
}

@Composable
private fun EmailField(value: String, onValueChange: (String) -> Unit) {
    OutlinedTextField(value, onValueChange, Modifier.fillMaxWidth().semantics { contentDescription = "Correo electrónico" }, label = { Text("Correo electrónico") })
}

@Composable
private fun PasswordField(value: String, label: String, onValueChange: (String) -> Unit) {
    OutlinedTextField(value, onValueChange, Modifier.fillMaxWidth().semantics { contentDescription = label }, label = { Text(label) }, visualTransformation = PasswordVisualTransformation())
}

@Composable
private fun SubmitButton(label: String, state: AuthUiState, onClick: () -> Unit) {
    Button(onClick = onClick, enabled = !state.isSubmitting, modifier = Modifier.fillMaxWidth()) { Text(label) }
}

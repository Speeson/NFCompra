package dev.esgarpe.nfcompra.feature.auth

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Badge
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.Group
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay

private enum class AuthRoute { WELCOME, LOGIN, REGISTER, VERIFY, FORGOT, OTP, RESET }

private val AuthGradient = listOf(Color(0xFFAEDC81), Color(0xFF6CC51D))
private val AuthPage = Color(0xFFF8FCF9)
private val AuthText = Color(0xFF10271E)
private val AuthMuted = Color(0xFF527062)
private val AuthPrimary = Color(0xFF1C7144)
private val AuthLime = Color(0xFFDCFF72)
private val AuthField = Color(0xFFF2F3F2)
private val AuthDanger = Color(0xFFB42318)

@Composable
fun AuthApp(viewModel: AuthViewModel, onSignedIn: () -> Unit = {}) {
    var route by remember { mutableStateOf(AuthRoute.WELCOME) }
    var resetEmail by remember { mutableStateOf("") }
    var resetOtp by remember { mutableStateOf("") }
    val state by viewModel.state.collectAsState()
    LaunchedEffect(Unit) { viewModel.resetTransientState() }
    LaunchedEffect(state.isSignedIn) { if (state.isSignedIn) onSignedIn() }
    LaunchedEffect(state.message) {
        if (state.message != null) {
            delay(4_000)
            viewModel.clearMessage()
        }
    }
    LaunchedEffect(route, state.message) {
        if (route == AuthRoute.OTP && state.message == "Código verificado.") {
            route = AuthRoute.RESET
        }
    }
    when (route) {
        AuthRoute.WELCOME -> WelcomeScreen(
            state = state,
            onLogin = { route = AuthRoute.LOGIN },
            onRegister = { route = AuthRoute.REGISTER },
        )
        AuthRoute.LOGIN -> LoginScreen(
            state = state,
            onLogin = viewModel::login,
            onRegister = { route = AuthRoute.REGISTER },
            onForgotPassword = { route = AuthRoute.FORGOT },
            onBack = { route = AuthRoute.WELCOME },
        )
        AuthRoute.REGISTER -> RegisterScreen(state, viewModel::register, viewModel::resendVerification, { route = AuthRoute.LOGIN }, { route = AuthRoute.VERIFY })
        AuthRoute.VERIFY -> VerificationScreen(state, viewModel::verify, { route = AuthRoute.LOGIN })
        AuthRoute.FORGOT -> ForgotPasswordScreen(
            state = state,
            onRequest = { email ->
                resetEmail = email
                viewModel.forgotPassword(email)
                route = AuthRoute.OTP
            },
            onOtp = { email ->
                resetEmail = email
                route = AuthRoute.OTP
            },
        )
        AuthRoute.OTP -> OtpScreen(
            state = state,
            initialEmail = resetEmail,
            onNext = { email, otp ->
                resetEmail = email
                resetOtp = otp
                viewModel.verifyPasswordResetOtp(email, otp)
            },
            onBack = { route = AuthRoute.FORGOT },
        )
        AuthRoute.RESET -> ResetPasswordScreen(
            state = state,
            onReset = { password -> viewModel.resetPasswordWithOtp(resetEmail, resetOtp, password) },
            onBack = { route = AuthRoute.LOGIN },
        )
    }
}

@Composable
fun WelcomeScreen(
    state: AuthUiState,
    onLogin: () -> Unit,
    onRegister: () -> Unit,
) {
    AuthVisualScaffold(
        title = "",
        bodyTop = 270.dp,
        showBack = false,
        logoTop = 34.dp,
        logoSize = 190.dp,
    ) {
        Text("Bienvenido", color = AuthText, fontSize = 32.sp, fontWeight = FontWeight.Bold)
        Text("Organiza la compra de casa con listas compartidas y acceso rápido por NFC.", color = AuthMuted, lineHeight = 22.sp)
        AuthStateMessage(state)
        PrimaryAuthButton("Iniciar sesión", onClick = onLogin)
        SecondaryAuthButton("Acceder con biometría") {}
        CenterLink(
            normal = "¿No tienes una cuenta? ",
            action = "Crear cuenta",
            onClick = onRegister,
        )
    }
}

@Composable
fun LoginScreen(
    state: AuthUiState,
    onLogin: (String, String) -> Unit,
    onRegister: () -> Unit,
    onForgotPassword: () -> Unit,
    onBack: () -> Unit,
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var rememberMe by remember { mutableStateOf(true) }
    AuthVisualScaffold(
        title = "",
        bodyTop = 238.dp,
        onBack = onBack,
        logoTop = 34.dp,
        logoSize = 180.dp,
    ) {
        Text("Bienvenido de nuevo", color = AuthText, fontSize = 32.sp, fontWeight = FontWeight.Bold)
        Text("Inicia sesión en tu cuenta", color = AuthMuted, fontSize = 16.sp)
        AuthStateMessage(state)
        EmailField(email) { email = it }
        PasswordField(password, "Contraseña") { password = it }
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(
                    checked = rememberMe,
                    onCheckedChange = { rememberMe = it },
                    colors = CheckboxDefaults.colors(checkedColor = AuthPrimary, uncheckedColor = AuthMuted, checkmarkColor = AuthLime),
                )
                Text("Recuérdame", color = AuthMuted, fontWeight = FontWeight.SemiBold)
            }
            TextButton(onClick = onForgotPassword, colors = ButtonDefaults.textButtonColors(contentColor = AuthPrimary)) {
                Text("¿Olvidaste tu contraseña?", fontWeight = FontWeight.Bold)
            }
        }
        PrimaryAuthButton("Iniciar sesión", enabled = !state.isSubmitting) { onLogin(email, password) }
        CenterLink(
            normal = "¿No tienes una cuenta? ",
            action = "Crear cuenta",
            onClick = onRegister,
        )
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
    var signupAttempted by remember { mutableStateOf(false) }
    val birthDate = remember(year, month, day) {
        if (year.length == 4 && month.isNotBlank() && day.isNotBlank()) {
            "${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}"
        } else {
            ""
        }
    }
    val passwordMismatch = confirmPassword.isNotBlank() && password != confirmPassword

    AuthVisualScaffold(
        title = "",
        bodyTop = 150.dp,
        onBack = onBack,
        compact = true,
        logoTop = 34.dp,
        logoSize = 178.dp,
    ) {
        Text("Crear cuenta", color = AuthText, fontSize = 28.sp, fontWeight = FontWeight.Bold)
        Text("Rellena tus datos para crear tu cuenta NFCompra.", color = AuthMuted, fontSize = 16.sp)
        AuthStateMessage(state)
        RoundedTextField(firstName, { firstName = it }, "Nombre", "Nombre", leadingIcon = Icons.Outlined.Person, compact = true)
        RoundedTextField(lastName, { lastName = it }, "Apellidos", "Apellidos", leadingIcon = Icons.Outlined.Group, compact = true)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            RoundedTextField(day, { day = it }, "Día", "Día", Modifier.weight(1f), KeyboardType.Number, compact = true)
            RoundedTextField(month, { month = it }, "Mes", "Mes", Modifier.weight(1f), KeyboardType.Number, compact = true)
            RoundedTextField(year, { year = it }, "Año", "Año", Modifier.weight(1f), KeyboardType.Number, compact = true)
        }
        RoundedTextField(username, { username = it }, "Usuario", "Username", leadingIcon = Icons.Outlined.Badge, compact = true)
        EmailField(email, compact = true) { email = it }
        PasswordField(password, "Contraseña", compact = true) { password = it }
        PasswordField(confirmPassword, "Confirmar contraseña", compact = true) { confirmPassword = it }
        if (passwordMismatch) {
            Text("Las contraseñas no coinciden.", color = AuthDanger, fontWeight = FontWeight.SemiBold)
        }
        PrimaryAuthButton("Crear cuenta", enabled = !state.isSubmitting && !passwordMismatch, compact = true) {
            signupAttempted = true
            if (!passwordMismatch) onRegister(firstName, lastName, birthDate, username, email, password)
        }
        if (signupAttempted) {
            TextButton(
                onClick = { onResendVerification(email) },
                enabled = email.isNotBlank() && !state.isSubmitting,
                colors = ButtonDefaults.textButtonColors(contentColor = AuthPrimary),
            ) {
                Text("Reenviar verificación", fontWeight = FontWeight.Bold)
            }
            TextButton(onClick = onVerify, colors = ButtonDefaults.textButtonColors(contentColor = AuthPrimary)) {
                Text("Ya tengo un código de verificación", fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
fun VerificationScreen(state: AuthUiState, onVerify: (String) -> Unit, onBack: () -> Unit) {
    var token by remember { mutableStateOf("") }
    AuthSimpleForm("Verificar correo", state) {
        RoundedTextField(token, { token = it }, "Código", "Código de verificación")
        PrimaryAuthButton("Verificar", enabled = !state.isSubmitting) { onVerify(token) }
        TextButton(onClick = onBack, colors = ButtonDefaults.textButtonColors(contentColor = AuthPrimary)) { Text("Volver a iniciar sesión") }
    }
}

@Composable
fun ForgotPasswordScreen(state: AuthUiState, onRequest: (String) -> Unit, onOtp: (String) -> Unit) {
    var email by remember { mutableStateOf("") }
    AuthSimpleForm("Recuperar contraseña", state) {
        EmailField(email) { email = it }
        PrimaryAuthButton("Enviar código", enabled = !state.isSubmitting) { onRequest(email) }
        TextButton(
            onClick = { onOtp(email) },
            enabled = email.isNotBlank(),
            colors = ButtonDefaults.textButtonColors(contentColor = AuthPrimary),
        ) {
            Text("Ya tengo un código")
        }
    }
}

@Composable
fun OtpScreen(
    state: AuthUiState,
    initialEmail: String,
    onNext: (String, String) -> Unit,
    onBack: () -> Unit,
) {
    var otp by remember { mutableStateOf("") }
    val validOtp = otp.length == 6
    AuthVisualScaffold(
        title = "",
        bodyTop = 430.dp,
        onBack = onBack,
    ) {
        Text("Introduce el código", color = AuthText, fontSize = 30.sp, fontWeight = FontWeight.Bold)
        Text("Hemos enviado un código de 6 cifras al email que has introducido. Escríbelo para continuar.", color = AuthMuted, lineHeight = 22.sp)
        AuthStateMessage(state)
        OtpCodeField(value = otp, onValueChange = { value -> otp = value.filter(Char::isDigit).take(6) })
        PrimaryAuthButton("Siguiente", enabled = validOtp && initialEmail.isNotBlank()) { onNext(initialEmail, otp) }
        TextButton(onClick = onBack, colors = ButtonDefaults.textButtonColors(contentColor = AuthPrimary)) {
            Text("Volver a recuperar contraseña", fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
fun ResetPasswordScreen(state: AuthUiState, onReset: (String) -> Unit, onBack: () -> Unit) {
    var password by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    val passwordMismatch = confirmPassword.isNotBlank() && password != confirmPassword
    AuthSimpleForm("Restablecer contraseña", state) {
        PasswordField(password, "Introduce tu nueva contraseña") { password = it }
        PasswordField(confirmPassword, "Confirma tu nueva contraseña") { confirmPassword = it }
        if (passwordMismatch) {
            Text("Las contraseñas no coinciden.", color = AuthDanger, fontWeight = FontWeight.SemiBold)
        }
        PrimaryAuthButton("Restablecer", enabled = !state.isSubmitting && !passwordMismatch && password.length >= 8) { onReset(password) }
        TextButton(onClick = onBack, colors = ButtonDefaults.textButtonColors(contentColor = AuthPrimary)) { Text("Volver a iniciar sesión") }
    }
}

@Composable
private fun AuthVisualScaffold(
    title: String,
    bodyTop: androidx.compose.ui.unit.Dp,
    showBack: Boolean = true,
    onBack: () -> Unit = {},
    compact: Boolean = false,
    logoTop: androidx.compose.ui.unit.Dp = 86.dp,
    logoSize: androidx.compose.ui.unit.Dp = 230.dp,
    content: @Composable ColumnScope.() -> Unit,
) {
    CompositionLocalProvider(LocalContentColor provides AuthText) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(AuthPage),
        ) {
            HeaderArtwork(title = title, showBack = showBack, onBack = onBack, logoTop = logoTop, logoSize = logoSize)
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = bodyTop)
                    .align(Alignment.BottomCenter),
                shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = 17.dp, vertical = if (compact) 18.dp else 30.dp),
                    verticalArrangement = Arrangement.spacedBy(if (compact) 9.dp else 12.dp),
                    content = content,
                )
            }
        }
    }
}

@Composable
private fun HeaderArtwork(
    title: String,
    showBack: Boolean,
    onBack: () -> Unit,
    logoTop: androidx.compose.ui.unit.Dp,
    logoSize: androidx.compose.ui.unit.Dp,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(360.dp)
            .background(Brush.verticalGradient(listOf(AuthPrimary, Color(0xFF6CC51D), AuthPage))),
    ) {
        if (showBack) {
            TextButton(
                onClick = onBack,
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(start = 24.dp, top = 58.dp),
                colors = ButtonDefaults.textButtonColors(contentColor = Color.White),
            ) {
                Text("←", fontSize = 28.sp, fontWeight = FontWeight.Bold)
            }
        }
        if (title.isNotBlank()) {
            Text(
                text = title,
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .padding(top = 66.dp),
                color = Color.White,
                fontSize = 18.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
        Image(
            painter = painterResource(R.drawable.nfcompra_logo),
            contentDescription = "NFCompra",
            modifier = Modifier
                .align(Alignment.TopCenter)
                .padding(top = logoTop)
                .size(logoSize)
                .clip(RoundedCornerShape(32.dp)),
            contentScale = ContentScale.Fit,
        )
    }
}

@Composable
private fun AuthSimpleForm(title: String, state: AuthUiState, content: @Composable ColumnScope.() -> Unit) {
    CompositionLocalProvider(LocalContentColor provides AuthText) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(AuthPage)
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Spacer(modifier = Modifier.height(32.dp))
            Image(
                painter = painterResource(R.drawable.nfcompra_logo),
                contentDescription = "NFCompra",
                modifier = Modifier
                    .align(Alignment.CenterHorizontally)
                    .size(132.dp),
                contentScale = ContentScale.Fit,
            )
            Text(title, color = AuthPrimary, fontSize = 30.sp, fontWeight = FontWeight.Bold)
            AuthStateMessage(state)
            content()
        }
    }
}

@Composable
private fun AuthStateMessage(state: AuthUiState) {
    state.message?.let {
        Text(
            text = it,
            color = if (it.contains("No se pudo", ignoreCase = true)) AuthDanger else AuthMuted,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.semantics { contentDescription = "Estado de autenticación" },
        )
    }
}

@Composable
private fun OtpCodeField(value: String, onValueChange: (String) -> Unit) {
    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
        singleLine = true,
        textStyle = androidx.compose.ui.text.TextStyle(color = Color.Transparent),
        decorationBox = {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                repeat(6) { index ->
                    val digit = value.getOrNull(index)?.toString().orEmpty()
                    Box(
                        modifier = Modifier
                            .padding(horizontal = 4.dp)
                            .width(46.dp)
                            .height(56.dp)
                            .background(AuthField, RoundedCornerShape(12.dp))
                            .border(
                                width = 1.dp,
                                color = if (digit.isNotBlank()) AuthPrimary else AuthMuted.copy(alpha = 0.18f),
                                shape = RoundedCornerShape(12.dp),
                            ),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = digit,
                            color = AuthText,
                            fontSize = 22.sp,
                            fontWeight = FontWeight.Bold,
                            textAlign = TextAlign.Center,
                        )
                    }
                }
            }
        },
    )
}

@Composable
private fun EmailField(value: String, compact: Boolean = false, onValueChange: (String) -> Unit) {
    RoundedTextField(value, onValueChange, "Email", "Correo electrónico", keyboardType = KeyboardType.Email, leadingIcon = Icons.Outlined.Email, compact = compact)
}

@Composable
private fun PasswordField(value: String, label: String, compact: Boolean = false, onValueChange: (String) -> Unit) {
    var passwordVisible by remember { mutableStateOf(false) }
    RoundedTextField(
        value = value,
        onValueChange = onValueChange,
        label = label,
        contentDescription = label,
        leadingIcon = Icons.Outlined.Lock,
        compact = compact,
        visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
        keyboardType = KeyboardType.Password,
        trailingIcon = {
            IconButton(onClick = { passwordVisible = !passwordVisible }) {
                Icon(
                    imageVector = if (passwordVisible) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility,
                    contentDescription = if (passwordVisible) "Ocultar contraseña" else "Mostrar contraseña",
                    tint = AuthMuted,
                )
            }
        },
    )
}

@Composable
private fun RoundedTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    contentDescription: String,
    modifier: Modifier = Modifier.fillMaxWidth(),
    keyboardType: KeyboardType = KeyboardType.Text,
    leadingIcon: ImageVector? = null,
    compact: Boolean = false,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    trailingIcon: (@Composable () -> Unit)? = null,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier
            .height(if (compact) 56.dp else 60.dp)
            .semantics { this.contentDescription = contentDescription },
        label = if (compact) null else ({ Text(label) }),
        placeholder = if (compact) ({ Text(label, color = AuthMuted) }) else null,
        leadingIcon = leadingIcon?.let { icon ->
            {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = AuthMuted,
                    modifier = Modifier.size(22.dp),
                )
            }
        },
        trailingIcon = trailingIcon,
        singleLine = true,
        shape = RoundedCornerShape(12.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedContainerColor = AuthField,
            unfocusedContainerColor = AuthField,
            focusedBorderColor = AuthPrimary,
            unfocusedBorderColor = Color.Transparent,
            focusedLabelColor = AuthPrimary,
            unfocusedLabelColor = AuthMuted,
            cursorColor = AuthPrimary,
            focusedTextColor = AuthText,
            unfocusedTextColor = AuthText,
        ),
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        visualTransformation = visualTransformation,
    )
}

@Composable
private fun PrimaryAuthButton(label: String, enabled: Boolean = true, compact: Boolean = false, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier
            .fillMaxWidth()
            .height(if (compact) 50.dp else 60.dp)
            .background(Brush.linearGradient(AuthGradient), RoundedCornerShape(12.dp)),
        shape = RoundedCornerShape(12.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = Color.Transparent,
            contentColor = Color.White,
            disabledContainerColor = AuthMuted.copy(alpha = 0.35f),
            disabledContentColor = Color.White.copy(alpha = 0.8f),
        ),
        elevation = ButtonDefaults.buttonElevation(defaultElevation = 0.dp),
    ) {
        Text(label, fontWeight = FontWeight.Bold, fontSize = 16.sp)
    }
}

@Composable
private fun SecondaryAuthButton(label: String, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .height(60.dp),
        shape = RoundedCornerShape(12.dp),
        colors = ButtonDefaults.buttonColors(containerColor = AuthField, contentColor = AuthText),
        elevation = ButtonDefaults.buttonElevation(defaultElevation = 0.dp),
    ) {
        Text(label, fontWeight = FontWeight.Bold, fontSize = 16.sp)
    }
}

@Composable
private fun ColumnScope.CenterLink(normal: String, action: String, onClick: () -> Unit) {
    TextButton(
        onClick = onClick,
        modifier = Modifier.align(Alignment.CenterHorizontally),
        colors = ButtonDefaults.textButtonColors(contentColor = AuthText),
    ) {
        Text(
            buildAnnotatedString {
                append(normal)
                withStyle(SpanStyle(color = AuthPrimary, fontWeight = FontWeight.Bold)) {
                    append(action)
                }
            },
            fontSize = 16.sp,
        )
    }
}

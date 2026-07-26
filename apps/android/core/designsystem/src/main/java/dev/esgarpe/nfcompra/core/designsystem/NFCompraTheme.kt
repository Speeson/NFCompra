package dev.esgarpe.nfcompra.core.designsystem

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val LightColors = lightColorScheme(
    primary = Color(0xFF006C4C),
    secondary = Color(0xFF4E6358),
    tertiary = Color(0xFF3E6374),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFF72DBA9),
    secondary = Color(0xFFB5CCBD),
    tertiary = Color(0xFFA5CDDF),
)

@Composable
fun NFCompraTheme(
    darkTheme: Boolean = false,
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        content = content,
    )
}

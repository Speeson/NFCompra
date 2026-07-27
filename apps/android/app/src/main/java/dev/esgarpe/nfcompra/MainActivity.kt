package dev.esgarpe.nfcompra

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import dev.esgarpe.nfcompra.core.designsystem.NFCompraTheme
import dev.esgarpe.nfcompra.core.network.KeystoreTokenStore
import dev.esgarpe.nfcompra.core.network.NetworkClient
import dev.esgarpe.nfcompra.feature.auth.AuthApp
import dev.esgarpe.nfcompra.feature.auth.AuthRepository
import dev.esgarpe.nfcompra.feature.auth.AuthViewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val tokenStore = KeystoreTokenStore(applicationContext)
        val repository = AuthRepository(NetworkClient.authApi(BuildConfig.AUTH_BASE_URL), tokenStore)
        setContent {
            NFCompraTheme {
                AuthApp(AuthViewModel(repository))
            }
        }
    }
}

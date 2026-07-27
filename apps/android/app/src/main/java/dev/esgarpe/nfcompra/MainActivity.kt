package dev.esgarpe.nfcompra

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.collectAsState
import dev.esgarpe.nfcompra.core.designsystem.NFCompraTheme
import dev.esgarpe.nfcompra.core.network.KeystoreTokenStore
import dev.esgarpe.nfcompra.core.network.NetworkClient
import dev.esgarpe.nfcompra.feature.auth.AuthApp
import dev.esgarpe.nfcompra.feature.auth.AuthRepository
import dev.esgarpe.nfcompra.feature.auth.AuthViewModel
import dev.esgarpe.nfcompra.feature.shoppinglist.ShoppingListApi
import dev.esgarpe.nfcompra.feature.shoppinglist.ShoppingListApp
import dev.esgarpe.nfcompra.feature.shoppinglist.ShoppingListRepository
import dev.esgarpe.nfcompra.feature.shoppinglist.ShoppingListViewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val tokenStore = KeystoreTokenStore(applicationContext)
        val repository = AuthRepository(NetworkClient.authApi(BuildConfig.AUTH_BASE_URL), tokenStore)
        val shoppingRepository = ShoppingListRepository(
            NetworkClient.authenticatedApi(BuildConfig.AUTH_BASE_URL, tokenStore, ShoppingListApi::class.java),
        )
        setContent {
            val session by tokenStore.session.collectAsState()
            val authViewModel = remember { AuthViewModel(repository) }
            NFCompraTheme {
                if (session != null) {
                    val shoppingViewModel = remember { ShoppingListViewModel(shoppingRepository) }
                    ShoppingListApp(shoppingViewModel, authViewModel::logout)
                }
                else AuthApp(authViewModel)
            }
        }
    }
}

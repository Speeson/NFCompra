package dev.esgarpe.nfcompra.feature.shoppinglist

import android.content.Context
import dev.esgarpe.nfcompra.core.network.NetworkClient
import dev.esgarpe.nfcompra.core.network.TokenStore
import java.io.Closeable

class AccountShoppingSession(
    val repository: OfflineShoppingRepository,
    val viewModel: ShoppingListViewModel = ShoppingListViewModel(repository),
    private val revokeSync: () -> Unit = {},
) : Closeable {
    override fun close() {
        viewModel.dispose()
        repository.close()
    }

    fun revoke() {
        revokeSync()
        close()
    }

    companion object {
        fun create(
            context: Context,
            baseUrl: String,
            tokenStore: TokenStore,
            accountId: String,
        ): AccountShoppingSession {
            val api = NetworkClient.authenticatedApi(
                baseUrl,
                tokenStore,
                ShoppingListApi::class.java,
            )
            return AccountShoppingSession(
                OfflineShoppingRepository.create(context, api, accountId, baseUrl),
                revokeSync = { revokeShoppingAccount(context, accountId) },
            )
        }

        fun revoke(context: Context, accountId: String) {
            revokeShoppingAccount(context, accountId)
        }
    }
}

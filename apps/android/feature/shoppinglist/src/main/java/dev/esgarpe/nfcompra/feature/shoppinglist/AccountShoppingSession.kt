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
        try {
            close()
        } finally {
            revokeSync()
        }
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
            val repository = OfflineShoppingRepository.create(context, api, accountId, baseUrl)
            return AccountShoppingSession(
                repository,
                ShoppingListViewModel(repository, SharedPreferencesHouseholdSelectionStore(context, accountId)),
                revokeSync = { revokeShoppingAccount(context, accountId) },
            )
        }

        fun revoke(context: Context, accountId: String) {
            revokeShoppingAccount(context, accountId)
        }
    }
}

internal class SharedPreferencesHouseholdSelectionStore(context: Context, accountId: String) : HouseholdSelectionStore {
    private val preferences = context.applicationContext.getSharedPreferences("nfcompra.active_household", Context.MODE_PRIVATE)
    private val key = accountId

    override fun get(): String? = preferences.getString(key, null)

    override fun set(householdId: String?) {
        preferences.edit().apply {
            if (householdId == null) remove(key) else putString(key, householdId)
        }.apply()
    }
}

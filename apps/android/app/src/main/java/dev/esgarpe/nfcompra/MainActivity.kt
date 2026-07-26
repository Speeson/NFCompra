package dev.esgarpe.nfcompra

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import dev.esgarpe.nfcompra.core.designsystem.NFCompraTheme
import dev.esgarpe.nfcompra.feature.shoppinglist.ShoppingListScreen
import dev.esgarpe.nfcompra.feature.shoppinglist.demoShoppingListUiState

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            NFCompraTheme {
                ShoppingListScreen(state = demoShoppingListUiState(), onAction = {})
            }
        }
    }
}

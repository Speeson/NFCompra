package dev.esgarpe.nfcompra.core.database

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import java.security.MessageDigest

@Database(
    entities = [
        LocalHousehold::class,
        LocalShoppingList::class,
        LocalShoppingItem::class,
        PendingOperation::class,
    ],
    version = 1,
    exportSchema = true,
)
abstract class NfCompraDatabase : RoomDatabase() {
    abstract fun shoppingDao(): ShoppingDao

    companion object {
        val MIGRATIONS: Array<Migration> = emptyArray()
        private val instances = mutableMapOf<String, NfCompraDatabase>()

        fun create(context: Context, accountId: String): NfCompraDatabase {
            require(accountId.isNotBlank()) { "accountId no puede estar vacío." }
            val databaseName = databaseName(accountId)
            return synchronized(this) {
                instances.getOrPut(databaseName) {
                    context.applicationContext.getDatabasePath(databaseName).parentFile?.mkdirs()
                    Room.databaseBuilder(
                        context.applicationContext,
                        NfCompraDatabase::class.java,
                        databaseName,
                    ).addMigrations(*MIGRATIONS).build()
                }
            }
        }

        private fun databaseName(accountId: String): String {
            val digest = MessageDigest.getInstance("SHA-256")
                .digest(accountId.toByteArray(Charsets.UTF_8))
                .take(16)
                .joinToString("") { byte -> "%02x".format(byte) }
            return "nfcompra-$digest.db"
        }
    }
}

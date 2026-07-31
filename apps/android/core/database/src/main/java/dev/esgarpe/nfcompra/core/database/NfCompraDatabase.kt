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
        SnapshotMetadata::class,
    ],
    version = 2,
    exportSchema = true,
)
abstract class NfCompraDatabase : RoomDatabase() {
    abstract fun shoppingDao(): ShoppingDao

    companion object {
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS `snapshot_metadata` (
                        `collectionKey` TEXT NOT NULL,
                        `updatedAt` INTEGER NOT NULL,
                        PRIMARY KEY(`collectionKey`)
                    )
                    """.trimIndent(),
                )
            }
        }
        val MIGRATIONS: Array<Migration> = arrayOf(MIGRATION_1_2)
        private data class DatabaseReference(
            val database: NfCompraDatabase,
            var owners: Int,
        )

        private val instances = mutableMapOf<String, DatabaseReference>()

        fun create(context: Context, accountId: String): NfCompraDatabase {
            require(accountId.isNotBlank()) { "accountId no puede estar vacío." }
            val databaseName = databaseName(accountId)
            return acquire(databaseName) {
                context.applicationContext.getDatabasePath(databaseName).parentFile?.mkdirs()
                Room.databaseBuilder(
                    context.applicationContext,
                    NfCompraDatabase::class.java,
                    databaseName,
                ).addMigrations(*MIGRATIONS).build()
            }
        }

        internal fun acquire(
            databaseName: String,
            databaseFactory: () -> NfCompraDatabase,
        ): NfCompraDatabase {
            return synchronized(this) {
                val existing = instances[databaseName]
                if (existing != null) {
                    existing.owners++
                    existing.database
                } else {
                    val database = databaseFactory()
                    instances[databaseName] = DatabaseReference(database, owners = 1)
                    database
                }
            }
        }

        fun release(accountId: String, database: NfCompraDatabase): Boolean =
            releaseByName(databaseName(accountId), database)

        internal fun releaseByName(databaseName: String, database: NfCompraDatabase): Boolean =
            synchronized(this) {
                val reference = instances[databaseName] ?: return@synchronized false
                if (reference.database === database) {
                    reference.owners--
                }
                if (reference.database === database && reference.owners == 0) {
                    instances.remove(databaseName)
                    database.close()
                    true
                } else {
                    false
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

package dev.esgarpe.nfcompra.core.database

import androidx.room.testing.MigrationTestHelper
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class NfCompraDatabaseMigrationTest {
    @get:Rule
    val helper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        NfCompraDatabase::class.java,
    )

    @Test
    fun `migration 1 to 2 preserves shopping data and creates empty snapshot metadata`() {
        helper.createDatabase(DATABASE_NAME, 1).apply {
            execSQL(
                """
                INSERT INTO households(id, name, ownerId, createdAt, updatedAt)
                VALUES ('home-1', 'Casa', 'owner-1', '2026-07-27T00:00:00Z', '2026-07-27T00:00:00Z')
                """.trimIndent(),
            )
            execSQL(
                """
                INSERT INTO shopping_lists(id, householdId, name, isDefault, version, createdAt, updatedAt)
                VALUES ('list-1', 'home-1', 'Compra', 1, 3, '2026-07-27T00:00:00Z', '2026-07-27T00:00:00Z')
                """.trimIndent(),
            )
            execSQL(
                """
                INSERT INTO shopping_items(
                    id, listId, name, normalizedName, quantity, unit, category, note,
                    isChecked, position, version, createdBy, updatedBy, createdAt, updatedAt
                ) VALUES (
                    'item-1', 'list-1', 'Leche', 'leche', 1.0, 'litro', NULL, NULL,
                    0, 0, 7, 'user-1', 'user-1', '2026-07-27T00:00:00Z', '2026-07-27T00:00:00Z'
                )
                """.trimIndent(),
            )
            execSQL(
                """
                INSERT INTO pending_operations(
                    operationId, type, listId, itemId, payloadJson, createdAt, attempts, state, serverItemJson
                ) VALUES ('operation-1', 'update', 'list-1', 'item-1', '{}', 100, 0, 'pending', NULL)
                """.trimIndent(),
            )
            close()
        }

        val migrated = helper.runMigrationsAndValidate(
            DATABASE_NAME,
            2,
            true,
            NfCompraDatabase.MIGRATION_1_2,
        )

        migrated.query("SELECT id, name FROM households").use { cursor ->
            assertTrue(cursor.moveToFirst())
            assertEquals("home-1", cursor.getString(0))
            assertEquals("Casa", cursor.getString(1))
        }
        migrated.query("SELECT COUNT(*) FROM snapshot_metadata").use { cursor ->
            assertTrue(cursor.moveToFirst())
            assertEquals(0, cursor.getInt(0))
        }
        listOf(
            "shopping_lists" to "list-1",
            "shopping_items" to "item-1",
            "pending_operations" to "operation-1",
        ).forEach { (table, id) ->
            val idColumn = if (table == "pending_operations") "operationId" else "id"
            migrated.query("SELECT $idColumn FROM $table").use { cursor ->
                assertTrue(cursor.moveToFirst())
                assertEquals(id, cursor.getString(0))
            }
        }
        migrated.close()
    }

    private companion object {
        const val DATABASE_NAME = "migration-1-2"
    }
}

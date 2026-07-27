package dev.esgarpe.nfcompra.core.database

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.util.UUID

@RunWith(RobolectricTestRunner::class)
class ShoppingDaoTest {
    private lateinit var database: NfCompraDatabase
    private lateinit var dao: ShoppingDao

    @Before
    fun setUp() {
        database = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext<Context>(),
            NfCompraDatabase::class.java,
        ).allowMainThreadQueries().build()
        dao = database.shoppingDao()
    }

    @After
    fun tearDown() {
        database.close()
    }

    @Test
    fun `server snapshot replacement rolls back every table when one row is invalid`() = runTest {
        dao.replaceServerSnapshot(
            households = listOf(household("home-old")),
            lists = listOf(shoppingList("list-old", "home-old")),
            items = listOf(item("item-old", "list-old", "Leche")),
        )

        runCatching {
            dao.replaceServerSnapshot(
                households = listOf(household("home-new")),
                lists = listOf(shoppingList("list-new", "home-new")),
                items = listOf(item("item-new", "missing-list", "Pan")),
            )
        }

        assertEquals(listOf("home-old"), dao.households().map { it.id })
        assertEquals(listOf("list-old"), dao.lists("home-old").map { it.id })
        assertEquals(listOf("item-old"), dao.items("list-old").map { it.id })
    }

    @Test
    fun `list observation emits the latest cached item snapshot`() = runTest {
        dao.replaceServerSnapshot(
            households = listOf(household("home-1")),
            lists = listOf(shoppingList("list-1", "home-1")),
            items = listOf(item("item-old", "list-1", "Leche")),
        )

        dao.replaceItems(
            "list-1",
            listOf(item("item-new", "list-1", "Pan")),
        )

        val cached = dao.observeItems("list-1").first()
        assertEquals(listOf("item-new"), cached.map { it.id })
        assertEquals("Pan", cached.single().name)
    }

    @Test
    fun `server item replacement preserves pending local creates updates and deletes`() = runTest {
        dao.replaceServerSnapshot(
            households = listOf(household("home-1")),
            lists = listOf(shoppingList("list-1", "home-1")),
            items = listOf(
                item("item-update", "list-1", "Leche remota"),
                item("item-delete", "list-1", "Huevos remotos"),
            ),
        )
        dao.upsertItemAndEnqueue(
            item("item-update", "list-1", "Leche local"),
            operation("update-operation", createdAt = 100).copy(
                type = PendingOperationType.UPDATE,
                itemId = "item-update",
            ),
        )
        dao.upsertItemAndEnqueue(
            item("local-create", "list-1", "Pan local"),
            operation("create-operation", createdAt = 101).copy(
                type = PendingOperationType.CREATE,
                itemId = "local-create",
            ),
        )
        dao.deleteItemAndEnqueue(
            "item-delete",
            operation("delete-operation", createdAt = 102).copy(
                type = PendingOperationType.DELETE,
                itemId = "item-delete",
            ),
        )

        dao.replaceItems(
            "list-1",
            listOf(
                item("item-update", "list-1", "Leche remota nueva"),
                item("item-delete", "list-1", "Huevos remotos nuevos"),
                item("item-server", "list-1", "Arroz remoto"),
            ),
        )

        val items = dao.items("list-1")
        assertEquals(
            listOf("item-server", "item-update", "local-create"),
            items.map { it.id }.sorted(),
        )
        assertEquals("Leche local", items.single { it.id == "item-update" }.name)
        assertEquals("Pan local", items.single { it.id == "local-create" }.name)
        assertFalse(items.any { it.id == "item-delete" })
    }

    @Test
    fun `household and list refreshes do not cascade pending local items`() = runTest {
        dao.replaceServerSnapshot(
            households = listOf(household("home-1")),
            lists = listOf(shoppingList("list-1", "home-1")),
            items = listOf(item("item-1", "list-1", "Leche remota")),
        )
        dao.upsertItemAndEnqueue(
            item("item-1", "list-1", "Leche local"),
            operation("update-operation", createdAt = 100).copy(itemId = "item-1"),
        )

        dao.replaceHouseholds(listOf(household("home-1").copy(name = "Casa actualizada")))
        assertEquals("Leche local", dao.items("list-1").single().name)
        assertEquals(1, dao.pendingOperations().size)

        dao.replaceLists("home-1", listOf(shoppingList("list-1", "home-1").copy(name = "Compra actualizada")))
        assertEquals("Leche local", dao.items("list-1").single().name)
        assertEquals(1, dao.pendingOperations().size)

        dao.replaceLists("home-1", emptyList())
        assertEquals("Leche local", dao.items("list-1").single().name)

        dao.replaceHouseholds(emptyList())
        assertEquals("Leche local", dao.items("list-1").single().name)
        assertEquals(1, dao.pendingOperations().size)
    }

    @Test
    fun `full server snapshot preserves pending local items and operations`() = runTest {
        dao.replaceServerSnapshot(
            households = listOf(household("home-1")),
            lists = listOf(shoppingList("list-1", "home-1")),
            items = listOf(item("item-1", "list-1", "Leche remota")),
        )
        dao.upsertItemAndEnqueue(
            item("item-1", "list-1", "Leche local"),
            operation("update-operation", createdAt = 100).copy(itemId = "item-1"),
        )

        dao.replaceServerSnapshot(
            households = listOf(household("home-1").copy(name = "Casa actualizada")),
            lists = listOf(shoppingList("list-1", "home-1").copy(name = "Compra actualizada")),
            items = listOf(item("item-1", "list-1", "Leche remota nueva")),
        )

        assertEquals("Leche local", dao.items("list-1").single().name)
        assertEquals("update-operation", dao.pendingOperations().single().operationId)
    }

    @Test
    fun `pending operations are ordered by creation time then increasing database sequence`() = runTest {
        val secondAtSameTime = dao.enqueue(
            operation("operation-b", createdAt = 200),
        )
        val firstAtSameTime = dao.enqueue(
            operation("operation-a", createdAt = 200),
        )
        val earliest = dao.enqueue(
            operation("operation-c", createdAt = 100),
        )

        val queued = dao.pendingOperations()

        assertTrue(secondAtSameTime < firstAtSameTime)
        assertNotNull(earliest)
        assertEquals(
            listOf("operation-c", "operation-b", "operation-a"),
            queued.map { it.operationId },
        )
        assertTrue(queued.all { it.state == PendingOperationState.PENDING })
    }

    @Test
    fun `an operation can transition with conflict metadata and then be deleted`() = runTest {
        val id = dao.enqueue(operation("operation-1", createdAt = 100))

        dao.transitionOperation(
            id = id,
            state = PendingOperationState.CONFLICT,
            attempts = 2,
            serverItemJson = """{"id":"item-1","version":8}""",
        )

        val conflicted = dao.pendingOperations().single()
        assertEquals(PendingOperationState.CONFLICT, conflicted.state)
        assertEquals(2, conflicted.attempts)
        assertEquals("""{"id":"item-1","version":8}""", conflicted.serverItemJson)

        dao.deleteOperation(id)
        assertTrue(dao.pendingOperations().isEmpty())
    }

    @Test
    fun `persistent databases isolate cached rows and operations by account`() = runTest {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val suffix = UUID.randomUUID().toString()
        val accountA = NfCompraDatabase.create(context, "account-a-$suffix")
        val accountB = NfCompraDatabase.create(context, "account-b-$suffix")
        accountA.shoppingDao().replaceServerSnapshot(
            households = listOf(household("home-a")),
            lists = listOf(shoppingList("list-a", "home-a")),
            items = listOf(item("item-a", "list-a", "Privado A")),
        )
        accountA.shoppingDao().enqueue(
            operation("operation-a", createdAt = 100).copy(
                listId = "list-a",
                itemId = "item-a",
            ),
        )

        assertTrue(accountB.shoppingDao().households().isEmpty())
        assertTrue(accountB.shoppingDao().pendingOperations().isEmpty())
    }

    private fun household(id: String) = LocalHousehold(
        id = id,
        name = "Casa",
        ownerId = "owner-1",
        createdAt = "2026-07-27T00:00:00Z",
        updatedAt = "2026-07-27T00:00:00Z",
    )

    private fun shoppingList(id: String, householdId: String) = LocalShoppingList(
        id = id,
        householdId = householdId,
        name = "Compra",
        isDefault = true,
        version = 1,
        createdAt = "2026-07-27T00:00:00Z",
        updatedAt = "2026-07-27T00:00:00Z",
    )

    private fun item(id: String, listId: String, name: String) = LocalShoppingItem(
        id = id,
        listId = listId,
        name = name,
        normalizedName = name.lowercase(),
        quantity = 1.0,
        unit = null,
        category = null,
        note = null,
        isChecked = false,
        position = 0,
        version = 1,
        createdBy = "user-1",
        updatedBy = "user-1",
        createdAt = "2026-07-27T00:00:00Z",
        updatedAt = "2026-07-27T00:00:00Z",
    )

    private fun operation(operationId: String, createdAt: Long) = PendingOperation(
        operationId = operationId,
        type = PendingOperationType.UPDATE,
        listId = "list-1",
        itemId = "item-1",
        payloadJson = "{}",
        createdAt = createdAt,
    )
}

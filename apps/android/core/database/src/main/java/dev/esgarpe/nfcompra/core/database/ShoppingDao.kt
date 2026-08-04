package dev.esgarpe.nfcompra.core.database

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

data class OperationReconciliation(
    val serverItem: LocalShoppingItem?,
    val replacementOperations: List<PendingOperation> = emptyList(),
)

@Dao
abstract class ShoppingDao {
    @Upsert
    protected abstract suspend fun upsertHouseholds(households: List<LocalHousehold>)

    @Upsert
    protected abstract suspend fun upsertLists(lists: List<LocalShoppingList>)

    @Upsert
    protected abstract suspend fun upsertItems(items: List<LocalShoppingItem>)

    @Upsert
    protected abstract suspend fun upsertSnapshot(snapshot: SnapshotMetadata)

    @Query("DELETE FROM shopping_items")
    protected abstract suspend fun deleteAllItems()

    @Query("DELETE FROM shopping_lists")
    protected abstract suspend fun deleteAllLists()

    @Query("DELETE FROM households")
    protected abstract suspend fun deleteAllHouseholds()

    @Query("DELETE FROM households WHERE id NOT IN (:ids)")
    protected abstract suspend fun deleteHouseholdsNotIn(ids: List<String>)

    @Query("DELETE FROM shopping_lists WHERE householdId = :householdId")
    protected abstract suspend fun deleteLists(householdId: String)

    @Query("DELETE FROM shopping_lists WHERE householdId = :householdId AND id NOT IN (:ids)")
    protected abstract suspend fun deleteListsNotIn(householdId: String, ids: List<String>)

    @Query("DELETE FROM shopping_items WHERE listId = :listId")
    protected abstract suspend fun deleteItems(listId: String)

    @Query("SELECT * FROM shopping_items WHERE listId = :listId")
    protected abstract suspend fun cachedItemsForReplacement(listId: String): List<LocalShoppingItem>

    @Query("SELECT * FROM pending_operations WHERE listId = :listId ORDER BY createdAt, id")
    protected abstract suspend fun operationsForReplacement(listId: String): List<PendingOperation>

    @Query("SELECT * FROM households")
    protected abstract suspend fun allHouseholdsForReplacement(): List<LocalHousehold>

    @Query("SELECT * FROM shopping_lists")
    protected abstract suspend fun allListsForReplacement(): List<LocalShoppingList>

    @Query("SELECT * FROM shopping_items")
    protected abstract suspend fun allItemsForReplacement(): List<LocalShoppingItem>

    @Query(
        """
        DELETE FROM snapshot_metadata
        WHERE collectionKey LIKE 'lists:%'
          AND NOT EXISTS (
              SELECT 1 FROM households
              WHERE snapshot_metadata.collectionKey = 'lists:' || households.id
          )
        """,
    )
    protected abstract suspend fun deleteOrphanedListSnapshots()

    @Query(
        """
        DELETE FROM snapshot_metadata
        WHERE collectionKey LIKE 'items:%'
          AND NOT EXISTS (
              SELECT 1 FROM shopping_lists
              WHERE snapshot_metadata.collectionKey = 'items:' || shopping_lists.id
          )
        """,
    )
    protected abstract suspend fun deleteOrphanedItemSnapshots()

    @Transaction
    open suspend fun replaceServerSnapshot(
        households: List<LocalHousehold>,
        lists: List<LocalShoppingList>,
        items: List<LocalShoppingItem>,
        snapshotAt: Long = System.currentTimeMillis(),
    ) {
        val operations = pendingOperations()
        val protectedItemIds = operations.mapTo(mutableSetOf()) { it.itemId }
        val localItems = allItemsForReplacement().filter { it.id in protectedItemIds }
        val protectedListIds = operations.mapTo(mutableSetOf()) { it.listId }
        protectedListIds += localItems.map { it.listId }
        val localLists = allListsForReplacement().filter { it.id in protectedListIds }
        val protectedHouseholdIds = localLists.mapTo(mutableSetOf()) { it.householdId }
        val localHouseholds = allHouseholdsForReplacement().filter { it.id in protectedHouseholdIds }
        val mergedHouseholds = households + localHouseholds.filter { local -> households.none { it.id == local.id } }
        val mergedLists = lists + localLists.filter { local -> lists.none { it.id == local.id } }
        val mergedItems = items.filterNot { it.id in protectedItemIds } + localItems
        deleteAllItems()
        deleteAllLists()
        deleteAllHouseholds()
        upsertHouseholds(mergedHouseholds)
        upsertLists(mergedLists)
        upsertItems(mergedItems)
        deleteOrphanedSnapshotMetadata()
        upsertSnapshot(SnapshotMetadata(SnapshotCollection.HOUSEHOLDS, snapshotAt))
        households.forEach {
            upsertSnapshot(SnapshotMetadata(SnapshotCollection.lists(it.id), snapshotAt))
        }
        lists.forEach {
            upsertSnapshot(SnapshotMetadata(SnapshotCollection.items(it.id), snapshotAt))
        }
    }

    @Transaction
    open suspend fun replaceHouseholds(
        households: List<LocalHousehold>,
        snapshotAt: Long = System.currentTimeMillis(),
    ) {
        val protectedListIds = pendingOperations().mapTo(mutableSetOf()) { it.listId }
        val protectedHouseholdIds = allListsForReplacement()
            .filter { it.id in protectedListIds }
            .mapTo(mutableSetOf()) { it.householdId }
        val retainedIds = households.mapTo(protectedHouseholdIds) { it.id }
        upsertHouseholds(households)
        if (retainedIds.isEmpty()) deleteAllHouseholds()
        else deleteHouseholdsNotIn(retainedIds.toList())
        deleteOrphanedSnapshotMetadata()
        upsertSnapshot(SnapshotMetadata(SnapshotCollection.HOUSEHOLDS, snapshotAt))
    }

    @Transaction
    open suspend fun replaceLists(
        householdId: String,
        lists: List<LocalShoppingList>,
        snapshotAt: Long = System.currentTimeMillis(),
    ) {
        val localListIds = allListsForReplacement()
            .filter { it.householdId == householdId }
            .mapTo(mutableSetOf()) { it.id }
        val protectedListIds = pendingOperations()
            .mapTo(mutableSetOf()) { it.listId }
            .intersect(localListIds)
        val retainedIds = lists.mapTo(protectedListIds.toMutableSet()) { it.id }
        upsertLists(lists)
        if (retainedIds.isEmpty()) deleteLists(householdId)
        else deleteListsNotIn(householdId, retainedIds.toList())
        deleteOrphanedSnapshotMetadata()
        upsertSnapshot(SnapshotMetadata(SnapshotCollection.lists(householdId), snapshotAt))
    }

    @Transaction
    open suspend fun replaceItems(
        listId: String,
        items: List<LocalShoppingItem>,
        snapshotAt: Long = System.currentTimeMillis(),
    ) {
        val protectedIds = operationsForReplacement(listId).mapTo(mutableSetOf()) { it.itemId }
        val localPendingItems = cachedItemsForReplacement(listId).filter { it.id in protectedIds }
        val merged = items.filterNot { it.id in protectedIds } + localPendingItems
        deleteItems(listId)
        upsertItems(merged)
        upsertSnapshot(SnapshotMetadata(SnapshotCollection.items(listId), snapshotAt))
    }

    private suspend fun deleteOrphanedSnapshotMetadata() {
        deleteOrphanedListSnapshots()
        deleteOrphanedItemSnapshots()
    }

    @Query("SELECT * FROM snapshot_metadata WHERE collectionKey = :collectionKey")
    abstract suspend fun snapshot(collectionKey: String): SnapshotMetadata?

    @Transaction
    open suspend fun upsertHousehold(household: LocalHousehold) {
        upsertHouseholds(listOf(household))
    }

    @Transaction
    open suspend fun upsertHouseholdAndList(
        household: LocalHousehold,
        list: LocalShoppingList,
    ) {
        upsertHouseholds(listOf(household))
        upsertLists(listOf(list))
    }

    @Transaction
    open suspend fun upsertList(list: LocalShoppingList) {
        upsertLists(listOf(list))
    }

    @Query("DELETE FROM shopping_lists WHERE id = :listId")
    abstract suspend fun deleteListById(listId: String)

    @Query("DELETE FROM shopping_items WHERE listId = :listId AND isChecked = 1")
    abstract suspend fun deleteCheckedItems(listId: String): Int

    @Query("SELECT * FROM households ORDER BY name, id")
    abstract fun observeHouseholds(): Flow<List<LocalHousehold>>

    @Query("SELECT * FROM shopping_lists WHERE householdId = :householdId ORDER BY isDefault DESC, name, id")
    abstract fun observeLists(householdId: String): Flow<List<LocalShoppingList>>

    @Query("SELECT * FROM shopping_items WHERE listId = :listId ORDER BY position, id")
    abstract fun observeItems(listId: String): Flow<List<LocalShoppingItem>>

    @Query("SELECT * FROM pending_operations WHERE listId = :listId ORDER BY createdAt, id")
    abstract fun observeOperations(listId: String): Flow<List<PendingOperation>>

    @Query("SELECT * FROM households ORDER BY name, id")
    abstract suspend fun households(): List<LocalHousehold>

    @Query("SELECT * FROM shopping_lists WHERE householdId = :householdId ORDER BY isDefault DESC, name, id")
    abstract suspend fun lists(householdId: String): List<LocalShoppingList>

    @Query("SELECT * FROM shopping_lists WHERE id = :listId")
    abstract suspend fun list(listId: String): LocalShoppingList?

    @Query("SELECT * FROM shopping_items WHERE listId = :listId ORDER BY position, id")
    abstract suspend fun items(listId: String): List<LocalShoppingItem>

    @Query("SELECT * FROM shopping_items WHERE id = :itemId")
    abstract suspend fun item(itemId: String): LocalShoppingItem?

    @Query("SELECT COALESCE(MAX(position), -1) FROM shopping_items WHERE listId = :listId")
    abstract suspend fun maxItemPosition(listId: String): Int

    @Query("SELECT * FROM pending_operations ORDER BY createdAt, id")
    abstract suspend fun pendingOperations(): List<PendingOperation>

    @Query("SELECT * FROM pending_operations WHERE state = 'pending' ORDER BY createdAt, id LIMIT 1")
    abstract suspend fun nextPendingOperation(): PendingOperation?

    @Insert(onConflict = OnConflictStrategy.ABORT)
    abstract suspend fun enqueue(operation: PendingOperation): Long

    @Upsert
    protected abstract suspend fun upsertItem(item: LocalShoppingItem)

    @Upsert
    protected abstract suspend fun upsertOperations(operations: List<PendingOperation>)

    @Query("DELETE FROM shopping_items WHERE id = :itemId")
    protected abstract suspend fun deleteItem(itemId: String)

    @Transaction
    open suspend fun upsertItemAndEnqueue(
        item: LocalShoppingItem,
        operation: PendingOperation,
    ): Long {
        upsertItem(item)
        return enqueue(operation)
    }

    @Transaction
    open suspend fun deleteItemAndEnqueue(
        itemId: String,
        operation: PendingOperation,
    ): Long {
        deleteItem(itemId)
        return enqueue(operation)
    }

    @Query(
        """
        UPDATE pending_operations
        SET state = :state, attempts = :attempts, serverItemJson = :serverItemJson
        WHERE id = :id
        """,
    )
    abstract suspend fun transitionOperation(
        id: Long,
        state: String,
        attempts: Int,
        serverItemJson: String? = null,
    )

    @Query("DELETE FROM pending_operations WHERE id = :id")
    abstract suspend fun deleteOperation(id: Long)

    @Transaction
    open suspend fun completeOperation(
        operationId: Long,
        localItemId: String,
        serverItem: LocalShoppingItem?,
        replacementOperations: List<PendingOperation> = emptyList(),
    ) {
        if (serverItem == null) {
            deleteItem(localItemId)
        } else {
            if (serverItem.id != localItemId) deleteItem(localItemId)
            upsertItem(serverItem)
        }
        upsertOperations(replacementOperations)
        deleteOperation(operationId)
    }

    @Transaction
    open suspend fun reconcileOperation(
        operationId: Long,
        localItemId: String,
        reconcile: (List<PendingOperation>) -> OperationReconciliation,
    ) {
        val result = reconcile(pendingOperations())
        if (result.serverItem == null) {
            deleteItem(localItemId)
        } else {
            if (result.serverItem.id != localItemId) deleteItem(localItemId)
            upsertItem(result.serverItem)
        }
        upsertOperations(result.replacementOperations)
        deleteOperation(operationId)
    }

    @Transaction
    open suspend fun replaceOperation(
        operationId: Long,
        replacement: PendingOperation,
    ): Long {
        deleteOperation(operationId)
        return enqueue(replacement)
    }
}

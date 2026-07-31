package dev.esgarpe.nfcompra.core.database

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(tableName = "households")
data class LocalHousehold(
    @PrimaryKey val id: String,
    val name: String,
    val ownerId: String,
    val createdAt: String,
    val updatedAt: String,
)

@Entity(
    tableName = "shopping_lists",
    foreignKeys = [
        ForeignKey(
            entity = LocalHousehold::class,
            parentColumns = ["id"],
            childColumns = ["householdId"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
    indices = [Index("householdId")],
)
data class LocalShoppingList(
    @PrimaryKey val id: String,
    val householdId: String,
    val name: String,
    val isDefault: Boolean,
    val version: Int,
    val createdAt: String,
    val updatedAt: String,
)

@Entity(
    tableName = "shopping_items",
    foreignKeys = [
        ForeignKey(
            entity = LocalShoppingList::class,
            parentColumns = ["id"],
            childColumns = ["listId"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
    indices = [Index("listId")],
)
data class LocalShoppingItem(
    @PrimaryKey val id: String,
    val listId: String,
    val name: String,
    val normalizedName: String,
    val quantity: Double,
    val unit: String?,
    val category: String?,
    val note: String?,
    val isChecked: Boolean,
    val position: Int,
    val version: Int,
    val createdBy: String,
    val updatedBy: String,
    val createdAt: String,
    val updatedAt: String,
)

@Entity(
    tableName = "pending_operations",
    indices = [
        Index(value = ["operationId"], unique = true),
        Index("listId"),
        Index("itemId"),
        Index(value = ["state", "createdAt", "id"]),
    ],
)
data class PendingOperation(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val operationId: String,
    val type: String,
    val listId: String,
    val itemId: String,
    val payloadJson: String,
    val createdAt: Long,
    val attempts: Int = 0,
    val state: String = PendingOperationState.PENDING,
    val serverItemJson: String? = null,
)

@Entity(tableName = "snapshot_metadata")
data class SnapshotMetadata(
    @PrimaryKey val collectionKey: String,
    val updatedAt: Long,
)

object SnapshotCollection {
    const val HOUSEHOLDS = "households"

    fun lists(householdId: String) = "lists:$householdId"
    fun items(listId: String) = "items:$listId"
}

object PendingOperationType {
    const val CREATE = "create"
    const val UPDATE = "update"
    const val DELETE = "delete"
}

object PendingOperationState {
    const val PENDING = "pending"
    const val SYNCING = "syncing"
    const val CONFLICT = "conflict"
    const val FAILED = "failed"
}

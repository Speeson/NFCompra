package dev.esgarpe.nfcompra.feature.shoppinglist

import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import retrofit2.Response
import java.io.IOException
import java.util.UUID

data class HouseholdUiModel(val id: String, val name: String)
data class ShoppingListSummaryUiModel(val id: String, val householdId: String, val name: String)

class ShoppingListApiException(
    val status: Int,
    val code: String?,
    override val message: String,
    val current: ShoppingListItemUiModel? = null,
) : IOException(message)

class ShoppingListRepository(private val api: ShoppingListApi) {
    suspend fun households(): List<HouseholdUiModel> = api.households().bodyOrThrow().households.map { HouseholdUiModel(it.id, it.name) }
    suspend fun lists(householdId: String): List<ShoppingListSummaryUiModel> = api.lists(householdId).bodyOrThrow().lists.map { ShoppingListSummaryUiModel(it.id, it.householdId, it.name) }

    fun observeItems(listId: String): Flow<List<ShoppingListItemUiModel>> = flow {
        emit(api.items(listId).bodyOrThrow().items.map(::toUiModel))
    }

    suspend fun createHousehold(name: String): Pair<HouseholdUiModel, ShoppingListSummaryUiModel> {
        val response = api.createHousehold(CreateHouseholdRequest(name)).bodyOrThrow()
        return HouseholdUiModel(response.household.id, response.household.name) to response.defaultList.toUiModel()
    }

    suspend fun createList(householdId: String, name: String): ShoppingListSummaryUiModel =
        api.createList(householdId, CreateListRequest(name)).bodyOrThrow().list.toUiModel()

    suspend fun createItem(listId: String, name: String) {
        api.createItem(listId, CreateItemRequest(name = name, operationId = UUID.randomUUID().toString())).bodyOrThrow()
    }

    suspend fun updateItem(item: ShoppingListItemUiModel, name: String? = null, checked: Boolean? = null) {
        api.updateItem(item.id, UpdateItemRequest(name = name, isChecked = checked, expectedVersion = item.version, operationId = UUID.randomUUID().toString())).bodyOrThrow()
    }

    suspend fun deleteItem(item: ShoppingListItemUiModel) {
        api.deleteItem(item.id, DeleteItemRequest(item.version, UUID.randomUUID().toString())).bodyOrThrow()
    }

    private fun ShoppingListDto.toUiModel() = ShoppingListSummaryUiModel(id, householdId, name)

    private fun toUiModel(item: ShoppingItemDto) = ShoppingListItemUiModel(
        id = item.id,
        name = item.name,
        quantity = item.quantity.toString().removeSuffix(".0") + (item.unit?.let { " $it" } ?: ""),
        checked = item.isChecked,
        version = item.version,
    )

    private fun <T> Response<T>.bodyOrThrow(): T {
        body()?.let { return it }
        val error = errorBody()?.string()?.let(errorAdapter::fromJson)
        val details = error?.error?.details?.current?.let(::toUiModel)
        throw ShoppingListApiException(
            status = code(),
            code = error?.error?.code,
            message = error?.error?.message ?: "No se pudo completar la operaciÃ³n.",
            current = details,
        )
    }

    private companion object {
        val errorAdapter = Moshi.Builder().addLast(KotlinJsonAdapterFactory()).build().adapter(ErrorResponse::class.java)
    }
}

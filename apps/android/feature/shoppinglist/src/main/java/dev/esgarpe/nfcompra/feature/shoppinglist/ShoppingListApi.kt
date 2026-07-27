package dev.esgarpe.nfcompra.feature.shoppinglist

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.HTTP
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path

data class HouseholdDto(val id: String, val name: String, val ownerId: String, val createdAt: String, val updatedAt: String)
data class ShoppingListDto(val id: String, val householdId: String, val name: String, val isDefault: Boolean, val version: Int, val createdAt: String, val updatedAt: String)
data class ShoppingItemDto(
    val id: String, val listId: String, val name: String, val normalizedName: String,
    val quantity: Double, val unit: String?, val category: String?, val note: String?,
    val isChecked: Boolean, val position: Int, val version: Int, val createdBy: String,
    val updatedBy: String, val createdAt: String, val updatedAt: String,
)

data class HouseholdsResponse(val households: List<HouseholdDto>)
data class ListsResponse(val lists: List<ShoppingListDto>)
data class ItemsResponse(val items: List<ShoppingItemDto>)
data class HouseholdResponse(val household: HouseholdDto, val defaultList: ShoppingListDto)
data class ListResponse(val list: ShoppingListDto)
data class ItemResponse(val item: ShoppingItemDto)
data class ErrorResponse(val error: ApiError)
data class ApiError(val code: String, val message: String, val details: ApiErrorDetails = ApiErrorDetails())
data class ApiErrorDetails(val current: ShoppingItemDto? = null)
data class CreateHouseholdRequest(val name: String)
data class CreateListRequest(val name: String)
data class CreateItemRequest(val name: String, val quantity: Double = 1.0, val unit: String? = null, val operationId: String)
data class UpdateItemRequest(val name: String? = null, val quantity: Double? = null, val unit: String? = null, val isChecked: Boolean? = null, val expectedVersion: Int, val operationId: String)
data class DeleteItemRequest(val expectedVersion: Int, val operationId: String)

interface ShoppingListApi {
    @GET("v1/households") suspend fun households(): Response<HouseholdsResponse>
    @POST("v1/households") suspend fun createHousehold(@Body request: CreateHouseholdRequest): Response<HouseholdResponse>
    @GET("v1/households/{householdId}/lists") suspend fun lists(@Path("householdId") householdId: String): Response<ListsResponse>
    @POST("v1/households/{householdId}/lists") suspend fun createList(@Path("householdId") householdId: String, @Body request: CreateListRequest): Response<ListResponse>
    @GET("v1/lists/{listId}/items") suspend fun items(@Path("listId") listId: String): Response<ItemsResponse>
    @POST("v1/lists/{listId}/items") suspend fun createItem(@Path("listId") listId: String, @Body request: CreateItemRequest): Response<ItemResponse>
    @PATCH("v1/items/{itemId}") suspend fun updateItem(@Path("itemId") itemId: String, @Body request: UpdateItemRequest): Response<ItemResponse>
    @HTTP(method = "DELETE", path = "v1/items/{itemId}", hasBody = true)
    suspend fun deleteItem(@Path("itemId") itemId: String, @Body request: DeleteItemRequest): Response<Unit>
}

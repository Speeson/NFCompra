package dev.esgarpe.nfcompra.feature.shoppinglist

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.HTTP
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

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
data class HouseholdResponse(val household: HouseholdDto)
data class ListResponse(val list: ShoppingListDto)
data class ItemResponse(val item: ShoppingItemDto)
data class DeleteCheckedItemsResponse(val removed: Int)
data class ErrorResponse(val error: ApiError)
data class ApiError(val code: String, val message: String, val details: ApiErrorDetails = ApiErrorDetails())
data class ApiErrorDetails(val current: ShoppingItemDto? = null)
data class CreateHouseholdRequest(val name: String)
data class UpdateHouseholdRequest(val name: String)
data class CreateListRequest(val name: String)
data class UpdateListRequest(val name: String, val expectedVersion: Int, val operationId: String)
data class DeleteListRequest(val expectedVersion: Int, val operationId: String)
data class DeleteCheckedItemsRequest(val operationId: String)
data class CreateItemRequest(val name: String, val quantity: Double = 1.0, val unit: String? = null, val operationId: String)
data class UpdateItemRequest(val name: String? = null, val quantity: Double? = null, val unit: String? = null, val isChecked: Boolean? = null, val expectedVersion: Int, val operationId: String)
data class DeleteItemRequest(val expectedVersion: Int, val operationId: String)
data class ProductCatalogItemDto(
    val id: String,
    val name: String,
    val normalizedName: String,
    val categoryId: String?,
    val categoryName: String?,
    val iconKey: String,
    val brand: String?,
    val packageSize: String?,
    val source: String?,
    val sourceProductId: String?,
    val isFavorite: Boolean = false,
)
data class ProductCatalogSearchResponse(val products: List<ProductCatalogItemDto>)
data class ProductCatalogSnapshotResponse(val version: String, val productCount: Int, val products: List<ProductCatalogItemDto>)
data class ProductCategoryDto(
    val id: String,
    val name: String,
    val normalizedName: String,
    val iconKey: String,
    val source: String?,
    val sourceCategoryId: String?,
    val isFavorite: Boolean = false,
)
data class ProductCategoriesResponse(val categories: List<ProductCategoryDto>)
data class MeUserDto(val id: String, val email: String, val name: String, val username: String?)
data class MeResponse(val user: MeUserDto)

interface ShoppingListApi {
    @GET("v1/households") suspend fun households(): Response<HouseholdsResponse>
    @POST("v1/households") suspend fun createHousehold(@Body request: CreateHouseholdRequest): Response<HouseholdResponse>
    @PATCH("v1/households/{householdId}") suspend fun updateHousehold(@Path("householdId") householdId: String, @Body request: UpdateHouseholdRequest): Response<HouseholdResponse>
    @HTTP(method = "DELETE", path = "v1/households/{householdId}")
    suspend fun deleteHousehold(@Path("householdId") householdId: String): Response<Unit>
    @GET("v1/households/{householdId}/lists") suspend fun lists(@Path("householdId") householdId: String): Response<ListsResponse>
    @POST("v1/households/{householdId}/lists") suspend fun createList(@Path("householdId") householdId: String, @Body request: CreateListRequest): Response<ListResponse>
    @PATCH("v1/lists/{listId}") suspend fun updateList(@Path("listId") listId: String, @Body request: UpdateListRequest): Response<ListResponse>
    @HTTP(method = "DELETE", path = "v1/lists/{listId}", hasBody = true)
    suspend fun deleteList(@Path("listId") listId: String, @Body request: DeleteListRequest): Response<Unit>
    @GET("v1/lists/{listId}/items") suspend fun items(@Path("listId") listId: String): Response<ItemsResponse>
    @POST("v1/lists/{listId}/items") suspend fun createItem(@Path("listId") listId: String, @Body request: CreateItemRequest): Response<ItemResponse>
    @HTTP(method = "DELETE", path = "v1/lists/{listId}/items/checked", hasBody = true)
    suspend fun deleteCheckedItems(@Path("listId") listId: String, @Body request: DeleteCheckedItemsRequest): Response<DeleteCheckedItemsResponse>
    @PATCH("v1/items/{itemId}") suspend fun updateItem(@Path("itemId") itemId: String, @Body request: UpdateItemRequest): Response<ItemResponse>
    @HTTP(method = "DELETE", path = "v1/items/{itemId}", hasBody = true)
    suspend fun deleteItem(@Path("itemId") itemId: String, @Body request: DeleteItemRequest): Response<Unit>
    @GET("v1/product-catalog") suspend fun searchProductCatalog(@Query("search") search: String, @Query("limit") limit: Int): Response<ProductCatalogSearchResponse>
    @GET("v1/product-catalog/snapshot") suspend fun productCatalogSnapshot(): Response<ProductCatalogSnapshotResponse>
    @GET("v1/product-categories") suspend fun productCategories(): Response<ProductCategoriesResponse>
    @POST("v1/product-catalog/{productId}/favorite") suspend fun addProductFavorite(@Path("productId") productId: String): Response<ProductFavoriteResponse>
    @HTTP(method = "DELETE", path = "v1/product-catalog/{productId}/favorite")
    suspend fun removeProductFavorite(@Path("productId") productId: String): Response<ProductFavoriteResponse>
    @GET("v1/me") suspend fun me(): Response<MeResponse>
}

data class ProductFavoriteResponse(val productId: String, val isFavorite: Boolean)

package dev.esgarpe.nfcompra.feature.sharing

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path

data class MemberDto(val userId: String, val name: String, val email: String, val role: String, val createdAt: String)
data class InvitationDto(val id: String, val householdId: String, val email: String, val status: String, val expiresAt: String, val invitedBy: String, val createdAt: String)
data class NotificationDto(val id: String, val type: String, val title: String, val body: String, val householdId: String?, val listId: String?, val invitationId: String?, val readAt: String?, val createdAt: String)
data class MembersResponse(val members: List<MemberDto>)
data class InvitationsResponse(val invitations: List<InvitationDto>)
data class InvitationResponse(val invitation: InvitationDto)
data class NotificationsResponse(val notifications: List<NotificationDto>)
data class UnreadCountResponse(val count: Int)
data class InviteRequest(val email: String)
data class AcceptanceResponse(val invitation: InvitationDto, val householdId: String)
data class SharingErrorResponse(val error: SharingError)
data class SharingError(val code: String, val message: String)

interface SharingApi {
    @GET("v1/households/{householdId}/members") suspend fun members(@Path("householdId") householdId: String): Response<MembersResponse>
    @GET("v1/households/{householdId}/invitations") suspend fun invitations(@Path("householdId") householdId: String): Response<InvitationsResponse>
    @POST("v1/households/{householdId}/invitations") suspend fun invite(@Path("householdId") householdId: String, @Body request: InviteRequest): Response<InvitationResponse>
    @DELETE("v1/households/{householdId}/invitations/{invitationId}") suspend fun revoke(@Path("householdId") householdId: String, @Path("invitationId") invitationId: String): Response<Unit>
    @DELETE("v1/households/{householdId}/members/{userId}") suspend fun removeMember(@Path("householdId") householdId: String, @Path("userId") userId: String): Response<Unit>
    @POST("v1/invitations/accept") suspend fun accept(@Body request: Map<String, String>): Response<AcceptanceResponse>
    @POST("v1/invitations/{invitationId}/accept") suspend fun acceptById(@Path("invitationId") invitationId: String): Response<AcceptanceResponse>
    @GET("v1/notifications") suspend fun notifications(): Response<NotificationsResponse>
    @GET("v1/notifications/unread-count") suspend fun unreadCount(): Response<UnreadCountResponse>
    @PATCH("v1/notifications/{notificationId}/read") suspend fun markRead(@Path("notificationId") notificationId: String): Response<Unit>
    @POST("v1/notifications/read-all") suspend fun markAllRead(): Response<Unit>
}

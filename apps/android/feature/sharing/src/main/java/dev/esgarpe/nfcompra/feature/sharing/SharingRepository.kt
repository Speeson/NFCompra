package dev.esgarpe.nfcompra.feature.sharing

import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import retrofit2.Response
import java.io.IOException

data class MemberUiModel(val userId: String, val name: String, val email: String, val role: String)
data class InvitationUiModel(val id: String, val email: String, val status: String, val expiresAt: String)
data class NotificationUiModel(val id: String, val title: String, val body: String, val isRead: Boolean, val householdId: String?, val listId: String?, val invitationId: String?)
data class InvitationAcceptance(val householdId: String)

class SharingApiException(val status: Int, val code: String?, override val message: String) : IOException(message)

interface SharingDataSource {
    suspend fun members(householdId: String): List<MemberUiModel>
    suspend fun invitations(householdId: String): List<InvitationUiModel>
    suspend fun invite(householdId: String, email: String)
    suspend fun revoke(householdId: String, invitationId: String)
    suspend fun removeMember(householdId: String, userId: String)
    suspend fun accept(token: String): InvitationAcceptance
    suspend fun acceptById(invitationId: String): InvitationAcceptance
    suspend fun notifications(): List<NotificationUiModel>
    suspend fun unreadCount(): Int
    suspend fun markRead(notificationId: String)
    suspend fun markAllRead()
}

class SharingRepository(private val api: SharingApi) : SharingDataSource {
    override suspend fun members(householdId: String) = api.members(householdId).bodyOrThrow().members.map { MemberUiModel(it.userId, it.name, it.email, it.role) }
    override suspend fun invitations(householdId: String) = api.invitations(householdId).bodyOrThrow().invitations.map { InvitationUiModel(it.id, it.email, it.status, it.expiresAt) }
    override suspend fun invite(householdId: String, email: String) { api.invite(householdId, InviteRequest(email)).bodyOrThrow() }
    override suspend fun revoke(householdId: String, invitationId: String) { api.revoke(householdId, invitationId).bodyOrThrow() }
    override suspend fun removeMember(householdId: String, userId: String) { api.removeMember(householdId, userId).bodyOrThrow() }
    override suspend fun accept(token: String): InvitationAcceptance = api.accept(mapOf("token" to token)).bodyOrThrow().let { InvitationAcceptance(it.householdId) }
    override suspend fun acceptById(invitationId: String): InvitationAcceptance = api.acceptById(invitationId).bodyOrThrow().let { InvitationAcceptance(it.householdId) }
    override suspend fun notifications() = api.notifications().bodyOrThrow().notifications.map { NotificationUiModel(it.id, it.title, it.body, it.readAt != null, it.householdId, it.listId, it.invitationId) }
    override suspend fun unreadCount() = api.unreadCount().bodyOrThrow().count
    override suspend fun markRead(notificationId: String) { api.markRead(notificationId).bodyOrThrow() }
    override suspend fun markAllRead() { api.markAllRead().bodyOrThrow() }

    private fun <T> Response<T>.bodyOrThrow(): T {
        body()?.let { return it }
        val error = errorBody()?.string()?.let(errorAdapter::fromJson)?.error
        throw SharingApiException(code(), error?.code, error?.message ?: "No se pudo completar la operación.")
    }
    private companion object { val errorAdapter = Moshi.Builder().addLast(KotlinJsonAdapterFactory()).build().adapter(SharingErrorResponse::class.java) }
}

package dev.esgarpe.nfcompra.feature.sharing

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.CompletableDeferred
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SharingViewModelTest {
    @Before fun setUp() { kotlinx.coroutines.Dispatchers.setMain(StandardTestDispatcher()) }
    @After fun tearDown() { kotlinx.coroutines.Dispatchers.resetMain() }

    @Test fun `invalid email stays actionable without calling the API`() = runTest {
        val viewModel = SharingViewModel(FakeSharingRepository(), "home-1")
        viewModel.onAction(SharingAction.Invite("not-an-email"))
        advanceUntilIdle()
        assertEquals(SharingUiState.Error("Introduce un correo válido."), viewModel.state.value)
    }

    @Test fun `member state is read only and notification navigation contains only context IDs`() = runTest {
        val repository = FakeSharingRepository(member = false)
        val viewModel = SharingViewModel(repository, "home-1")
        viewModel.refresh()
        advanceUntilIdle()
        viewModel.onAction(SharingAction.RemoveMember("member-1"))
        assertEquals(0, repository.removals)
        viewModel.onAction(SharingAction.OpenNotification("notice-1"))
        advanceUntilIdle()
        assertEquals(SharingNavigation.ListContext("home-1", "list-1"), viewModel.navigation.value)
    }

    @Test fun `owner can invite after a loaded owner state`() = runTest {
        val repository = FakeSharingRepository()
        val viewModel = SharingViewModel(repository, "home-1", "owner")
        viewModel.refresh()
        advanceUntilIdle()
        viewModel.onAction(SharingAction.Invite("bea@example.com"))
        advanceUntilIdle()
        assertEquals(1, repository.invites)
    }

    @Test fun `retry recovers a loading failure and foreground refreshes notifications`() = runTest {
        val repository = FakeSharingRepository().apply { failMembers = true }
        val viewModel = SharingViewModel(repository, "home-1", "owner")
        viewModel.refresh()
        advanceUntilIdle()
        assertEquals(SharingUiState.Error("No se pudo conectar con el servidor."), viewModel.state.value)
        repository.failMembers = false
        viewModel.onAction(SharingAction.Retry)
        advanceUntilIdle()
        assertEquals(2, repository.memberRequests)
        assertEquals(1, repository.notificationRequests)
    }

    @Test fun `notification-only foreground refresh does not request members`() = runTest {
        val repository = FakeSharingRepository()
        val viewModel = SharingViewModel(repository, null, "owner")
        viewModel.onForeground()
        advanceUntilIdle()
        assertEquals(0, repository.memberRequests)
        assertEquals(1, repository.notificationRequests)
    }

    @Test fun `global notification refresh can navigate to a list context`() = runTest {
        val repository = FakeSharingRepository()
        val viewModel = SharingViewModel(repository, null, "owner")
        viewModel.refreshNotifications()
        advanceUntilIdle()
        viewModel.onAction(SharingAction.OpenNotification("notice-1"))
        advanceUntilIdle()
        assertEquals(SharingNavigation.ListContext("home-1", "list-1"), viewModel.navigation.value)
    }

    @Test fun `accepting exposes loading and ignores a second acceptance until completion`() = runTest {
        val deferred = CompletableDeferred<InvitationAcceptance>()
        val repository = FakeSharingRepository().apply { acceptResult = deferred }
        val viewModel = SharingViewModel(repository, null, "owner")
        viewModel.onAction(SharingAction.AcceptInvitation("raw-token"))
        advanceUntilIdle()
        assertEquals(true, viewModel.isAccepting.value)
        viewModel.onAction(SharingAction.AcceptInvitation("raw-token"))
        advanceUntilIdle()
        assertEquals(1, repository.accepts)
        deferred.complete(InvitationAcceptance("home-2"))
        advanceUntilIdle()
        assertEquals(false, viewModel.isAccepting.value)
        assertEquals(SharingNavigation.HouseholdContext("home-2"), viewModel.navigation.value)
    }

    @Test fun `revoke read all and entry refresh perform their repository effects`() = runTest {
        val repository = FakeSharingRepository()
        val viewModel = SharingViewModel(repository, "home-1", "owner")
        viewModel.refresh(); advanceUntilIdle()
        viewModel.onAction(SharingAction.Revoke("invite-1"))
        viewModel.onAction(SharingAction.MarkAllRead)
        advanceUntilIdle()
        assertEquals(1, repository.revokes)
        assertEquals(1, repository.readAll)
        assertEquals(3, repository.notificationRequests)
    }
}

private class FakeSharingRepository(private val member: Boolean = true) : SharingDataSource {
    var removals = 0
    var invites = 0
    var revokes = 0
    var readAll = 0
    var accepts = 0
    var notificationRequests = 0
    var memberRequests = 0
    var failMembers = false
    var acceptResult: CompletableDeferred<InvitationAcceptance>? = null
    override suspend fun members(householdId: String): List<MemberUiModel> { memberRequests++; if (failMembers) throw IllegalStateException(); return listOf(MemberUiModel(if (member) "owner" else "other", "Ana", "ana@example.com", if (member) "owner" else "member")) }
    override suspend fun invitations(householdId: String) = emptyList<InvitationUiModel>()
    override suspend fun invite(householdId: String, email: String) { invites++ }
    override suspend fun revoke(householdId: String, invitationId: String) { revokes++ }
    override suspend fun removeMember(householdId: String, userId: String) { removals++ }
    override suspend fun accept(token: String): InvitationAcceptance { accepts++; return acceptResult?.await() ?: InvitationAcceptance("home-1") }
    override suspend fun acceptById(invitationId: String) = InvitationAcceptance("home-1")
    override suspend fun notifications(): List<NotificationUiModel> { notificationRequests++; return listOf(NotificationUiModel("notice-1", "Producto", "Leche", false, "home-1", "list-1", null)) }
    override suspend fun unreadCount() = 1
    override suspend fun markRead(notificationId: String) = Unit
    override suspend fun markAllRead() { readAll++ }
}

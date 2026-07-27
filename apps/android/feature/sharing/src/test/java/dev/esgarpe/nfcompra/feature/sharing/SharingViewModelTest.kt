package dev.esgarpe.nfcompra.feature.sharing

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
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
}

private class FakeSharingRepository(private val member: Boolean = true) : SharingDataSource {
    var removals = 0
    var invites = 0
    override suspend fun members(householdId: String) = listOf(MemberUiModel(if (member) "owner" else "other", "Ana", "ana@example.com", if (member) "owner" else "member"))
    override suspend fun invitations(householdId: String) = emptyList<InvitationUiModel>()
    override suspend fun invite(householdId: String, email: String) { invites++ }
    override suspend fun revoke(householdId: String, invitationId: String) = Unit
    override suspend fun removeMember(householdId: String, userId: String) { removals++ }
    override suspend fun accept(token: String) = InvitationAcceptance("home-1")
    override suspend fun acceptById(invitationId: String) = InvitationAcceptance("home-1")
    override suspend fun notifications() = listOf(NotificationUiModel("notice-1", "Producto", "Leche", false, "home-1", "list-1", null))
    override suspend fun unreadCount() = 1
    override suspend fun markRead(notificationId: String) = Unit
    override suspend fun markAllRead() = Unit
}

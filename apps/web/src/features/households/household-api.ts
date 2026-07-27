import { apiClient } from '../../api/session';

export type HouseholdMember = { userId: string; name: string; email: string; role: 'owner' | 'member'; createdAt: string };
export type Invitation = { id: string; householdId: string; email: string; status: 'pending' | 'accepted' | 'revoked' | 'expired'; expiresAt: string; invitedBy: string; createdAt: string };

export const memberQueryKey = (householdId: string) => ['households', householdId, 'members'] as const;
export const invitationQueryKey = (householdId: string) => ['households', householdId, 'invitations'] as const;

export async function fetchMembers(householdId: string): Promise<HouseholdMember[]> {
  return (await apiClient.request<{ members: HouseholdMember[] }>(`/households/${householdId}/members`)).members;
}

export async function fetchInvitations(householdId: string): Promise<Invitation[]> {
  return (await apiClient.request<{ invitations: Invitation[] }>(`/households/${householdId}/invitations`)).invitations;
}

export async function createInvitation(householdId: string, email: string): Promise<Invitation> {
  return (await apiClient.request<{ invitation: Invitation }>(`/households/${householdId}/invitations`, { method: 'POST', body: { email } })).invitation;
}

export async function revokeInvitation(householdId: string, invitationId: string): Promise<void> {
  await apiClient.request(`/households/${householdId}/invitations/${invitationId}`, { method: 'DELETE' });
}

export async function removeMember(householdId: string, userId: string): Promise<void> {
  await apiClient.request(`/households/${householdId}/members/${userId}`, { method: 'DELETE' });
}

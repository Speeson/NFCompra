import { apiClient, type User } from '../../api/session';

export interface UpdateProfileInput {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export async function updateProfile(input: UpdateProfileInput): Promise<User> {
  const response = await apiClient.request<{ user: User }>('/me', {
    method: 'PATCH',
    body: input,
  });
  return response.user;
}

export async function changePassword(input: ChangePasswordInput): Promise<void> {
  await apiClient.request('/me/change-password', {
    method: 'POST',
    body: input,
  });
}

import { ApiClient } from './client';

export interface User {
  id: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  birthDate: string | null;
  username: string | null;
  email: string;
  role?: string;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  user: User;
}

export const apiClient = new ApiClient();

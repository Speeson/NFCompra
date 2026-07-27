import { ApiClient } from './client';

export interface User {
  id: string;
  name: string;
  email: string;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  user: User;
}

export const apiClient = new ApiClient();

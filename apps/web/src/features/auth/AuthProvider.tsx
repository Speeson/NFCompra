import { createContext, useCallback, useContext, useEffect, useMemo, useState, type JSX, type PropsWithChildren } from 'react';

import { ApiError } from '../../api/client';
import { apiClient, type User } from '../../api/session';
import { activateOfflineLists, clearOfflineLists } from '../shopping-list/offline-cache';

type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

interface Credentials {
  email: string;
  password: string;
}

interface Registration extends Credentials {
  firstName: string;
  lastName: string;
  birthDate: string;
  username: string;
}

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  login(credentials: Credentials): Promise<void>;
  register(registration: Registration): Promise<void>;
  resendVerification(email: string): Promise<void>;
  verifyEmail(token: string): Promise<void>;
  forgotPassword(email: string): Promise<void>;
  resetPassword(token: string, password: string): Promise<void>;
  resetPasswordWithOtp(email: string, otp: string, password: string): Promise<void>;
  refreshUser(): Promise<User>;
  logout(): Promise<boolean>;
  deleteAccount(currentPassword: string): Promise<void>;
}

export const SessionContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren): JSX.Element {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<User | null>(null);

  const loadUser = useCallback(async (): Promise<void> => {
    const response = await apiClient.request<{ user: User }>('/me', { retryOnUnauthorized: false });
    activateOfflineLists(response.user.id);
    setUser(response.user);
    setStatus('authenticated');
  }, []);

  const refreshUser = useCallback(async (): Promise<User> => {
    const response = await apiClient.request<{ user: User }>('/me');
    activateOfflineLists(response.user.id);
    setUser(response.user);
    setStatus('authenticated');
    return response.user;
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        if (!await apiClient.refresh()) throw new ApiError(401, {});
        if (active) await loadUser();
      } catch {
        if (active) {
          apiClient.clearAccessToken();
          setUser(null);
          setStatus('anonymous');
        }
      }
    })();
    return () => { active = false; };
  }, [loadUser]);

  const value = useMemo<AuthContextValue>(() => ({
    status,
    user,
    async login(credentials) {
      const response = await apiClient.request<{ accessToken: string }>('/auth/login', {
        method: 'POST',
        body: { ...credentials, clientType: 'web' },
        retryOnUnauthorized: false,
      });
      apiClient.setAccessToken(response.accessToken);
      await loadUser();
    },
    async register(registration) {
      await apiClient.request('/auth/register', { method: 'POST', body: registration, retryOnUnauthorized: false });
    },
    async resendVerification(email) {
      await apiClient.request('/auth/resend-verification', { method: 'POST', body: { email }, retryOnUnauthorized: false });
    },
    async verifyEmail(token) {
      await apiClient.request('/auth/verify-email', { method: 'POST', body: { token }, retryOnUnauthorized: false });
    },
    async forgotPassword(email) {
      await apiClient.request('/auth/forgot-password', { method: 'POST', body: { email }, retryOnUnauthorized: false });
    },
    async resetPassword(token, password) {
      await apiClient.request('/auth/reset-password', { method: 'POST', body: { token, password }, retryOnUnauthorized: false });
    },
    async resetPasswordWithOtp(email, otp, password) {
      await apiClient.request('/auth/reset-password', { method: 'POST', body: { email, otp, password }, retryOnUnauthorized: false });
    },
    refreshUser,
    async logout() {
      const userId = user?.id;
      try {
        await apiClient.request('/auth/logout', { method: 'POST', body: { clientType: 'web' }, retryOnUnauthorized: false });
        return true;
      } catch {
        return false;
      } finally {
        if (userId) await clearOfflineLists(userId).catch(() => undefined);
        apiClient.clearAccessToken();
        setUser(null);
        setStatus('anonymous');
      }
    },
    async deleteAccount(currentPassword) {
      const userId = user?.id;
      await apiClient.request('/me', { method: 'DELETE', body: { currentPassword }, retryOnUnauthorized: false });
      if (userId) await clearOfflineLists(userId).catch(() => undefined);
      localStorage.removeItem('nfcompra.active-household-id');
      apiClient.clearAccessToken();
      setUser(null);
      setStatus('anonymous');
    },
  }), [loadUser, refreshUser, status, user]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): AuthContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession debe usarse dentro de AuthProvider.');
  return context;
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type JSX, type PropsWithChildren } from 'react';

import { ApiError } from '../../api/client';
import { apiClient, type User } from '../../api/session';

type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

interface Credentials {
  email: string;
  password: string;
}

interface Registration extends Credentials {
  name: string;
}

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  login(credentials: Credentials): Promise<void>;
  register(registration: Registration): Promise<void>;
  verifyEmail(token: string): Promise<void>;
  forgotPassword(email: string): Promise<void>;
  resetPassword(token: string, password: string): Promise<void>;
  logout(): Promise<boolean>;
}

export const SessionContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren): JSX.Element {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<User | null>(null);

  const loadUser = useCallback(async (): Promise<void> => {
    const response = await apiClient.request<{ user: User }>('/me', { retryOnUnauthorized: false });
    setUser(response.user);
    setStatus('authenticated');
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
    async verifyEmail(token) {
      await apiClient.request('/auth/verify-email', { method: 'POST', body: { token }, retryOnUnauthorized: false });
    },
    async forgotPassword(email) {
      await apiClient.request('/auth/forgot-password', { method: 'POST', body: { email }, retryOnUnauthorized: false });
    },
    async resetPassword(token, password) {
      await apiClient.request('/auth/reset-password', { method: 'POST', body: { token, password }, retryOnUnauthorized: false });
    },
    async logout() {
      try {
        await apiClient.request('/auth/logout', { method: 'POST', body: { clientType: 'web' }, retryOnUnauthorized: false });
        return true;
      } catch {
        return false;
      } finally {
        apiClient.clearAccessToken();
        setUser(null);
        setStatus('anonymous');
      }
    },
  }), [loadUser, status, user]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): AuthContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession debe usarse dentro de AuthProvider.');
  return context;
}

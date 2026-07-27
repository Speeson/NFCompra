import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiClient } from '../../api/client';
import { App } from '../../app/App';
import { AuthProvider } from './AuthProvider';
import { LoginPage } from './LoginPage';

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('LoginPage', () => {
  it('displays the invalid-credentials message returned by the API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Las credenciales no son válidas.',
        details: {},
      },
    }, { status: 401 })));

    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>,
    );

    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'persona@example.com' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'contraseña-segura' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Las credenciales no son válidas.');
    });
  });
});

describe('ApiClient', () => {
  it('refreshes an expired access token once and retries the protected request', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ error: { code: 'UNAUTHORIZED', message: 'Sesión caducada.', details: {} } }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ accessToken: 'access-token-renovado' }))
      .mockResolvedValueOnce(Response.json({ user: { id: 'user-1' } }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new ApiClient('/v1');
    client.setAccessToken('access-token-caducado');

    await expect(client.request<{ user: { id: string } }>('/me')).resolves.toEqual({ user: { id: 'user-1' } });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'include' });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ credentials: 'include' });
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ credentials: 'include' });
    expect((fetchMock.mock.calls[2][1]?.headers as Headers).get('Authorization')).toBe('Bearer access-token-renovado');
    expect(localStorage.length).toBe(0);
  });

  it('shares one refresh between simultaneous unauthorized requests', async () => {
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) return Promise.resolve(Response.json({ accessToken: 'access-token-renovado' }));
      if (new Headers(init?.headers).get('Authorization') === 'Bearer access-token-renovado') {
        return Promise.resolve(Response.json({ path: url }));
      }
      return Promise.resolve(Response.json({ error: { code: 'UNAUTHORIZED', message: 'Sesión caducada.', details: {} } }, { status: 401 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new ApiClient('/v1');
    client.setAccessToken('access-token-caducado');

    await expect(Promise.all([
      client.request<{ path: string }>('/me'),
      client.request<{ path: string }>('/households'),
    ])).resolves.toEqual([{ path: '/v1/me' }, { path: '/v1/households' }]);

    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/auth/refresh'))).toHaveLength(1);
  });

  it('clears the in-memory access token when the shared refresh fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ error: { code: 'UNAUTHORIZED', message: 'Sesión caducada.', details: {} } }, { status: 401 }))
      .mockRejectedValueOnce(new Error('Sin conexión'))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new ApiClient('/v1');
    client.setAccessToken('access-token-caducado');

    await expect(client.request('/me')).rejects.toMatchObject({ status: 401 });
    await client.request('/health', { retryOnUnauthorized: false });

    expect((fetchMock.mock.calls[2][1]?.headers as Headers).get('Authorization')).toBeNull();
  });
});

describe('logout', () => {
  it('clears the local session and shows non-blocking feedback when the API logout fails', async () => {
    window.history.pushState({}, '', '/');
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) return Promise.resolve(Response.json({ accessToken: 'access-token' }));
      if (url.endsWith('/me')) return Promise.resolve(Response.json({ user: {
        id: 'user-1', name: 'Persona', email: 'persona@example.com', emailVerifiedAt: '2026-07-27T00:00:00.000Z', createdAt: '2026-07-27T00:00:00.000Z', updatedAt: '2026-07-27T00:00:00.000Z',
      } }));
      if (url.endsWith('/auth/logout')) return Promise.resolve(Response.json({ error: { code: 'REQUEST_FAILED', message: 'No disponible.', details: {} } }, { status: 503 }));
      throw new Error(`Solicitud inesperada: ${url}`);
    }));

    render(<AuthProvider><App /></AuthProvider>);

    await screen.findByRole('button', { name: 'Cerrar sesión' });
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cerrar sesión en el servidor. La sesión local se ha cerrado.');
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
  });
});

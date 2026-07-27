import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiClient } from '../../api/client';
import { AuthProvider } from './AuthProvider';
import { LoginPage } from './LoginPage';

afterEach(() => {
  cleanup();
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
});

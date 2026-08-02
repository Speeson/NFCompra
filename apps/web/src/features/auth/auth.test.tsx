import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiClient } from '../../api/client';
import { App } from '../../app/App';
import { AuthProvider, useSession } from './AuthProvider';
import { LoginPage } from './LoginPage';
import { RegisterPage, VerifyEmailPage } from './RegisterPage';
import { clearOfflineLists } from '../shopping-list/offline-cache';

vi.mock('../shopping-list/offline-cache', () => ({
  activateOfflineLists: vi.fn(),
  clearOfflineLists: vi.fn().mockResolvedValue(undefined),
  loadOfflineList: vi.fn().mockResolvedValue(null),
  saveOfflineList: vi.fn().mockResolvedValue(undefined),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
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

  it('offers the persistent resend route when login reports an unverified email', async () => {
    const navigate = vi.fn();
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) {
        return Promise.resolve(Response.json({ error: { code: 'UNAUTHORIZED', message: 'No hay sesión.', details: {} } }, { status: 401 }));
      }
      if (url.endsWith('/auth/login')) {
        return Promise.resolve(Response.json({
          error: { code: 'EMAIL_NOT_VERIFIED', message: 'Debes verificar tu correo.', details: {} },
        }, { status: 403 }));
      }
      throw new Error(`Solicitud inesperada: ${url}`);
    }));

    render(<AuthProvider><LoginPage onNavigate={navigate} /></AuthProvider>);
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'ana@example.test' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'a secure password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Debes verificar tu correo.');
    fireEvent.click(screen.getByRole('button', { name: /Reenviar correo/ }));
    expect(navigate).toHaveBeenCalledWith('/auth/resend-verification');
  });
});

describe('RegisterPage', () => {
  it('submits the extended registration fields expected by the API', async () => {
    const fetchMock = vi.fn((input: string | URL | Request, _init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) {
        return Promise.resolve(Response.json({ error: { code: 'UNAUTHORIZED', message: 'No hay sesiÃ³n.', details: {} } }, { status: 401 }));
      }
      if (url.endsWith('/auth/register')) return Promise.resolve(Response.json({ user: { id: 'user-1' } }, { status: 201 }));
      throw new Error(`Solicitud inesperada: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<AuthProvider><RegisterPage /></AuthProvider>);
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Esteban' } });
    fireEvent.change(screen.getByLabelText('Apellidos'), { target: { value: 'García Pérez' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'esteban@example.test' } });
    fireEvent.change(screen.getByLabelText('Día'), { target: { value: '23' } });
    fireEvent.change(screen.getByLabelText('Mes'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Año'), { target: { value: '1995' } });
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'Spee' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a secure password' } });
    fireEvent.change(screen.getByLabelText('Confirmar password'), { target: { value: 'a secure password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    await screen.findByRole('status');
    const registerCall = fetchMock.mock.calls.find(([input]) => String(input).endsWith('/auth/register'));
    expect(JSON.parse(String(registerCall?.[1]?.body))).toEqual({
      firstName: 'Esteban',
      lastName: 'García Pérez',
      birthDate: '1995-04-23',
      username: 'Spee',
      email: 'esteban@example.test',
      password: 'a secure password',
    });
  });

  it('does not submit the registration form when password confirmation differs', async () => {
    const fetchMock = vi.fn((input: string | URL | Request, _init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) {
        return Promise.resolve(Response.json({ error: { code: 'UNAUTHORIZED', message: 'No hay sesiÃ³n.', details: {} } }, { status: 401 }));
      }
      if (url.endsWith('/auth/register')) return Promise.resolve(Response.json({ user: { id: 'user-1' } }, { status: 201 }));
      throw new Error(`Solicitud inesperada: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<AuthProvider><RegisterPage /></AuthProvider>);
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Esteban' } });
    fireEvent.change(screen.getByLabelText('Apellidos'), { target: { value: 'García Pérez' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'esteban@example.test' } });
    fireEvent.change(screen.getByLabelText('Día'), { target: { value: '23' } });
    fireEvent.change(screen.getByLabelText('Mes'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Año'), { target: { value: '1995' } });
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'Spee' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a secure password' } });
    fireEvent.change(screen.getByLabelText('Confirmar password'), { target: { value: 'otra password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Las contraseñas no coinciden.');
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith('/auth/register'))).toBe(false);
  });

  it('offers a verification email retry when the account exists but delivery failed', async () => {
    const fetchMock = vi.fn((input: string | URL | Request, _init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) {
        return Promise.resolve(Response.json({ error: { code: 'UNAUTHORIZED', message: 'No hay sesión.', details: {} } }, { status: 401 }));
      }
      if (url.endsWith('/auth/register')) {
        return Promise.resolve(Response.json({
          error: {
            code: 'EMAIL_DELIVERY_FAILED',
            message: 'No se pudo enviar el correo de verificación.',
            details: { retryPath: '/v1/auth/resend-verification' },
          },
        }, { status: 503 }));
      }
      if (url.endsWith('/auth/resend-verification')) return Promise.resolve(Response.json({ status: 'accepted' }, { status: 202 }));
      throw new Error(`Solicitud inesperada: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<AuthProvider><RegisterPage /></AuthProvider>);
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText('Apellidos'), { target: { value: 'Test' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ana@example.test' } });
    fireEvent.change(screen.getByLabelText('Día'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Mes'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Año'), { target: { value: '1990' } });
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'ana-test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a secure password' } });
    fireEvent.change(screen.getByLabelText('Confirmar password'), { target: { value: 'a secure password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo enviar el correo de verificación.');
    fireEvent.click(screen.getByRole('button', { name: 'Reenviar verificación' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Hemos vuelto a enviar el correo de verificación.');
    const resendCall = fetchMock.mock.calls.find(([input]) => String(input).endsWith('/auth/resend-verification'));
    expect(JSON.parse(String(resendCall?.[1]?.body))).toEqual({ email: 'ana@example.test' });
  });

  it('mounts the persistent resend route directly after a reload', async () => {
    window.history.pushState({}, '', '/auth/resend-verification');
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) {
        return Promise.resolve(Response.json({ error: { code: 'UNAUTHORIZED', message: 'No hay sesión.', details: {} } }, { status: 401 }));
      }
      if (url.endsWith('/auth/resend-verification')) {
        return Promise.resolve(Response.json({ status: 'accepted' }, { status: 202 }));
      }
      throw new Error(`Solicitud inesperada: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<AuthProvider><App /></AuthProvider>);
    expect(await screen.findByRole('heading', { name: /Reenviar correo/ })).toBeVisible();
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'ana@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar verificación' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Si existe una cuenta pendiente de verificar con ese correo, recibirás un nuevo mensaje.',
    );
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith('/auth/resend-verification'))).toBe(true);
  });
});

describe('VerifyEmailPage', () => {
  it('shows styled verification actions and copies the token manually', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const navigate = vi.fn();
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) {
        return Promise.resolve(Response.json({ error: { code: 'UNAUTHORIZED', message: 'No hay sesión.', details: {} } }, { status: 401 }));
      }
      if (url.endsWith('/auth/verify-email')) {
        return Promise.resolve(Response.json({ status: 'verified' }));
      }
      throw new Error(`Solicitud inesperada: ${url}`);
    }));

    render(<AuthProvider><VerifyEmailPage token="token-manual" onNavigate={navigate} /></AuthProvider>);

    expect(screen.getByRole('button', { name: 'Verificar correo' })).toHaveClass('button');
    expect(screen.getByRole('button', { name: 'Ir a iniciar sesión' })).toHaveClass('button');
    fireEvent.click(screen.getByRole('button', { name: 'Copiar enlace de verificación' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('http://localhost:3000/auth/verify?token=token-manual'));
    expect(screen.getByRole('status')).toHaveTextContent('Enlace copiado.');
  });
});

describe('autenticaciÃ³n desde la landing', () => {
  function stubAnonymousSession(): void {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      error: { code: 'UNAUTHORIZED', message: 'No hay sesiÃ³n.', details: {} },
    }, { status: 401 })));
  }

  it('abre un diÃ¡logo de inicio de sesiÃ³n etiquetado y devuelve el foco al cerrarlo', async () => {
    stubAnonymousSession();
    render(<AuthProvider><App /></AuthProvider>);

    const opener = (await screen.findAllByRole('button', { name: /Iniciar sesi.n/ }))[1];
    opener.focus();
    fireEvent.click(opener);

    const dialog = screen.getByRole('dialog', { name: /NFCompra/ });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByLabelText(/Correo electr.nico/)).toBeVisible();
    expect(within(dialog).getByLabelText(/Contrase.a/)).toBeVisible();
    const closeButton = within(dialog).getByRole('button', { name: 'Cerrar' });
    const lastFocusable = within(dialog).getByRole('button', { name: /Reg.strate/ });
    lastFocusable.focus();
    fireEvent.keyDown(lastFocusable, { key: 'Tab' });
    expect(closeButton).toHaveFocus();
    fireEvent.keyDown(closeButton, { key: 'Tab', shiftKey: true });
    expect(lastFocusable).toHaveFocus();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('cambia a registro y permite cerrar el diÃ¡logo con Escape', async () => {
    stubAnonymousSession();
    render(<AuthProvider><App /></AuthProvider>);

    const opener = (await screen.findAllByRole('button', { name: 'Registrarse' }))[0];
    opener.focus();
    fireEvent.click(opener);
    const registerDialog = screen.getByRole('dialog', { name: /Crea tu cuenta de NFCompra/ });
    expect(within(registerDialog).getByLabelText('Nombre')).toBeVisible();
    expect(within(registerDialog).getByLabelText('Apellidos')).toBeVisible();
    expect(within(registerDialog).getByLabelText('Email')).toBeVisible();
    expect(within(registerDialog).getByLabelText('Username')).toBeVisible();
    expect(within(registerDialog).getByLabelText('Password')).toBeVisible();
    expect(within(registerDialog).getByLabelText('Confirmar password')).toBeVisible();

    fireEvent.click(within(registerDialog).getByRole('button', { name: /Inicia sesi.n/ }));
    expect(screen.getByRole('dialog', { name: /NFCompra/ })).toBeVisible();
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it.each([
    ['/auth/verify?token=verify-token', /Verifica tu correo/],
    ['/auth/reset-password?token=reset-token', /Elige una nueva contrase/],
    ['/auth/forgot-password', /Restablece tu contrase/],
    ['/invitations/accept?token=invitation-token', /Acepta tu invitaci/],
    ['/invitations/invitation-1/accept', /Acepta tu invitaci/],
  ])('mantiene disponible la ruta directa %s', async (path, heading) => {
    window.history.replaceState({}, '', path);
    stubAnonymousSession();

    render(<AuthProvider><App /></AuthProvider>);

    expect(await screen.findByRole('heading', { name: heading })).toBeVisible();
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
  it('clears only the current user offline snapshots during local logout', async () => {
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) return Promise.resolve(Response.json({ accessToken: 'access-token' }));
      if (url.endsWith('/me')) return Promise.resolve(Response.json({ user: { id: 'user-1', name: 'Persona', email: 'persona@example.com', emailVerifiedAt: '2026-07-27T00:00:00.000Z', createdAt: '2026-07-27T00:00:00.000Z', updatedAt: '2026-07-27T00:00:00.000Z' } }));
      if (url.endsWith('/auth/logout')) return Promise.resolve(Response.json({ ok: true }));
      throw new Error(`Solicitud inesperada: ${url}`);
    }));

    render(<AuthProvider><LogoutButton /></AuthProvider>);
    fireEvent.click(await screen.findByRole('button', { name: 'logout' }));

    await waitFor(() => expect(clearOfflineLists).toHaveBeenCalledWith('user-1'));
  });

  it('clears the local session and shows non-blocking feedback when the API logout fails', async () => {
    window.history.pushState({}, '', '/login');
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

  it('never renders one account cached shopping data after logout and login as another account', async () => {
    window.history.pushState({}, '', '/login');
    let activeUser: 'a' | 'b' | null = null;
    let resolveBHouseholds: (response: Response) => void = () => undefined;
    const bHouseholds = new Promise<Response>((resolve) => { resolveBHouseholds = resolve; });
    const user = (id: string, name: string) => ({ id, name, email: `${id}@example.com`, emailVerifiedAt: '2026-07-27T00:00:00.000Z', createdAt: '2026-07-27T00:00:00.000Z', updatedAt: '2026-07-27T00:00:00.000Z' });
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) as { email?: string } : {};
      if (url.endsWith('/auth/refresh')) return Promise.resolve(Response.json({ error: { code: 'UNAUTHORIZED', message: 'No hay sesiÃ³n.', details: {} } }, { status: 401 }));
      if (url.endsWith('/auth/login')) { activeUser = body.email?.startsWith('b@') ? 'b' : 'a'; return Promise.resolve(Response.json({ accessToken: `token-${activeUser}` })); }
      if (url.endsWith('/auth/logout')) { activeUser = null; return Promise.resolve(Response.json({ ok: true })); }
      if (url.endsWith('/me')) return Promise.resolve(Response.json({ user: activeUser === 'a' ? user('a', 'Ana') : user('b', 'Bea') }));
      if (url.endsWith('/households')) {
        if (activeUser === 'b') return bHouseholds;
        return Promise.resolve(Response.json({ households: [{ id: 'home-a', name: 'Casa de Ana' }] }));
      }
      if (url.endsWith('/households/home-a/lists')) return Promise.resolve(Response.json({ lists: [{ id: 'list-a', householdId: 'home-a', name: 'Compra', isDefault: true, version: 1, createdAt: '2026-07-27T00:00:00.000Z', updatedAt: '2026-07-27T00:00:00.000Z' }] }));
      if (url.endsWith('/lists/list-a/items')) return Promise.resolve(Response.json({ items: [{ id: 'item-a', listId: 'list-a', name: 'Producto de Ana', normalizedName: 'producto de ana', quantity: 1, unit: null, category: null, note: null, isChecked: false, position: 0, version: 1, createdBy: 'a', updatedBy: 'a', createdAt: '2026-07-27T00:00:00.000Z', updatedAt: '2026-07-27T00:00:00.000Z' }] }));
      throw new Error(`Solicitud inesperada: ${url}`);
    }));

    render(<AuthProvider><App /></AuthProvider>);
    await screen.findByRole('button', { name: /Iniciar/ });
    fireEvent.change(screen.getByLabelText(/Correo/), { target: { value: 'a@example.com' } });
    fireEvent.change(screen.getByLabelText(/Contrase/), { target: { value: 'contraseña' } });
    fireEvent.click(screen.getByRole('button', { name: /Iniciar/ }));
    await screen.findByText('Producto de Ana');

    fireEvent.click(screen.getByRole('button', { name: /Cerrar/ }));
    await screen.findByRole('button', { name: /Iniciar/ });
    fireEvent.change(screen.getByLabelText(/Correo/), { target: { value: 'b@example.com' } });
    fireEvent.change(screen.getByLabelText(/Contrase/), { target: { value: 'contraseña' } });
    fireEvent.click(screen.getByRole('button', { name: /Iniciar/ }));

    await screen.findByRole('status', { name: '' });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(screen.queryByText('Producto de Ana')).not.toBeInTheDocument();

    resolveBHouseholds(Response.json({ households: [] }));
    expect(await screen.findByRole('heading', { name: 'Crea tu hogar' })).toBeVisible();
  });
});

function LogoutButton() {
  const { status, logout } = useSession();
  return status === 'authenticated' ? <button type="button" onClick={() => void logout()}>logout</button> : <p>waiting</p>;
}

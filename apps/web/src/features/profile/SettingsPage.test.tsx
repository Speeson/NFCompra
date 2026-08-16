import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { User } from '../../api/session';
import { ApiError } from '../../api/client';
import { SessionContext } from '../auth/AuthProvider';
import { androidApkDownloadUrl } from '../app-shell/AppShell';
import { SettingsPage } from './SettingsPage';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

const user: User = {
  id: 'user-1',
  name: 'Ana Garcia',
  firstName: 'Ana',
  lastName: 'Garcia',
  birthDate: null,
  username: 'ana',
  email: 'ana@example.test',
  emailVerifiedAt: '2026-07-27T00:00:00.000Z',
  createdAt: '2026-07-27T00:00:00.000Z',
  updatedAt: '2026-07-27T00:00:00.000Z',
};

describe('SettingsPage', () => {
  it('muestra las tres secciones y usa la cabecera de cuenta compartida', () => {
    renderSettings();
    expect(screen.getByRole('heading', { name: 'Ajustes' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Volver' })).toBeVisible();
    expect(screen.getByText('Preferencias de compra')).toBeVisible();
    expect(screen.getByText('Aplicación')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Cuenta' })).toBeVisible();
    expect(screen.queryByText('Datos personales')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument();
  });

  it('ofrece el selector segmentado de vista de productos y refleja la preferencia guardada', () => {
    localStorage.setItem('nfcompra.product-picker-mode', 'list');
    renderSettings();
    const group = screen.getByRole('group', { name: 'Vista de productos' });
    const lista = within(group).getByRole('button', { name: 'Lista' });
    const tarjetas = within(group).getByRole('button', { name: 'Tarjetas' });
    expect(lista).toHaveAttribute('aria-pressed', 'true');
    expect(tarjetas).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(tarjetas);
    expect(tarjetas).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('nfcompra.product-picker-mode')).toBe('cards');
  });

  it('sincroniza la vista de productos con el selector de la lista de compra', () => {
    localStorage.setItem('nfcompra.product-picker-mode', 'cards');
    renderSettings();
    expect(within(screen.getByRole('group', { name: 'Vista de productos' })).getByRole('button', { name: 'Tarjetas' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Lista' }));
    expect(localStorage.getItem('nfcompra.product-picker-mode')).toBe('list');
  });

  it('renderiza "Recordar último hogar" como interruptor activado por defecto', () => {
    renderSettings();
    const toggle = screen.getByRole('switch', { name: 'Recordar último hogar' });
    expect(toggle).toBeChecked();
  });

  it('al desactivar "Recordar último hogar" limpia el hogar activo persistido', () => {
    localStorage.setItem('nfcompra.active-household-id', 'home-1');
    renderSettings();
    const toggle = screen.getByRole('switch', { name: 'Recordar último hogar' });
    fireEvent.click(toggle);

    expect(toggle).not.toBeChecked();
    expect(localStorage.getItem('nfcompra.active-household-id')).toBeNull();
    expect(localStorage.getItem('nfcompra.remember-household')).toBe('off');

    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
    expect(localStorage.getItem('nfcompra.remember-household')).toBeNull();
  });

  it('muestra la sección Aplicación con la descarga APK en la URL oficial', () => {
    renderSettings();
    const apkLink = screen.getByRole('link', { name: 'Descargar APK' });
    expect(apkLink).toHaveAttribute('href', androidApkDownloadUrl);
    expect(screen.getByText('Aplicación Android')).toBeVisible();
  });

  it('ofrece eliminar cuenta solo desde la sección Cuenta', () => {
    renderSettings();
    expect(screen.getAllByText('Eliminar cuenta')).toHaveLength(2);
    expect(screen.queryByText('Contraseña')).not.toBeInTheDocument();
  });

  it('elimina la cuenta solo tras confirmar la contraseña actual', async () => {
    const deleteAccount = vi.fn().mockResolvedValue(undefined);
    const onNavigate = vi.fn();
    renderSettings(deleteAccount, onNavigate);

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar cuenta' }));
    const dialog = screen.getByRole('dialog', { name: 'Eliminar cuenta' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar cuenta' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Introduce tu contraseña actual.');
    expect(deleteAccount).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText('Contraseña actual'), { target: { value: 'a secure password' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar cuenta' }));

    await waitFor(() => expect(deleteAccount).toHaveBeenCalledWith('a secure password'));
    expect(onNavigate).toHaveBeenCalledWith('/');
  });

  it('mantiene el diálogo abierto cuando el backend rechaza la contraseña', async () => {
    const deleteAccount = vi.fn().mockRejectedValue(new ApiError(401, { error: { code: 'INVALID_CURRENT_PASSWORD', message: 'La contrasena actual no es correcta.', details: {} } }));
    renderSettings(deleteAccount);

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar cuenta' }));
    const dialog = screen.getByRole('dialog', { name: 'Eliminar cuenta' });
    fireEvent.change(within(dialog).getByLabelText('Contraseña actual'), { target: { value: 'wrong password' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar cuenta' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('La contrasena actual no es correcta.');
    expect(screen.getByRole('dialog', { name: 'Eliminar cuenta' })).toBeVisible();
  });

  it('cancelar no elimina la cuenta', async () => {
    const deleteAccount = vi.fn();
    renderSettings(deleteAccount);

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar cuenta' }));
    const dialog = screen.getByRole('dialog', { name: 'Eliminar cuenta' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('dialog', { name: 'Eliminar cuenta' })).not.toBeInTheDocument();
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it('previene envíos duplicados mientras se elimina', async () => {
    let resolveDelete: (() => void) | undefined;
    const deleteAccount = vi.fn().mockImplementation(() => new Promise<void>((resolve) => { resolveDelete = resolve; }));
    renderSettings(deleteAccount);

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar cuenta' }));
    const dialog = screen.getByRole('dialog', { name: 'Eliminar cuenta' });
    fireEvent.change(within(dialog).getByLabelText('Contraseña actual'), { target: { value: 'a secure password' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar cuenta' }));

    const submitting = await within(dialog).findByRole('button', { name: 'Eliminando...' });
    expect(submitting).toBeDisabled();
    fireEvent.click(submitting);
    expect(deleteAccount).toHaveBeenCalledTimes(1);

    resolveDelete?.();
  });
});

function renderSettings(deleteAccount = vi.fn(), onNavigate = vi.fn()) {
  return render(
    <SessionContext.Provider value={{
      status: 'authenticated',
      user,
      login: vi.fn(),
      register: vi.fn(),
      resendVerification: vi.fn(),
      verifyEmail: vi.fn(),
      forgotPassword: vi.fn(),
      resetPassword: vi.fn(),
      resetPasswordWithOtp: vi.fn(),
      refreshUser: vi.fn(),
      logout: vi.fn(),
      deleteAccount,
    }}>
      <SettingsPage onNavigate={onNavigate} onDeleteAccount={deleteAccount} />
    </SessionContext.Provider>,
  );
}

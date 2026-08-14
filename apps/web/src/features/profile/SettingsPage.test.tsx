import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { User } from '../../api/session';
import { ApiError } from '../../api/client';
import { SessionContext } from '../auth/AuthProvider';
import { SettingsPage } from './SettingsPage';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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
  it('deletes the account only after current-password confirmation', async () => {
    const deleteAccount = vi.fn().mockResolvedValue(undefined);
    const onNavigate = vi.fn();
    renderSettings(deleteAccount, onNavigate);

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar cuenta' }));
    const dialog = screen.getByRole('dialog', { name: 'Eliminar cuenta' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar mi cuenta' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Introduce tu contraseña actual.');

    fireEvent.change(within(dialog).getByLabelText('Contraseña actual'), { target: { value: 'a secure password' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar mi cuenta' }));

    await waitFor(() => expect(deleteAccount).toHaveBeenCalledWith('a secure password'));
    expect(onNavigate).toHaveBeenCalledWith('/');
  });

  it('keeps the dialog open when the backend rejects the password', async () => {
    const deleteAccount = vi.fn().mockRejectedValue(new ApiError(401, { error: { code: 'INVALID_CURRENT_PASSWORD', message: 'La contrasena actual no es correcta.', details: {} } }));
    renderSettings(deleteAccount);

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar cuenta' }));
    const dialog = screen.getByRole('dialog', { name: 'Eliminar cuenta' });
    fireEvent.change(within(dialog).getByLabelText('Contraseña actual'), { target: { value: 'wrong password' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar mi cuenta' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('La contrasena actual no es correcta.');
    expect(screen.getByRole('dialog', { name: 'Eliminar cuenta' })).toBeVisible();
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

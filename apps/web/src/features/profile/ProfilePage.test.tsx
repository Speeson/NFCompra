import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { User } from '../../api/session';
import { SessionContext } from '../auth/AuthProvider';
import { ProfilePage } from './ProfilePage';
import { changePassword, updateProfile } from './profile-api';

vi.mock('./profile-api', () => ({
  changePassword: vi.fn(),
  updateProfile: vi.fn(),
}));

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

describe('ProfilePage', () => {
  it('shows a back button that returns to home', () => {
    const onNavigate = vi.fn();
    renderProfile(undefined, onNavigate);

    fireEvent.click(screen.getByRole('button', { name: '← Volver' }));

    expect(onNavigate).toHaveBeenCalledWith('/');
  });

  it('updates editable profile fields and refreshes the session user', async () => {
    const refreshUser = vi.fn().mockResolvedValue({ ...user, firstName: 'Anita' });
    vi.mocked(updateProfile).mockResolvedValue({ ...user, name: 'Anita Garcia', firstName: 'Anita' });

    renderProfile(refreshUser);
    fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[0]);
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Anita' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({ firstName: 'Anita' }));
    expect(refreshUser).toHaveBeenCalled();
    expect(await screen.findByText('Perfil actualizado.')).toBeVisible();
    expect(screen.getByText('Anita')).toBeVisible();
  });

  it('validates username format before submitting', async () => {
    renderProfile();
    fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[2]);
    fireEvent.change(screen.getByLabelText('Nombre de usuario'), { target: { value: 'no' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Usa entre 3 y 30 caracteres');
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('changes the password only when both new values match', async () => {
    vi.mocked(changePassword).mockResolvedValue(undefined);
    renderProfile();
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar' }));
    const dialog = screen.getByRole('dialog', { name: 'Cambiar contraseña' });
    fireEvent.change(within(dialog).getByLabelText('Contraseña actual'), { target: { value: 'old-password' } });
    fireEvent.change(within(dialog).getByLabelText('Nueva contraseña'), { target: { value: 'new-password' } });
    fireEvent.change(within(dialog).getByLabelText('Repetir nueva contraseña'), { target: { value: 'new-password' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cambiar' }));

    await waitFor(() => expect(changePassword).toHaveBeenCalledWith({ currentPassword: 'old-password', newPassword: 'new-password' }));
    expect(await screen.findByText('Contraseña actualizada.')).toBeVisible();
  });
});

function renderProfile(refreshUser = vi.fn().mockResolvedValue(user), onNavigate = vi.fn()) {
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
      refreshUser,
      logout: vi.fn(),
    }}>
      <ProfilePage user={user} onNavigate={onNavigate} />
    </SessionContext.Provider>,
  );
}

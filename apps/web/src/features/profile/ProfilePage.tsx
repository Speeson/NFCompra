import { useState, type FormEvent, type JSX } from 'react';

import { ApiError } from '../../api/client';
import { type User } from '../../api/session';
import { useSession } from '../auth/AuthProvider';
import { changePassword, updateProfile, type UpdateProfileInput } from './profile-api';

type ProfileField = 'firstName' | 'lastName' | 'username';
type DialogState = { kind: 'field'; field: ProfileField } | { kind: 'password' } | null;

const fieldLabels: Record<ProfileField, string> = {
  firstName: 'Nombre',
  lastName: 'Apellidos',
  username: 'Nombre de usuario',
};

export function ProfilePage({ user, onNavigate }: { user: User; onNavigate?(path: string): void }): JSX.Element {
  const { refreshUser } = useSession();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [profileUser, setProfileUser] = useState(user);
  const [status, setStatus] = useState<string | null>(null);

  async function onProfileSaved(nextUser: User): Promise<void> {
    setProfileUser(nextUser);
    await refreshUser();
    setStatus('Perfil actualizado.');
    setDialog(null);
  }

  const initials = profileUser.name.trim().slice(0, 1).toUpperCase() || 'N';
  return <section className="profile-page">
    <button className="profile-back-button" type="button" onClick={() => onNavigate?.('/')}>← Volver</button>
    <header className="profile-hero">
      <span className="profile-hero__avatar" aria-hidden="true">{initials}</span>
      <div>
        <p className="eyebrow">Cuenta</p>
        <h1>Perfil</h1>
        <p>{profileUser.name}</p>
      </div>
    </header>

    {status ? <p className="profile-page__status" role="status">{status}</p> : null}

    <div className="profile-panel" aria-label="Datos del perfil">
      <ProfileRow label="Email" value={profileUser.email} readonly />
      <ProfileRow label="Nombre" value={profileUser.firstName ?? ''} onEdit={() => setDialog({ kind: 'field', field: 'firstName' })} />
      <ProfileRow label="Apellidos" value={profileUser.lastName ?? ''} onEdit={() => setDialog({ kind: 'field', field: 'lastName' })} />
      <ProfileRow label="Nombre de usuario" value={profileUser.username ?? ''} empty="Sin username" onEdit={() => setDialog({ kind: 'field', field: 'username' })} />
      <ProfileRow label="Contraseña" value="********" onEdit={() => setDialog({ kind: 'password' })} actionLabel="Cambiar" />
    </div>

    {dialog?.kind === 'field' ? <ProfileFieldDialog
      user={profileUser}
      field={dialog.field}
      onClose={() => setDialog(null)}
      onSaved={(nextUser) => void onProfileSaved(nextUser)}
    /> : null}
    {dialog?.kind === 'password' ? <PasswordDialog
      onClose={() => setDialog(null)}
      onSaved={() => {
        setStatus('Contraseña actualizada.');
        setDialog(null);
      }}
    /> : null}
  </section>;
}

function ProfileRow({ label, value, empty = 'Sin datos', readonly = false, actionLabel = 'Editar', onEdit }: {
  label: string;
  value: string;
  empty?: string;
  readonly?: boolean;
  actionLabel?: string;
  onEdit?(): void;
}): JSX.Element {
  return <div className="profile-row">
    <div>
      <span>{label}</span>
      <strong className={!value ? 'profile-row__empty' : undefined}>{value || empty}</strong>
    </div>
    {readonly ? <small>Solo lectura</small> : <button className="button button--quiet" type="button" onClick={onEdit}>{actionLabel}</button>}
  </div>;
}

function ProfileFieldDialog({ user, field, onClose, onSaved }: {
  user: User;
  field: ProfileField;
  onClose(): void;
  onSaved(user: User): void;
}): JSX.Element {
  const [value, setValue] = useState(user[field] ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const label = fieldLabels[field];

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    const trimmed = value.trim();
    if (field === 'firstName' && !trimmed) {
      setError('El nombre no puede estar vacío.');
      return;
    }
    if (field === 'username' && trimmed && !/^[a-zA-Z0-9._-]{3,30}$/.test(trimmed)) {
      setError('Usa entre 3 y 30 caracteres: letras, números, punto, guion o guion bajo.');
      return;
    }
    const input: UpdateProfileInput = { [field]: trimmed || null };
    setSaving(true);
    try {
      onSaved(await updateProfile(input));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No se pudo actualizar el perfil.');
    } finally {
      setSaving(false);
    }
  }

  return <div className="profile-dialog-backdrop" role="presentation" onClick={onClose}>
    <form className="profile-dialog" role="dialog" aria-modal="true" aria-label={`Editar ${label}`} onSubmit={(event) => void submit(event)} onClick={(event) => event.stopPropagation()}>
      <DialogHeader title={`Editar ${label}`} onClose={onClose} />
      <label>{label}<input value={value} onChange={(event) => setValue(event.target.value)} autoFocus maxLength={field === 'username' ? 30 : 100} /></label>
      {error ? <p role="alert">{error}</p> : null}
      <DialogActions saving={saving} submitLabel="Guardar" onClose={onClose} />
    </form>
  </div>;
}

function PasswordDialog({ onClose, onSaved }: { onClose(): void; onSaved(): void }): JSX.Element {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (newPassword !== repeatPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setSaving(true);
    try {
      await changePassword({ currentPassword, newPassword });
      onSaved();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No se pudo cambiar la contraseña.');
    } finally {
      setSaving(false);
    }
  }

  return <div className="profile-dialog-backdrop" role="presentation" onClick={onClose}>
    <form className="profile-dialog" role="dialog" aria-modal="true" aria-label="Cambiar contraseña" onSubmit={(event) => void submit(event)} onClick={(event) => event.stopPropagation()}>
      <DialogHeader title="Cambiar contraseña" onClose={onClose} />
      <label>Contraseña actual<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required autoFocus /></label>
      <label>Nueva contraseña<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" required minLength={8} /></label>
      <label>Repetir nueva contraseña<input type="password" value={repeatPassword} onChange={(event) => setRepeatPassword(event.target.value)} autoComplete="new-password" required minLength={8} /></label>
      {error ? <p role="alert">{error}</p> : null}
      <DialogActions saving={saving} submitLabel="Cambiar" onClose={onClose} />
    </form>
  </div>;
}

function DialogHeader({ title, onClose }: { title: string; onClose(): void }): JSX.Element {
  return <header className="profile-dialog__header">
    <div><p className="eyebrow">Perfil</p><h2>{title}</h2></div>
    <button type="button" aria-label="Cerrar" onClick={onClose}>×</button>
  </header>;
}

function DialogActions({ saving, submitLabel, onClose }: { saving: boolean; submitLabel: string; onClose(): void }): JSX.Element {
  return <div className="profile-dialog__actions">
    <button className="button button--quiet" type="button" onClick={onClose}>Cancelar</button>
    <button className="button" type="submit" disabled={saving}>{saving ? 'Guardando...' : submitLabel}</button>
  </div>;
}

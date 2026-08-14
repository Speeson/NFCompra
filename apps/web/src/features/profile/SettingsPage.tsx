import { useState, type FormEvent, type JSX } from 'react';

import { ApiError } from '../../api/client';

export function SettingsPage({ onNavigate, onDeleteAccount }: { onNavigate(path: string): void; onDeleteAccount(currentPassword: string): Promise<void> }): JSX.Element {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    if (!currentPassword.trim()) {
      setError('Introduce tu contraseña actual.');
      return;
    }
    setSaving(true);
    try {
      await onDeleteAccount(currentPassword);
      onNavigate('/');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No se pudo eliminar la cuenta.');
    } finally {
      setSaving(false);
    }
  }

  return <section className="profile-page">
    <button className="profile-back-button" type="button" onClick={() => onNavigate('/')}>← Volver</button>
    <header className="profile-hero">
      <span className="profile-hero__avatar" aria-hidden="true">A</span>
      <div>
        <p className="eyebrow">Cuenta</p>
        <h1>Ajustes</h1>
        <p>Seguridad y acceso</p>
      </div>
    </header>
    <div className="profile-panel profile-panel--danger" aria-label="Zona peligrosa">
      <div className="profile-row">
        <div>
          <span>Cuenta</span>
          <strong>Eliminar cuenta</strong>
          <small>Esta acción es permanente.</small>
        </div>
        <button className="button button--danger" type="button" onClick={() => setOpen(true)}>Eliminar cuenta</button>
      </div>
    </div>
    {open ? <div className="profile-dialog-backdrop" role="presentation" onClick={() => !saving && setOpen(false)}>
      <form className="profile-dialog profile-dialog--danger" role="dialog" aria-modal="true" aria-label="Eliminar cuenta" onSubmit={(event) => void submit(event)} onClick={(event) => event.stopPropagation()}>
        <header className="profile-dialog__header">
          <div><p className="eyebrow">Cuenta</p><h2>Eliminar cuenta</h2></div>
          <button type="button" aria-label="Cerrar" disabled={saving} onClick={() => setOpen(false)}>×</button>
        </header>
        <p className="profile-dialog__warning">Esta acción es permanente y no se puede deshacer.</p>
        <ul className="profile-dialog__consequences">
          <li>Se eliminará tu cuenta y tus datos personales.</li>
          <li>Dejarás de pertenecer a todos tus hogares.</li>
          <li>Si eres propietario de algún hogar, la propiedad se transferirá automáticamente a otro miembro.</li>
          <li>Si eres el único miembro de un hogar, ese hogar se eliminará.</li>
        </ul>
        <label>Contraseña actual<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" autoFocus /></label>
        {error ? <p role="alert">{error}</p> : null}
        <div className="profile-dialog__actions">
          <button className="button button--quiet" type="button" disabled={saving} onClick={() => setOpen(false)}>Cancelar</button>
          <button className="button button--danger" type="submit" disabled={saving}>{saving ? 'Eliminando...' : 'Eliminar mi cuenta'}</button>
        </div>
      </form>
    </div> : null}
  </section>;
}

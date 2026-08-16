import { useState, type FormEvent, type JSX, type ReactNode } from 'react';

import { ApiError } from '../../api/client';
import { androidApkDownloadUrl } from '../app-shell/AppShell';
import { clearPersistedActiveHouseholdId } from '../households/active-household';
import { readProductView, readRememberHousehold, writeProductView, writeRememberHousehold, type ProductView } from '../preferences/preferences';
import { AccountPageHeader } from './AccountPageHeader';

export function SettingsPage({ onNavigate, onDeleteAccount }: { onNavigate(path: string): void; onDeleteAccount(currentPassword: string): Promise<void> }): JSX.Element {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [productView, setProductView] = useState<ProductView>(readProductView);
  const [rememberHousehold, setRememberHousehold] = useState<boolean>(readRememberHousehold);

  function changeProductView(view: ProductView): void {
    setProductView(view);
    writeProductView(view);
  }

  function toggleRememberHousehold(enabled: boolean): void {
    setRememberHousehold(enabled);
    writeRememberHousehold(enabled);
    if (!enabled) clearPersistedActiveHouseholdId();
  }

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
    <AccountPageHeader title="Ajustes" subtitle="Preferencias y configuración" avatarLabel="A" onBack={() => onNavigate('/')} />

    <SettingsSection title="Preferencias de compra">
      <SettingsRow label="Vista de productos" description="Cómo se muestran los resultados al buscar productos.">
        <div className="settings-segmented" role="group" aria-label="Vista de productos">
          <button type="button" aria-pressed={productView === 'list'} onClick={() => changeProductView('list')}>Lista</button>
          <button type="button" aria-pressed={productView === 'cards'} onClick={() => changeProductView('cards')}>Tarjetas</button>
        </div>
      </SettingsRow>
      <SettingsRow label="Recordar último hogar" description="Mantiene seleccionado el último hogar que utilizaste.">
        <label className="settings-switch">
          <input type="checkbox" role="switch" aria-label="Recordar último hogar" checked={rememberHousehold} onChange={(event) => toggleRememberHousehold(event.target.checked)} />
          <span className="settings-switch__track" aria-hidden="true" />
        </label>
      </SettingsRow>
    </SettingsSection>

    <SettingsSection title="Aplicación">
      <div className="settings-apk-row">
        <span className="settings-apk-row__icon" aria-hidden="true"><AndroidIcon /></span>
        <div className="settings-apk-row__copy">
          <strong>Aplicación Android</strong>
          <small>Descarga la última versión de NFCompra.</small>
        </div>
        <a className="settings-apk-row__action" href={androidApkDownloadUrl}>Descargar APK</a>
      </div>
    </SettingsSection>

    <SettingsSection title="Cuenta">
      <div className="danger-card">
        <div className="danger-card__copy">
          <h3>Eliminar cuenta</h3>
          <p>Esta acción es permanente y no se puede deshacer.</p>
        </div>
        <button className="danger-button" type="button" onClick={() => setOpen(true)}><TrashIcon />Eliminar cuenta</button>
      </div>
    </SettingsSection>

    {open ? <div className="profile-dialog-backdrop" role="presentation" onClick={() => !saving && setOpen(false)}>
      <form className="profile-dialog profile-dialog--danger" role="dialog" aria-modal="true" aria-label="Eliminar cuenta" onSubmit={(event) => void submit(event)} onClick={(event) => event.stopPropagation()}>
        <header className="profile-dialog__header">
          <div><p className="eyebrow">Cuenta</p><h2>Eliminar cuenta</h2></div>
          <button type="button" aria-label="Cerrar" disabled={saving} onClick={() => setOpen(false)}>×</button>
        </header>
        <p className="profile-dialog__warning">Esta acción es permanente y no se puede deshacer.</p>
        <label>Contraseña actual<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" autoFocus /></label>
        {error ? <p role="alert">{error}</p> : null}
        <div className="profile-dialog__actions">
          <button className="button button--quiet" type="button" disabled={saving} onClick={() => setOpen(false)}>Cancelar</button>
          <button className="button button--danger" type="submit" disabled={saving}>{saving ? 'Eliminando...' : 'Eliminar cuenta'}</button>
        </div>
      </form>
    </div> : null}
  </section>;
}

function SettingsSection({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return <section className="settings-section">
    <h2 className="settings-section__title">{title}</h2>
    <div className="settings-card">{children}</div>
  </section>;
}

function SettingsRow({ label, description, children }: { label: string; description?: string; children: ReactNode }): JSX.Element {
  return <div className="settings-row">
    <div className="settings-row__copy">
      <strong>{label}</strong>
      {description ? <small>{description}</small> : null}
    </div>
    <div className="settings-row__control">{children}</div>
  </div>;
}

function AndroidIcon(): JSX.Element {
  return <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><path d="M6 10v7M18 10v7M8 17v4M16 17v4M5 10h14v7H5z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><path d="M8.5 7.2L7 5M15.5 7.2L17 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><circle cx="9.2" cy="13.2" r="0.4" fill="currentColor" /><circle cx="14.8" cy="13.2" r="0.4" fill="currentColor" /></svg>;
}

function TrashIcon(): JSX.Element {
  return <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6.5 7l1 13a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1l1-13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

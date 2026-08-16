import type { JSX } from 'react';

interface AccountPageHeaderProps {
  title: string;
  subtitle: string;
  avatarLabel: string;
  onBack?(): void;
}

export function AccountPageHeader({ title, subtitle, avatarLabel, onBack }: AccountPageHeaderProps): JSX.Element {
  return <header className="account-page-header">
    {onBack ? <button className="account-page-header__back" type="button" aria-label="Volver" onClick={onBack}>←</button> : null}
    <span className="account-page-header__avatar" aria-hidden="true">{avatarLabel}</span>
    <div className="account-page-header__copy">
      <p className="eyebrow">Cuenta</p>
      <h1>{title}</h1>
      <p className="account-page-header__subtitle">{subtitle}</p>
    </div>
  </header>;
}

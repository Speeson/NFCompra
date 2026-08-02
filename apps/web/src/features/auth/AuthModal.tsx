import { useEffect, useRef, type JSX, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import { LoginForm } from './LoginPage';
import { RegisterForm } from './RegisterPage';

export type AuthMode = 'login' | 'register';

interface AuthModalProps {
  mode: AuthMode;
  onClose(): void;
  onSwitch(mode: AuthMode): void;
  onNavigate(path: string): void;
}

export function AuthModal({ mode, onClose, onSwitch, onNavigate }: AuthModalProps): JSX.Element {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const title = mode === 'login' ? 'Inicia sesión en NFCompra' : 'Crea tu cuenta de NFCompra';

  useEffect(() => {
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  function trapFocus(event: ReactKeyboardEvent<HTMLElement>): void {
    if (event.key !== 'Tab') return;
    const focusableElements = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? []);
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements.at(-1);
    if (!firstFocusable || !lastFocusable) return;

    if (event.shiftKey && document.activeElement === firstFocusable) {
      event.preventDefault();
      lastFocusable.focus();
    } else if (!event.shiftKey && document.activeElement === lastFocusable) {
      event.preventDefault();
      firstFocusable.focus();
    }
  }

  return <div className="auth-modal__backdrop">
    <section ref={dialogRef} className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title" onKeyDown={trapFocus}>
      <div className="auth-modal__header">
        <h2 id="auth-modal-title">{title}</h2>
        <button ref={closeButtonRef} type="button" className="auth-modal__close" onClick={onClose} aria-label="Cerrar">×</button>
      </div>
      {mode === 'login'
        ? <LoginForm onNavigate={onNavigate} onSwitchToRegister={() => onSwitch('register')} />
        : <RegisterForm onNavigate={onNavigate} onSwitchToLogin={() => onSwitch('login')} />}
    </section>
  </div>;
}

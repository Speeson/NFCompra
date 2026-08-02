import { useEffect, useRef, type JSX } from 'react';

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
  const title = mode === 'login' ? 'Inicia sesión en NFCompra' : 'Crea tu cuenta de NFCompra';

  useEffect(() => {
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return <div className="auth-modal__backdrop">
    <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
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

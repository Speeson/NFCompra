import { useState, type FormEvent, type JSX, type ReactNode } from 'react';

import { ApiError } from '../../api/client';
import { useSession } from './AuthProvider';

interface AuthPageProps {
  onNavigate?(path: string): void;
}

export interface LoginFormProps extends AuthPageProps {
  onSwitchToRegister?(): void;
}

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'No se pudo completar la solicitud. Inténtalo de nuevo.';
}

export function LoginPage({ onNavigate }: AuthPageProps): JSX.Element {
  return <AuthLayout title="Inicia sesión en NFCompra"><LoginForm onNavigate={onNavigate} /></AuthLayout>;
}

export function LoginForm({ onNavigate, onSwitchToRegister }: LoginFormProps): JSX.Element {
  const { login } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setIsSubmitting(true);
    try {
      await login({ email: String(form.get('email')), password: String(form.get('password')) });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setIsSubmitting(false);
    }
  }

  return <>
    <form onSubmit={submit}>
      <label>Correo electrónico<input name="email" type="email" autoComplete="email" required /></label>
      <label>Contraseña<input name="password" type="password" autoComplete="current-password" required /></label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Iniciando sesión…' : 'Iniciar sesión'}</button>
    </form>
    <button type="button" onClick={() => onNavigate?.('/auth/forgot-password')}>¿Has olvidado tu contraseña?</button>
    <button type="button" onClick={() => onNavigate?.('/auth/resend-verification')}>Reenviar correo de verificación</button>
    <p>¿No tienes cuenta? <button type="button" onClick={() => {
      if (onSwitchToRegister) onSwitchToRegister();
      else onNavigate?.('/register');
    }}>Regístrate</button></p>
  </>;
}

export function ResendVerificationPage({ onNavigate }: AuthPageProps): JSX.Element {
  const { resendVerification } = useSession();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setMessage(null);
    try {
      await resendVerification(String(new FormData(event.currentTarget).get('email')));
      setMessage('Si existe una cuenta pendiente de verificar con ese correo, recibirás un nuevo mensaje.');
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return <AuthLayout title="Reenviar correo de verificación">
    <form onSubmit={submit}>
      <label>Correo electrónico<input name="email" type="email" autoComplete="email" required /></label>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      <button type="submit">Enviar verificación</button>
    </form>
    <button type="button" onClick={() => onNavigate?.('/login')}>Volver a iniciar sesión</button>
  </AuthLayout>;
}

export function ForgotPasswordPage({ onNavigate }: AuthPageProps): JSX.Element {
  const { forgotPassword } = useSession();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    try {
      await forgotPassword(String(new FormData(event.currentTarget).get('email')));
      setMessage('Si existe una cuenta con ese correo, recibirás instrucciones para restablecer tu contraseña.');
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return <AuthLayout title="Restablece tu contraseña">
    <form onSubmit={submit}>
      <label>Correo electrónico<input name="email" type="email" autoComplete="email" required /></label>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      <button type="submit">Enviar instrucciones</button>
    </form>
    <button type="button" onClick={() => onNavigate?.('/login')}>Volver a iniciar sesión</button>
  </AuthLayout>;
}

export function AuthLayout({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return <main className="auth-page"><h1>{title}</h1>{children}</main>;
}

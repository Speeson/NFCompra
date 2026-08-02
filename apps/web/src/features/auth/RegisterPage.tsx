import { useState, type FormEvent, type JSX } from 'react';

import { ApiError } from '../../api/client';
import { AuthLayout } from './LoginPage';
import { useSession } from './AuthProvider';

interface AuthPageProps {
  onNavigate?(path: string): void;
  token?: string | null;
}

export interface RegisterFormProps extends AuthPageProps {
  onSwitchToLogin?(): void;
}

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'No se pudo completar la solicitud. Inténtalo de nuevo.';
}

export function RegisterPage({ onNavigate }: AuthPageProps): JSX.Element {
  return <AuthLayout title="Crea tu cuenta de NFCompra"><RegisterForm onNavigate={onNavigate} /></AuthLayout>;
}

export function RegisterForm({ onNavigate, onSwitchToLogin }: RegisterFormProps): JSX.Element {
  const { register, resendVerification } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [retryEmail, setRetryEmail] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email'));
    setError(null);
    setRetryEmail(null);
    try {
      await register({ name: String(form.get('name')), email, password: String(form.get('password')) });
      setMessage('Revisa tu correo para verificar la cuenta antes de iniciar sesión.');
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'EMAIL_DELIVERY_FAILED') setRetryEmail(email);
      setError(errorMessage(cause));
    }
  }

  async function resend(): Promise<void> {
    if (!retryEmail) return;
    setError(null);
    try {
      await resendVerification(retryEmail);
      setMessage('Hemos vuelto a enviar el correo de verificación.');
      setRetryEmail(null);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return <>
    <form onSubmit={submit}>
      <label>Nombre<input name="name" autoComplete="name" required /></label>
      <label>Correo electrónico<input name="email" type="email" autoComplete="email" required /></label>
      <label>Contraseña<input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      {retryEmail && <button type="button" onClick={() => void resend()}>Reenviar verificación</button>}
      <button type="submit">Crear cuenta</button>
    </form>
    <button type="button" onClick={() => onNavigate?.('/auth/resend-verification')}>Reenviar correo de verificación</button>
    <p>¿Ya tienes cuenta? <button type="button" onClick={() => {
      if (onSwitchToLogin) onSwitchToLogin();
      else onNavigate?.('/login');
    }}>Inicia sesión</button></p>
  </>;
}

export function VerifyEmailPage({ token, onNavigate }: AuthPageProps): JSX.Element {
  const { verifyEmail } = useSession();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function verify(): Promise<void> {
    if (!token) {
      setError('Falta el token de verificación.');
      return;
    }
    try {
      await verifyEmail(token);
      setMessage('Tu correo se ha verificado. Ya puedes iniciar sesión.');
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return <AuthLayout title="Verifica tu correo">
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
    <button type="button" onClick={verify}>Verificar correo</button>
    <button type="button" onClick={() => onNavigate?.('/login')}>Ir a iniciar sesión</button>
  </AuthLayout>;
}

export function ResetPasswordPage({ token, onNavigate }: AuthPageProps): JSX.Element {
  const { resetPassword } = useSession();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!token) {
      setError('Falta el token para restablecer la contraseña.');
      return;
    }
    try {
      await resetPassword(token, String(new FormData(event.currentTarget).get('password')));
      setMessage('La contraseña se ha restablecido. Ya puedes iniciar sesión.');
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return <AuthLayout title="Elige una nueva contraseña">
    <form onSubmit={submit}>
      <label>Nueva contraseña<input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      <button type="submit">Restablecer contraseña</button>
    </form>
    <button type="button" onClick={() => onNavigate?.('/login')}>Volver a iniciar sesión</button>
  </AuthLayout>;
}

import { useState, type FormEvent, type JSX } from 'react';

import { ApiError } from '../../api/client';
import { AuthLayout } from './LoginPage';
import { useSession } from './AuthProvider';

interface AuthPageProps {
  onNavigate?(path: string): void;
  token?: string | null;
}

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'No se pudo completar la solicitud. Inténtalo de nuevo.';
}

export function RegisterPage({ onNavigate }: AuthPageProps): JSX.Element {
  const { register, resendVerification } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [retryEmail, setRetryEmail] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email'));
    const password = String(form.get('password'));
    const confirmPassword = String(form.get('confirmPassword'));
    if (password !== confirmPassword) {
      setMessage(null);
      setError('Las contraseñas no coinciden.');
      return;
    }

    setError(null);
    setRetryEmail(null);
    try {
      await register({
        firstName: String(form.get('firstName')),
        lastName: String(form.get('lastName')),
        birthDate: `${String(form.get('birthYear'))}-${String(form.get('birthMonth')).padStart(2, '0')}-${String(form.get('birthDay')).padStart(2, '0')}`,
        username: String(form.get('username')),
        email,
        password,
      });
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

  return <AuthLayout title="Crea tu cuenta de NFCompra">
    <form onSubmit={submit} className="auth-form auth-form--extended">
      <div className="auth-form__row">
        <label>Nombre<input name="firstName" autoComplete="given-name" required /></label>
        <label>Apellidos<input name="lastName" autoComplete="family-name" required /></label>
      </div>
      <label>Email<input name="email" type="email" autoComplete="email" required /></label>
      <fieldset className="auth-form__fieldset">
        <legend>Fecha de nacimiento</legend>
        <div className="auth-form__row auth-form__row--three">
          <label>Día<input name="birthDay" inputMode="numeric" pattern="[0-9]{1,2}" placeholder="Día" autoComplete="bday-day" required /></label>
          <label>Mes<input name="birthMonth" inputMode="numeric" pattern="[0-9]{1,2}" placeholder="Mes" autoComplete="bday-month" required /></label>
          <label>Año<input name="birthYear" inputMode="numeric" pattern="[0-9]{4}" placeholder="Año" autoComplete="bday-year" required /></label>
        </div>
      </fieldset>
      <label>Username<input name="username" autoComplete="username" minLength={3} maxLength={30} pattern="[a-zA-Z0-9._-]{3,30}" required /></label>
      <label>Password<input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
      <label>Confirmar password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required /></label>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      {retryEmail && <button type="button" onClick={() => void resend()}>Reenviar verificación</button>}
      <button type="submit">Crear cuenta</button>
    </form>
    <button type="button" onClick={() => onNavigate?.('/auth/resend-verification')}>Reenviar correo de verificación</button>
    <p>¿Ya tienes cuenta? <button type="button" onClick={() => onNavigate?.('/login')}>Inicia sesión</button></p>
  </AuthLayout>;
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

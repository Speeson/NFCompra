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
  return <AuthLayout title="Crea tu cuenta de NFCompra" brandOnly><RegisterForm onNavigate={onNavigate} /></AuthLayout>;
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

  return <>
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
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

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

  function verificationUrl(): string | null {
    return token ? `${window.location.origin}/auth/verify?token=${encodeURIComponent(token)}` : null;
  }

  async function copyVerificationLink(): Promise<void> {
    const url = verificationUrl();
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopyMessage('Enlace copiado.');
  }

  return <AuthLayout title="Verifica tu correo">
    {message && <p role="status">{message}</p>}
    {copyMessage && <p role="status">{copyMessage}</p>}
    {error && <p role="alert">{error}</p>}
    {token && verificationUrl() ? <div className="auth-token-copy">
      <code>{verificationUrl()}</code>
      <button className="button button--quiet auth-copy-button" type="button" aria-label="Copiar enlace de verificación" onClick={() => void copyVerificationLink()}><span aria-hidden="true">⧉</span></button>
    </div> : null}
    <div className="auth-actions">
      <button className="button" type="button" onClick={verify}>Verificar correo</button>
      <button className="button button--secondary" type="button" onClick={() => onNavigate?.('/login')}>Ir a iniciar sesión</button>
    </div>
  </AuthLayout>;
}

export function ResetPasswordPage({ token, onNavigate }: AuthPageProps): JSX.Element {
  const { resetPassword, resetPasswordWithOtp } = useSession();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password'));
    const confirmPassword = String(form.get('confirmPassword'));
    if (password !== confirmPassword) {
      setMessage(null);
      setError('Las contraseñas no coinciden.');
      return;
    }
    try {
      if (token) await resetPassword(token, password);
      else await resetPasswordWithOtp(String(form.get('email')), String(form.get('otp')), password);
      setMessage('La contraseña se ha restablecido. Ya puedes iniciar sesión.');
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return <AuthLayout title="Elige una nueva contraseña">
    <form onSubmit={submit}>
      {!token && <>
        <label>Email<input name="email" type="email" autoComplete="email" required /></label>
        <label>Código de recuperación<input name="otp" inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" required /></label>
      </>}
      <label>Nueva contraseña<input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
      <label>Confirmar nueva contraseña<input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required /></label>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      <button type="submit">Restablecer contraseña</button>
    </form>
    <button type="button" onClick={() => onNavigate?.('/login')}>Volver a iniciar sesión</button>
  </AuthLayout>;
}

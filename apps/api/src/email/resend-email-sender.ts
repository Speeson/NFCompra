import type { Env } from '../env';
import type { EmailMessage, EmailSender, InvitationEmailMessage } from './email-sender';

export class ResendEmailSender implements EmailSender {
  constructor(private readonly env: Env) {}

  async send(message: EmailMessage): Promise<void> {
    const from = this.env.RESEND_FROM_EMAIL?.trim() || 'NFCompra <no-reply@esgarpe.dev>';
    const html = message.html ?? brandedAuthHtml(message);
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text, html }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error('Resend email delivery failed', {
        status: response.status,
        statusText: response.statusText,
        body,
        from,
      });
      throw new Error('No se pudo enviar el correo.');
    }
  }

  async sendInvitation(message: InvitationEmailMessage): Promise<void> {
    await this.send({ to: message.to, subject: message.subject, text: `Acepta la invitacion: ${message.url}` });
  }
}

function brandedAuthHtml(message: EmailMessage): string | undefined {
  const url = message.text.match(/https?:\/\/\S+/)?.[0];
  if (!url) return undefined;
  const isReset = message.subject.toLowerCase().includes('restablece');
  return authEmailHtml({
    title: isReset ? 'Restablece tu contraseña de NFCompra' : 'Verifica tu cuenta de NFCompra',
    greeting: isReset ? 'Hola, hemos recibido una solicitud para cambiar tu contraseña.' : 'Hola, confirma tu cuenta para poder iniciar sesión.',
    body: isReset ? 'Pulsa el botón para elegir una nueva contraseña. Si no has sido tú, puedes ignorar este correo.' : 'Pulsa el botón para verificar tu correo y activar tu cuenta.',
    buttonLabel: isReset ? 'Restablecer contraseña' : 'Verificar cuenta',
    url,
    expiryText: 'Este enlace caduca en 24 horas.',
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function authEmailHtml({ title, greeting, body, buttonLabel, url, expiryText }: { title: string; greeting: string; body: string; buttonLabel: string; url: string; expiryText: string }): string {
  const safeUrl = escapeHtml(url);
  return `<!doctype html><html lang="es"><body style="margin:0;background:#0f172a;color:#f8fafc;font-family:Arial,Helvetica,sans-serif;"><div style="max-width:640px;margin:0 auto;padding:32px 24px;"><p style="margin:0 0 28px;color:#22c55e;font-weight:800;letter-spacing:.02em;">NFCompra</p><h1 style="margin:0 0 20px;font-size:26px;line-height:1.2;color:#f8fafc;">${escapeHtml(title)}</h1><p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:#dbeafe;">${escapeHtml(greeting)}</p><p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#dbeafe;">${escapeHtml(body)}</p><a href="${safeUrl}" style="display:inline-block;margin:0 0 28px;padding:13px 18px;border-radius:9px;background:#16a34a;color:#ffffff;text-decoration:none;font-weight:800;">${escapeHtml(buttonLabel)}</a><p style="margin:0 0 10px;color:#f8fafc;font-weight:700;">Si el botón no funciona, copia este enlace:</p><p style="margin:0 0 20px;word-break:break-all;"><a href="${safeUrl}" style="color:#93c5fd;">${safeUrl}</a></p><p style="margin:24px 0 0;color:#94a3b8;">${escapeHtml(expiryText)}</p></div></body></html>`;
}

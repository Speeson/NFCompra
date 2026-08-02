import type { Env } from '../env';
import type { EmailMessage, EmailSender, InvitationEmailMessage } from './email-sender';

export class ResendEmailSender implements EmailSender {
  constructor(private readonly env: Env) {}

  async send(message: EmailMessage): Promise<void> {
    const from = this.env.RESEND_FROM_EMAIL?.trim() || 'NFCompra <no-reply@esgarpe.dev>';
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text }),
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

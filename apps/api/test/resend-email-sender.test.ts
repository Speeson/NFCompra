import { afterEach, expect, it, vi } from 'vitest';
import { ResendEmailSender } from '../src/email/resend-email-sender';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('sends Resend emails from the production NFCompra address', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
  vi.stubGlobal('fetch', fetchMock);
  const sender = new ResendEmailSender({ RESEND_API_KEY: 'test-key', RESEND_FROM_EMAIL: 'NFCompra <no-reply@esgarpe.dev>' } as never);

  await sender.send({ to: 'persona@example.com', subject: 'Asunto', text: 'Contenido' });

  expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
    from: 'NFCompra <no-reply@esgarpe.dev>',
    to: ['persona@example.com'],
  });
});

it('logs Resend response details without exposing credentials when delivery fails', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response('domain is not verified', { status: 403, statusText: 'Forbidden' }));
  const errorMock = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', fetchMock);
  const sender = new ResendEmailSender({ RESEND_API_KEY: 'test-key', RESEND_FROM_EMAIL: 'NFCompra <no-reply@esgarpe.dev>' } as never);

  await expect(sender.send({ to: 'persona@example.com', subject: 'Asunto', text: 'Contenido' })).rejects.toThrow('No se pudo enviar el correo.');

  expect(errorMock).toHaveBeenCalledWith('Resend email delivery failed', {
    status: 403,
    statusText: 'Forbidden',
    body: 'domain is not verified',
    from: 'NFCompra <no-reply@esgarpe.dev>',
  });
  expect(JSON.stringify(errorMock.mock.calls)).not.toContain('test-key');
});

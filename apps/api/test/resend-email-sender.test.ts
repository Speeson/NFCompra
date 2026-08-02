import { afterEach, expect, it, vi } from 'vitest';
import { ResendEmailSender } from '../src/email/resend-email-sender';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('sends Resend emails from the production NFCompra address', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
  vi.stubGlobal('fetch', fetchMock);
  const sender = new ResendEmailSender({ RESEND_API_KEY: 'test-key' } as never);

  await sender.send({ to: 'persona@example.com', subject: 'Asunto', text: 'Contenido' });

  expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
    from: 'NFCompra <no-reply@esgarpe.dev>',
    to: ['persona@example.com'],
  });
});

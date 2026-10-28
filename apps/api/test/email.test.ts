import { describe, expect, it, vi } from 'vitest';
import { makeAuthMailer } from '../src/email.ts';

const settings = {
  apiKey: 'synthetic-key',
  from: 'Snapform <no-reply@jacked.dev>',
  origin: 'https://snapform.test',
  allowedRecipient: 'qa@example.invalid',
};
const message = {
  kind: 'verify' as const,
  to: 'qa@example.invalid',
  url: 'https://snapform.test/api/auth/verify-email?token=synthetic',
};
describe('transactional auth email boundary', () => {
  it('uses a fixed sender, plain text and an opaque idempotency key', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ id: crypto.randomUUID() }));
    await makeAuthMailer(settings, transport)(message);
    const [url, init] = transport.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer synthetic-key',
      'Idempotency-Key': expect.stringMatching(/^auth-verify-[a-f0-9]{64}$/),
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      from: settings.from,
      to: [message.to],
      subject: 'Verify your Snapform email',
      text: expect.stringContaining(message.url),
    });
  });
  it('rejects other recipients and untrusted action URLs before transmission', async () => {
    const transport = vi.fn<typeof fetch>();
    const send = makeAuthMailer(settings, transport);
    for (const input of [
      { ...message, to: 'other@example.invalid' },
      { ...message, url: 'https://evil.test/api/auth/verify-email' },
      { ...message, url: 'https://snapform.test/other' },
    ]) {
      await expect(send(input)).rejects.toThrow(
        'Auth email could not be sent.',
      );
    }
    expect(transport).not.toHaveBeenCalled();
  });
  it.each([
    Response.json({ message: 'private-provider-detail' }, { status: 429 }),
    Response.json({ unexpected: 'private-provider-detail' }),
  ])('sanitizes provider failures', async (response) => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(response);
    await expect(makeAuthMailer(settings, transport)(message)).rejects.toThrow(
      'Auth email could not be sent.',
    );
  });
  it('sanitizes network exceptions', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('private-network-detail'));
    await expect(makeAuthMailer(settings, transport)(message)).rejects.toThrow(
      'Auth email could not be sent.',
    );
  });
});

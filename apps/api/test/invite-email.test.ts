import { describe, expect, it, vi } from 'vitest';
import { makeInviteMailer } from '../src/email.ts';

const settings = {
  apiKey: 'synthetic-key',
  from: 'Snapform <no-reply@jacked.dev>',
  origin: 'https://snapform.test',
  allowedRecipient: 'qa@example.invalid',
};
const token = 'A'.repeat(42) + 'Q';
const message = {
  id: crypto.randomUUID(),
  to: 'qa@example.invalid',
  inviter: 'Casey Owner',
  workspace: 'Studio <QA> & "Co"',
  role: 'viewer' as const,
  url: `https://snapform.test/invite#token=${token}`,
};
const accepted = () =>
  vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ id: crypto.randomUUID() }));
function sentBody(transport: ReturnType<typeof accepted>) {
  return JSON.parse(String(transport.mock.calls[0]?.[1]?.body)) as {
    from: string;
    to: string[];
    subject: string;
    html: string;
    text: string;
  };
}

describe('team invite email', () => {
  it('names the inviter and workspace and links to the fragment URL', async () => {
    const transport = accepted();
    expect(await makeInviteMailer(settings, transport)(message)).toBe(true);
    const [url, init] = transport.mock.calls[0] ?? [];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer synthetic-key',
      'Idempotency-Key': `team-invite-v1-${message.id}`,
    });
    const body = sentBody(transport);
    expect(body.from).toBe(settings.from);
    expect(body.to).toEqual([message.to]);
    expect(body.subject).toBe(
      'Casey Owner invited you to Studio <QA> & "Co" on Snapform',
    );
    expect(body.text).toContain(message.url);
    expect(body.text).toContain('expires in 7 days');
    expect(body.html).toContain(
      `href="https://snapform.test/invite#token=${token}"`,
    );
  });

  it('escapes names in HTML and keeps header text on one line', async () => {
    const transport = accepted();
    await makeInviteMailer(
      settings,
      transport,
    )({
      ...message,
      inviter: 'Eve\r\nBcc: other@example.invalid <img src=x onerror=alert(1)>',
    });
    const body = sentBody(transport);
    expect(body.subject).not.toMatch(/[\r\n]/);
    expect(body.html).not.toContain('<img');
    expect(body.html).not.toContain('<QA>');
    expect(body.html).toContain('Studio &lt;QA&gt; &amp; &quot;Co&quot;');
    expect(body.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('says what each role can see', async () => {
    const viewer = accepted(),
      editor = accepted();
    await makeInviteMailer(settings, viewer)(message);
    await makeInviteMailer(settings, editor)({ ...message, role: 'editor' });
    expect(sentBody(viewer).text).toMatch(/viewer.*every response/is);
    expect(sentBody(editor).text).toMatch(/editor.*build and publish/is);
  });

  it('skips recipients other than the allowed test address', async () => {
    const transport = vi.fn<typeof fetch>();
    expect(
      await makeInviteMailer(
        settings,
        transport,
      )({
        ...message,
        to: 'someone@example.invalid',
      }),
    ).toBe(false);
    expect(transport).not.toHaveBeenCalled();
  });

  it('refuses untrusted links and provider failures without reflecting them', async () => {
    const transport = vi.fn<typeof fetch>();
    const send = makeInviteMailer(settings, transport);
    for (const url of [
      `https://evil.test/invite#token=${token}`,
      `https://snapform.test/app#token=${token}`,
      `https://snapform.test/invite?token=${token}`,
      `https://snapform.test/invite?x=1#token=${token}`,
      'https://snapform.test/invite',
      `https://user:pass@snapform.test/invite#token=${token}`,
    ])
      await expect(send({ ...message, url })).rejects.toThrow(
        'Invite email could not be sent.',
      );
    await expect(send({ ...message, id: 'not-a-uuid' })).rejects.toThrow(
      'Invite email could not be sent.',
    );
    expect(transport).not.toHaveBeenCalled();
    const failing = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(message.url, { status: 500 }));
    const failure = await makeInviteMailer(
      settings,
      failing,
    )(message).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).not.toContain(token);
  });
});

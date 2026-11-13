import { expect, it, vi } from 'vitest';
import { respondentLabel, sendOwnerEmail } from '../src/owner-email';
import type { OwnerEmail } from '../src/owner-email';
const now = Date.parse('2026-10-29T12:00:00Z');
const delivery: OwnerEmail = {
  id: '11111111-1111-4111-8111-111111111111',
  workspaceId: '22222222-2222-4222-8222-222222222222',
  formId: '33333333-3333-4333-8333-333333333333',
  sessionId: '44444444-4444-4444-8444-444444444444',
  recipient: 'owner@example.invalid',
  firstAttemptAt: new Date(now).toISOString(),
  summary: {
    formTitle: 'Website enquiry',
    submittedAt: '2026-10-29T11:58:00.000Z',
    respondentName: 'Ada Lovelace',
    respondentEmail: 'ada@example.invalid',
  },
};
const settings = {
  apiKey: 'synthetic',
  from: 'Snapform <no-reply@jacked.dev>',
};
const providerId = '55555555-5555-4555-8555-555555555555';
const inbox = `https://snapform.jacked.dev/workspaces/${delivery.workspaceId}/responses/${delivery.formId}`;
const responseLink = `${inbox}?response=${delivery.sessionId}`;
type Payload = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  reply_to?: string;
  tags: { name: string; value: string }[];
};
async function sent(summary: Partial<OwnerEmail['summary']>): Promise<Payload> {
  const requests: Request[] = [];
  expect(
    await sendOwnerEmail(
      { ...delivery, summary: { ...delivery.summary, ...summary } },
      settings,
      now,
      async (url, init) => {
        requests.push(new Request(url, init));
        return Response.json({ id: providerId });
      },
    ),
  ).toEqual({ status: 'accepted', providerId });
  expect(requests).toHaveLength(1);
  return JSON.parse(await requests[0].text());
}
it('sends a stable message to the verified snapshot recipient with an idempotency key', async () => {
  const calls: Request[] = [];
  const transport = vi.fn<typeof fetch>(async (url, init) => {
    calls.push(new Request(url, init));
    return Response.json({ id: providerId });
  });
  for (let i = 0; i < 2; i++)
    expect(await sendOwnerEmail(delivery, settings, now, transport)).toEqual({
      status: 'accepted',
      providerId,
    });
  expect(calls[0].url).toBe('https://api.resend.com/emails');
  expect(calls[0].redirect).toBe('manual');
  expect(calls[0].headers.get('Idempotency-Key')).toBe(
    `response-owner-v1-${delivery.id}`,
  );
  const first = await calls[0].text();
  expect(first).toBe(await calls[1].text());
  const body: Payload = JSON.parse(first);
  expect(body.to).toEqual([delivery.recipient]);
  expect(Object.keys(body).sort()).toEqual([
    'from',
    'html',
    'reply_to',
    'subject',
    'tags',
    'text',
    'to',
  ]);
  expect(body.tags).toEqual([
    { name: 'snapform_delivery', value: delivery.id },
  ]);
});
it('names the form and respondent and links to the exact response without answers', async () => {
  const body = await sent({});
  expect(body.subject).toBe('New response: Website enquiry from Ada Lovelace');
  expect(body.reply_to).toBe('ada@example.invalid');
  for (const part of [body.text, body.html]) {
    expect(part).toContain('Website enquiry');
    expect(part).toContain('Ada Lovelace');
    expect(part).toMatch(/Oct 29, 2026,? 11:58 UTC/);
    expect(part).toContain('email notifications are on for this form');
    expect(part).not.toMatch(/answers?\b/i);
  }
  expect(body.text).toContain(`Open response:\n${responseLink}\n`);
  expect(body.text).toContain(inbox);
  expect(body.html).toContain('<html lang="en">');
  expect(body.html).toContain(
    '<title>New response: Website enquiry from Ada Lovelace</title>',
  );
  expect(body.html).toMatch(/<h1[^>]*>New response<\/h1>/);
  expect(body.html).toMatch(
    new RegExp(
      `<a href="${responseLink.replace('?', '\\?')}"[^>]*>Open response</a>`,
    ),
  );
  expect(body.html).toMatch(/<th scope="row"[^>]*>Respondent<\/th>/);
  expect(body.html).toContain('<time datetime="2026-10-29T11:58:00.000Z">');
  expect(body.html).not.toMatch(/<script|\son\w+=/i);
});
it('escapes markup and keeps injected lines out of the subject and Reply-To', async () => {
  const body = await sent({
    formTitle: `<script>alert("x")</script> & 'Quotes'`,
    respondentName: 'Eve\r\nBcc: victim@example.invalid',
    respondentEmail: 'eve@example.invalid\r\nBcc: victim@example.invalid',
  });
  expect(body.subject).toBe(
    `New response: <script>alert("x")</script> & 'Quotes' from Eve Bcc: victim@example.invalid`,
  );
  expect(body.subject).not.toMatch(/[\r\n]/);
  expect('reply_to' in body).toBe(false);
  expect(body.html).not.toContain('<script>');
  expect(body.html).toContain(
    '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;Quotes&#39;',
  );
  expect(body.html).toContain('Eve Bcc: victim@example.invalid');
  expect(body.text).toContain('Respondent: Eve Bcc: victim@example.invalid\n');
  const attribute = await sent({
    respondentName: '"><img src=x onerror=alert(1)>',
  });
  expect(attribute.html).not.toContain('<img');
  expect(attribute.html).toContain(
    '&quot;&gt;&lt;img src=x onerror=alert(1)&gt;',
  );
});
it('omits the respondent and Reply-To when no name or valid email was given', async () => {
  const anonymous = await sent({
    formTitle: ' \r\n ',
    respondentName: null,
    respondentEmail: null,
  });
  expect(anonymous.subject).toBe('New response: Untitled form');
  expect('reply_to' in anonymous).toBe(false);
  expect(anonymous.text).toContain('Respondent: Not provided\n');
  expect(anonymous.html).toContain('Not provided');
  const emailOnly = await sent({ respondentName: '\u0007\n' });
  expect(emailOnly.subject).toBe(
    'New response: Website enquiry from ada@example.invalid',
  );
  expect(emailOnly.reply_to).toBe('ada@example.invalid');
  for (const respondentEmail of [
    'not-an-email',
    'eve@localhost',
    '"Eve" <eve@example.invalid>',
    'eve@example.invalid, other@example.invalid',
    'eve@example.invalid;other@example.invalid',
    'eve@exa\u0000mple.invalid',
    `${'e'.repeat(250)}@example.invalid`,
  ]) {
    const body = await sent({ respondentName: 'Eve', respondentEmail });
    expect(body.subject).toBe('New response: Website enquiry from Eve');
    expect('reply_to' in body).toBe(false);
  }
});
it('bounds long titles and labels to 120 characters without splitting characters', async () => {
  const body = await sent({
    formTitle: `${'A'.repeat(118)}😀${'B'.repeat(100)}`,
    respondentName: 'N'.repeat(500),
  });
  const title = `${'A'.repeat(118)}😀…`;
  expect(Array.from(title)).toHaveLength(120);
  expect(body.subject).toBe(`New response: ${title} from ${'N'.repeat(119)}…`);
  expect(body.subject.isWellFormed()).toBe(true);
  expect(body.html).toContain(title);
  expect(body.html).not.toContain('B'.repeat(2));
});
it('derives the respondent label from a name, then the email, as one safe line', () => {
  expect(respondentLabel('  Ada \t Lovelace ', 'ada@example.invalid')).toBe(
    'Ada Lovelace',
  );
  expect(respondentLabel('\u202Eevil\u2028name', null)).toBe('evil name');
  expect(respondentLabel('\r\n', ' ada@example.invalid ')).toBe(
    'ada@example.invalid',
  );
  expect(respondentLabel(null, null)).toBeNull();
  expect(respondentLabel('x'.repeat(121), null)).toBe(`${'x'.repeat(119)}…`);
  expect(respondentLabel('x'.repeat(120), null)).toBe('x'.repeat(120));
});
it('never sends beyond the retry window or with missing configuration or an unauthorized test recipient', async () => {
  const transport = vi.fn<typeof fetch>();
  expect(
    await sendOwnerEmail(delivery, settings, now + 23 * 3600000, transport),
  ).toEqual({ status: 'needs_action', reason: 'idempotency-expired' });
  expect(
    await sendOwnerEmail(delivery, { ...settings, apiKey: '' }, now, transport),
  ).toEqual({ status: 'needs_action', reason: 'configuration' });
  expect(
    await sendOwnerEmail(
      delivery,
      { ...settings, allowedRecipient: 'qa@example.invalid' },
      now,
      transport,
    ),
  ).toEqual({ status: 'needs_action', reason: 'configuration' });
  expect(
    await sendOwnerEmail(
      {
        ...delivery,
        recipient: 'owner@example.invalid\r\nBcc: other@example.invalid',
      },
      settings,
      now,
      transport,
    ),
  ).toEqual({ status: 'needs_action', reason: 'configuration' });
  expect(
    await sendOwnerEmail(
      { ...delivery, summary: { ...delivery.summary, submittedAt: 'never' } },
      settings,
      now,
      transport,
    ),
  ).toEqual({ status: 'needs_action', reason: 'configuration' });
  expect(transport).not.toHaveBeenCalled();
});
it('classifies transient and permanent failures without reflecting provider bodies', async () => {
  for (const status of [408, 429, 500, 503]) {
    const result = await sendOwnerEmail(
      delivery,
      settings,
      now,
      async () =>
        new Response('private diagnostic', {
          status,
          headers: { 'Retry-After': '999999' },
        }),
    );
    expect(result).toEqual({
      status: 'retry',
      reason: 'provider-unavailable',
      delaySeconds: 3600,
    });
  }
  expect(
    await sendOwnerEmail(delivery, settings, now, async () => {
      throw Error('private timeout');
    }),
  ).toEqual({
    status: 'retry',
    reason: 'provider-unavailable',
    delaySeconds: 60,
  });
  expect(
    await sendOwnerEmail(delivery, settings, now, async () =>
      Response.json(
        { name: 'concurrent_idempotent_requests' },
        { status: 409 },
      ),
    ),
  ).toEqual({
    status: 'retry',
    reason: 'provider-unavailable',
    delaySeconds: 60,
  });
  for (const status of [302, 400, 401, 403, 409, 422]) {
    expect(
      await sendOwnerEmail(
        delivery,
        settings,
        now,
        async () => new Response('private diagnostic', { status }),
      ),
    ).toEqual({ status: 'needs_action', reason: 'provider-rejected' });
  }
});
it('treats invalid successful responses as uncertain and retries the same key', async () => {
  for (const body of ['not json', '{"id":"not-an-id"}', '{}', 'x'.repeat(8193)])
    expect(
      await sendOwnerEmail(
        delivery,
        settings,
        now,
        async () => new Response(body),
      ),
    ).toEqual({
      status: 'retry',
      reason: 'provider-unavailable',
      delaySeconds: 60,
    });
});

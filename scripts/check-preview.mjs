import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:5173';
const response = await fetch(base);
assert.equal(response.status, 200);
assert.match(response.headers.get('cache-control') || '', /no-transform/);
const html = await response.text();
assert.match(html, /Better questions/);
const nonce = response.headers
  .get('content-security-policy')
  ?.match(/'nonce-([^']+)'/)?.[1];
assert.ok(nonce, 'production HTML must have a CSP nonce');
const inlineScripts = [
  ...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g),
].filter(([, attributes, body]) => !attributes.includes('src=') && body.trim());
assert.ok(inlineScripts.length > 0, 'SSR must include hydration scripts');
for (const [, attributes] of inlineScripts)
  assert.ok(
    attributes.includes(`nonce="${nonce}"`),
    'every inline hydration script must use the response nonce',
  );
assert.ok(
  !response.headers
    .get('content-security-policy')
    .includes('challenges.cloudflare.com'),
  'private/marketing pages must not authorize the challenge provider',
);
const collector = await fetch(base + '/f/11111111-1111-4111-8111-111111111111');
assert.equal(collector.status, 200);
assert.match(
  collector.headers.get('content-security-policy'),
  /frame-src 'self' https:\/\/challenges\.cloudflare\.com/,
);
assert.match(await collector.text(), /Opening your form/);
const second = await fetch(base);
assert.notEqual(
  second.headers.get('content-security-policy'),
  response.headers.get('content-security-policy'),
  'nonces must be request-scoped',
);
const review = await fetch(`${base}/api/v1/brief/review`, {
  method: 'POST',
  headers: { Origin: base, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    goal: 'A synthetic consulting project.',
    budget: 0,
    currency: 'INR',
    targetDate: '2028-02-29',
  }),
});
assert.equal(
  review.status,
  200,
  'same-origin service binding must reach Express',
);
assert.deepEqual(await review.json(), {
  brief: {
    goal: 'A synthetic consulting project.',
    budget: 0,
    currency: 'INR',
    targetDate: '2028-02-29',
  },
});
console.log(
  'Production SSR, unique CSP nonces and the same-origin Express service binding passed.',
);
const download = await fetch(
  `${base}/api/v1/workspaces/11111111-1111-4111-8111-111111111111/forms/22222222-2222-4222-8222-222222222222/response-export?versionId=33333333-3333-4333-8333-333333333333`,
  { headers: { Accept: 'text/html' } },
);
assert.equal(download.status, 401);
assert.match(download.headers.get('Content-Type'), /text\/html/);
assert.equal(download.headers.get('Content-Disposition'), null);
assert.match(await download.text(), /Sign in to download/);
console.log(
  'Native export authorization errors render through the real web-to-API Worker boundary.',
);
const receiptPath = `${base}/api/v1/hooks/resend`;
const unsignedReceipt = await fetch(receiptPath, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{}',
});
assert.equal(unsignedReceipt.status, 401);
assert.equal(unsignedReceipt.headers.get('Cache-Control'), 'no-store');
assert.equal(await unsignedReceipt.text(), '');
const receiptGet = await fetch(receiptPath);
assert.equal(receiptGet.status, 405);
assert.equal(receiptGet.headers.get('Allow'), 'POST');
assert.equal(await receiptGet.text(), '');
console.log(
  'Provider callbacks reach the private jobs Worker and reject unsigned or wrong-method requests.',
);

import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:5173';
const response = await fetch(base);
assert.equal(response.status, 200);
const html = await response.text();
assert.match(html, /What would you like to achieve/);
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

import { expect, it } from 'vitest';
import { responseEventMessageSchema } from '../src/response-event';

it('accepts only a versioned event identity in transport messages', () => {
  const message = { version: 1, eventId: crypto.randomUUID() };
  expect(responseEventMessageSchema.parse(message)).toEqual(message);
  for (const invalid of [
    null,
    [],
    {},
    { ...message, version: 2 },
    { ...message, eventId: 'missing' },
    { ...message, answers: { email: 'private@example.invalid' } },
    { ...message, capability: 'must-not-enter-transport' },
  ])
    expect(responseEventMessageSchema.safeParse(invalid).success).toBe(false);
});

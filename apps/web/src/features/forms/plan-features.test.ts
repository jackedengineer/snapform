import { expect, it } from 'vitest';
import { uploadsAllowed } from './plan-features';

it('reads only the uploads flag from a billing response', () => {
  expect(uploadsAllowed({ billing: { features: { uploads: true } } })).toBe(
    true,
  );
  expect(uploadsAllowed({ billing: { features: { uploads: false } } })).toBe(
    false,
  );
});

it('refuses a billing response without a boolean uploads flag', () => {
  for (const value of [
    null,
    {},
    { billing: {} },
    { billing: { features: {} } },
    { billing: { features: { uploads: 'yes' } } },
  ])
    expect(() => uploadsAllowed(value)).toThrow('Invalid billing response');
});

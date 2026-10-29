import { afterEach, expect, it, vi } from 'vitest';
import { formFixture } from '../test/form-fixture.ts';
afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});
it('keeps accepted currency metadata stable when the runtime currency catalog differs', async () => {
  vi.resetModules();
  vi.spyOn(Intl, 'supportedValuesOf').mockReturnValue(['USD']);
  const { blockSchema } = await import('./form.ts');
  const number = formFixture().definition.pages[0].blocks[1];
  expect(
    blockSchema.safeParse({
      ...number,
      unit: { kind: 'currency', code: 'JPY' },
    }).success,
  ).toBe(true);
  expect(
    blockSchema.safeParse({
      ...number,
      unit: { kind: 'currency', code: 'ZZZ' },
    }).success,
  ).toBe(false);
});

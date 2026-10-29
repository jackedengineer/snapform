import { SELF } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { intakeConfiguration } from '../src/intake-config.ts';
it('exposes only a public widget key and keeps official testing keys local', () => {
  const settings = {
    siteKey: '1x00000000000000000000AA',
    mode: 'local',
    origin: 'http://127.0.0.1:5173',
  };
  expect(intakeConfiguration(settings)).toEqual({ siteKey: settings.siteKey });
  expect(intakeConfiguration({ ...settings, mode: 'production' })).toBeNull();
  expect(
    intakeConfiguration({ ...settings, origin: 'https://snapform.test' }),
  ).toBeNull();
  expect(intakeConfiguration({ ...settings, siteKey: '' })).toBeNull();
  expect(intakeConfiguration({ ...settings, siteKey: '<script>' })).toBeNull();
  expect(
    intakeConfiguration({
      ...settings,
      siteKey: '0xSyntheticPublicKey',
      mode: 'production',
      origin: 'https://snapform.test',
    }),
  ).toEqual({ siteKey: '0xSyntheticPublicKey' });
});
it('fails closed for a production configuration without a real widget key', async () => {
  const response = await SELF.fetch(
    'http://127.0.0.1:5173/api/v1/public/intake-config',
  );
  expect(response.status).toBe(503);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
});

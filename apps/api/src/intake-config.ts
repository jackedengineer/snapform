import { Router } from 'express';
import { intakeConfigurationSchema } from '@snapform/contracts/intake';
import { requestScope } from './request-context.ts';
const testSiteKeys = new Set([
  '1x00000000000000000000AA',
  '2x00000000000000000000AB',
  '1x00000000000000000000BB',
  '2x00000000000000000000BB',
  '3x00000000000000000000FF',
]);
export function intakeConfiguration(settings: {
  siteKey: string;
  mode: string;
  origin: string;
}) {
  const parsed = intakeConfigurationSchema.safeParse({
    siteKey: settings.siteKey,
  });
  if (!parsed.success) return null;
  let origin: URL;
  try {
    origin = new URL(settings.origin);
  } catch {
    return null;
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  if (
    testSiteKeys.has(parsed.data.siteKey) &&
    (settings.mode !== 'local' || !local)
  )
    return null;
  return parsed.data;
}
export const intakeConfigRoutes = Router();
intakeConfigRoutes.all('/api/v1/public/intake-config', async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED' } });
    return;
  }
  const scope = requestScope.getStore();
  if (!scope) throw new Error('Request context is required.');
  if (
    !(
      await scope.environment.PUBLIC_READ_RATE_LIMIT.limit({
        key: req.get('cf-connecting-ip') || 'local',
      })
    ).success
  ) {
    res.setHeader('Retry-After', '60');
    res.status(429).json({ error: { code: 'RATE_LIMITED' } });
    return;
  }
  const config = intakeConfiguration({
    siteKey: scope.environment.TURNSTILE_SITE_KEY || '',
    mode: scope.environment.SNAPFORM_ENV,
    origin: scope.origin,
  });
  if (!config) {
    res.status(503).json({ error: { code: 'CHALLENGE_UNAVAILABLE' } });
    return;
  }
  res.json(config);
});

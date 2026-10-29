// Registration checks complement the jobs Worker's strictly public fetch boundary.
export function parseWebhookTarget(input: unknown): string {
  try {
    if (
      typeof input !== 'string' ||
      input.length > 2048 ||
      /[\p{Cc}\s]/u.test(input) ||
      input.includes('#')
    )
      throw Error();
    const url = new URL(input),
      host = url.hostname;
    const labels = host.split('.');
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      url.href.length > 2048 ||
      host.length > 253 ||
      labels.length < 2 ||
      labels.some(
        (label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label),
      ) ||
      !/^[a-z][a-z0-9-]{0,61}[a-z0-9]$/.test(labels.at(-1) || '') ||
      /\.(?:localhost|localdomain|local|internal|lan|home|arpa|onion|test|invalid|example)$/.test(
        host,
      ) ||
      host === 'jacked.dev' ||
      host.endsWith('.jacked.dev')
    )
      throw Error();
    return url.href;
  } catch {
    throw Error('INVALID_WEBHOOK_TARGET');
  }
}

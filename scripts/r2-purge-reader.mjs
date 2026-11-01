import { spawn } from 'node:child_process';
import { parseXml } from '@rgrove/parse-xml';
import { validateR2BackupCredentials as validateCredentials } from './backup-r2.mjs';
const keyPattern =
  /^intents\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.enc$/;
function validCursor(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 2048 &&
    [...value].every(
      (character) =>
        character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
    )
  );
}
export function r2PurgeReadConfig(settings) {
  try {
    validateCredentials(settings);
    if (
      Object.keys(settings).some(
        (key) =>
          ![
            'accountId',
            'accessKeyId',
            'secretAccessKey',
            'key',
            'cursor',
          ].includes(key),
      )
    )
      throw Error();
    const { accountId, accessKeyId, secretAccessKey, key, cursor } = settings;
    if (key !== undefined && (!keyPattern.test(key) || cursor !== undefined))
      throw Error();
    if (cursor !== undefined && !validCursor(cursor)) throw Error();
    const url = new URL(
      `https://${accountId}.r2.cloudflarestorage.com/snapform-purge-ledger`,
    );
    if (key !== undefined) url.pathname += '/' + key;
    else {
      url.search = new URLSearchParams({
        'list-type': '2',
        prefix: 'intents/',
        'max-keys': '1000',
      }).toString();
      if (cursor !== undefined)
        url.searchParams.set('continuation-token', cursor);
    }
    const limit = key === undefined ? 1048576 : 4096;
    return {
      args: ['-q', '--config', '-'],
      limit,
      config:
        [
          'silent',
          'fail',
          'proto = "=https"',
          'tlsv1.2',
          'connect-timeout = 5',
          'max-time = 20',
          'write-out = "%{stderr}%{http_code}"',
          `max-filesize = ${limit}`,
          'aws-sigv4 = "aws:amz:auto:s3"',
          `user = "${accessKeyId}:${secretAccessKey}"`,
          `url = "${url.href}"`,
          'request = "GET"',
        ].join('\n') + '\n',
    };
  } catch {
    throw Error('R2_PURGE_REQUEST_INVALID');
  }
}
export function parsePurgeListing(xml) {
  try {
    if (
      typeof xml !== 'string' ||
      Buffer.byteLength(xml) > 1048576 ||
      /<!DOCTYPE/i.test(xml)
    )
      throw Error();
    const root = parseXml(xml).root;
    const namespace = 'http://s3.amazonaws.com/doc/2006-03-01/';
    if (
      root?.name !== 'ListBucketResult' ||
      root.attributes.xmlns !== namespace
    )
      throw Error();
    const stack = [{ node: root, parent: null }];
    let visited = 0;
    while (stack.length) {
      const { node, parent } = stack.pop();
      if (
        ++visited > 20000 ||
        node.name.includes(':') ||
        Object.entries(node.attributes).some(
          ([name, value]) =>
            name.startsWith('xmlns:') ||
            (name === 'xmlns' && value !== namespace),
        )
      )
        throw Error();
      if (
        (['Contents', 'IsTruncated', 'NextContinuationToken'].includes(
          node.name,
        ) &&
          parent !== root) ||
        (node.name === 'Key' && parent?.name !== 'Contents')
      )
        throw Error();
      for (const child of node.children)
        if (child.type === 'element') stack.push({ node: child, parent: node });
    }
    const children = root.children.filter((node) => node.type === 'element');
    const allowed = new Set([
      'Name',
      'Prefix',
      'MaxKeys',
      'KeyCount',
      'IsTruncated',
      'NextContinuationToken',
      'ContinuationToken',
      'StartAfter',
      'EncodingType',
      'Delimiter',
      'Contents',
    ]);
    if (children.some((node) => !allowed.has(node.name))) throw Error();
    function scalar(nodes, name, required = false) {
      const found = nodes.filter((node) => node.name === name);
      if (found.length > 1 || (required && found.length !== 1)) throw Error();
      if (!found.length) return null;
      if (found[0].children.some((node) => node.type !== 'text')) throw Error();
      return found[0].text;
    }
    const name = scalar(children, 'Name'),
      prefix = scalar(children, 'Prefix');
    if (
      (name !== null && name !== 'snapform-purge-ledger') ||
      (prefix !== null && prefix !== 'intents/')
    )
      throw Error();
    const truncated = scalar(children, 'IsTruncated', true),
      cursor = scalar(children, 'NextContinuationToken');
    if (
      !['true', 'false'].includes(truncated) ||
      (truncated === 'true' ? !validCursor(cursor) : cursor !== null)
    )
      throw Error();
    const keys = children
      .filter((node) => node.name === 'Contents')
      .map((node) =>
        scalar(
          node.children.filter((child) => child.type === 'element'),
          'Key',
          true,
        ),
      );
    if (
      keys.length > 1000 ||
      keys.some((key) => !keyPattern.test(key)) ||
      new Set(keys).size !== keys.length
    )
      throw Error();
    if (truncated === 'true' && keys.length === 0) throw Error();
    const count = scalar(children, 'KeyCount');
    if (count !== null && count !== String(keys.length)) throw Error();
    return { keys, cursor };
  } catch {
    throw Error('R2_PURGE_LIST_INVALID');
  }
}
async function readObject(settings) {
  const request = r2PurgeReadConfig(settings);
  let child;
  try {
    child = spawn('curl', request.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      signal: AbortSignal.timeout(25000),
    });
    let status = '';
    child.stderr.on('data', (part) => {
      status += part.toString();
      if (status.length > 512) child.kill();
    });
    child.stdin.on('error', () => {}); // The awaited process result owns input failure.
    const finished = new Promise((resolve, reject) => {
      child.once('error', () => reject(Error('R2_PURGE_READ_FAILED')));
      child.once('close', (code) => resolve(code));
    });
    const output = (async () => {
      const chunks = [];
      let size = 0;
      for await (const chunk of child.stdout) {
        size += chunk.length;
        if (size > request.limit) {
          child.kill();
          throw Error();
        }
        chunks.push(chunk);
      }
      return new TextDecoder('utf-8', { fatal: true }).decode(
        Buffer.concat(chunks),
      );
    })();
    child.stdin.end(request.config);
    const [done, data] = await Promise.allSettled([finished, output]);
    if (done.status !== 'fulfilled' || data.status !== 'fulfilled')
      throw Error();
    if (
      settings.key !== undefined &&
      status.trim() === '404' &&
      done.value === 22
    )
      return null;
    if (done.value !== 0 || status.trim() !== '200') throw Error();
    return data.value;
  } catch {
    throw Error('R2_PURGE_READ_FAILED');
  } finally {
    if (child && child.exitCode === null) child.kill();
  }
}
export async function readR2PurgeObject(settings, key) {
  return readObject({ ...settings, key });
}
export async function* readR2PurgeLedger(settings) {
  if (
    Object.keys(settings).some(
      (key) => !['accountId', 'accessKeyId', 'secretAccessKey'].includes(key),
    )
  )
    throw Error('R2_PURGE_REQUEST_INVALID');
  const keys = [],
    seenKeys = new Set(),
    seenCursors = new Set();
  let cursor;
  for (let page = 0; ; page++) {
    if (page >= 20) throw Error('R2_PURGE_PAGE_LIMIT');
    const listing = parsePurgeListing(
      await readObject({
        ...settings,
        ...(cursor === undefined ? {} : { cursor }),
      }),
    );
    for (const key of listing.keys) {
      if (seenKeys.has(key) || keys.length >= 10000)
        throw Error('R2_PURGE_LIST_INVALID');
      seenKeys.add(key);
      keys.push(key);
    }
    if (listing.cursor === null) break;
    if (seenCursors.has(listing.cursor)) throw Error('R2_PURGE_CURSOR_LOOP');
    seenCursors.add(listing.cursor);
    cursor = listing.cursor;
  }
  for (let index = 0; index < keys.length; index += 4) {
    const batch = await Promise.allSettled(
      keys.slice(index, index + 4).map(async (key) => {
        const body = await readR2PurgeObject(settings, key);
        if (body === null) throw Error('R2_PURGE_LIST_CHANGED');
        return { key, body };
      }),
    );
    for (const result of batch) {
      if (result.status === 'rejected') throw Error('R2_PURGE_READ_FAILED');
      yield result.value;
    }
  }
}

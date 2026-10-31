import { spawn } from 'node:child_process';
import { open, mkdtemp, rm, readFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import {
  backupFilenamePattern,
  verifyRecoveryFiles,
} from './recovery-manifest.mjs';

// curl owns maintained SigV4/TLS support; stdin carries its private config.
export function validateR2BackupCredentials({
  accountId,
  accessKeyId,
  secretAccessKey,
}) {
  if (
    !/^[a-f0-9]{32}$/.test(accountId || '') ||
    !/^[a-f0-9]{32}$/.test(accessKeyId || '') ||
    !/^[a-f0-9]{64}$/.test(secretAccessKey || '')
  )
    throw Error('INVALID_R2_BACKUP_REQUEST');
}
export function r2BackupConfig({
  accountId,
  accessKeyId,
  secretAccessKey,
  file,
  method,
  bytes,
  sha256,
}) {
  validateR2BackupCredentials({ accountId, accessKeyId, secretAccessKey });
  if (
    typeof file !== 'string' ||
    !backupFilenamePattern.test(file.replace(/\.json$/, '')) ||
    !['GET', 'PUT'].includes(method) ||
    !Number.isSafeInteger(bytes) ||
    bytes <= 0 ||
    bytes > 1073741824 ||
    (method === 'PUT' && !/^[a-f0-9]{64}$/.test(sha256 || ''))
  )
    throw Error('INVALID_R2_BACKUP_REQUEST');
  const lines = [
    'silent',
    'fail',
    'proto = "=https"',
    'tlsv1.2',
    'connect-timeout = 15',
    'max-time = 90',
    'write-out = "%{stderr}%{http_code}"',
    `max-filesize = ${bytes}`,
    'aws-sigv4 = "aws:amz:auto:s3"',
    `user = "${accessKeyId}:${secretAccessKey}"`,
    `url = "https://${accountId}.r2.cloudflarestorage.com/snapform-backups/archives/${file}"`,
    `request = "${method}"`,
  ];
  if (method === 'PUT')
    lines.push(
      'upload-file = "/dev/fd/3"',
      `header = "Content-Length: ${bytes}"`,
      `header = "x-amz-content-sha256: ${sha256}"`,
      'header = "If-None-Match: *"',
      'header = "Cache-Control: no-store"',
      'header = "Content-Type: application/octet-stream"',
    );
  return { args: ['-q', '--config', '-'], config: lines.join('\n') + '\n' };
}
async function* bounded(source, limit) {
  let size = 0;
  for await (const chunk of source) {
    size += chunk.length;
    if (size > limit) throw Error('R2_BACKUP_TOO_LARGE');
    yield chunk;
  }
}
export async function transferBackupObject(options, localFile) {
  const request = r2BackupConfig(options);
  let input,
    child,
    output,
    outputFile,
    published = false;
  try {
    if (options.method === 'PUT') {
      input = await open(localFile, 'r');
      if ((await input.stat()).size !== options.bytes)
        throw Error('BACKUP_BYTES_MISMATCH');
    } else {
      outputFile = await open(localFile, 'wx', 0o600);
      output = outputFile.createWriteStream();
    }
    child = spawn('curl', request.args, {
      stdio: [
        'pipe',
        options.method === 'GET' ? 'pipe' : 'ignore',
        'pipe',
        input?.fd ?? 'ignore',
      ],
      signal: AbortSignal.timeout(95000),
    });
    let status = '';
    child.stderr.on('data', (chunk) => {
      status += chunk.toString();
      if (status.length > 512) child.kill();
    });
    child.stdin.on('error', () => {
      /* Process outcome below owns the failure. */
    });
    const finished = new Promise((resolve, reject) => {
      child.once('error', () => reject(Error('R2_BACKUP_TRANSFER_FAILED')));
      child.once('close', (code) =>
        code === 0 && status.trim() === '200'
          ? resolve()
          : reject(Error('R2_BACKUP_TRANSFER_FAILED')),
      );
    });
    child.stdin.end(request.config);
    await Promise.all([
      finished,
      ...(output
        ? [pipeline(bounded(child.stdout, options.bytes), output)]
        : []),
    ]);
    published = true;
  } catch {
    throw Error('R2_BACKUP_TRANSFER_FAILED');
  } finally {
    if (child && child.exitCode === null) child.kill();
    if (input) await input.close();
    if (output) {
      output.destroy();
      await outputFile.close();
      if (!published) await rm(localFile, { force: true });
    }
  }
}
export async function publishBackupToR2(manifestPath, settings) {
  const manifest = await verifyRecoveryFiles(manifestPath, settings.secret);
  const directory = dirname(manifestPath),
    descriptor = await readFile(manifestPath);
  const credentials = {
    accountId: settings.accountId,
    accessKeyId: settings.accessKeyId,
    secretAccessKey: settings.secretAccessKey,
  };
  for (const entry of [
    {
      file: manifest.file,
      bytes: manifest.encryptedBytes,
      sha256: manifest.sha256,
    },
    {
      file: manifest.file + '.json',
      bytes: descriptor.length,
      sha256: createHash('sha256').update(descriptor).digest('hex'),
    },
  ])
    await transferBackupObject(
      { ...credentials, ...entry, method: 'PUT' },
      join(directory, entry.file),
    );
  const downloaded = await mkdtemp(join(directory, '.remote-'));
  try {
    for (const entry of [
      { file: manifest.file + '.json', bytes: 4096 },
      { file: manifest.file, bytes: manifest.encryptedBytes },
    ])
      await transferBackupObject(
        { ...credentials, ...entry, method: 'GET' },
        join(downloaded, entry.file),
      );
    const remote = await verifyRecoveryFiles(
      join(downloaded, manifest.file + '.json'),
      settings.secret,
    );
    if (JSON.stringify(remote) !== JSON.stringify(manifest))
      throw Error('R2_BACKUP_VERIFICATION_FAILED');
    return {
      manifest,
      manifestPath: join(downloaded, manifest.file + '.json'),
    };
  } catch (error) {
    await rm(downloaded, { recursive: true, force: true });
    throw error;
  }
}

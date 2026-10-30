import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  readFile,
  writeFile,
  stat,
  readdir,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { sealArchive, openArchive } from './recovery-archive.mjs';
const key = Buffer.alloc(32, 7).toString('base64');
async function fixture(run) {
  const folder = await mkdtemp(join(tmpdir(), 'snapform-archive-'));
  try {
    await run(folder);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
test('authenticates a streamed binary archive before publishing a private recovered file', () =>
  fixture(async (folder) => {
    const bytes = Buffer.concat([
      Buffer.from('PGDMP\0synthetic private answers ☀'),
      Buffer.alloc(64000, 0x83),
    ]);
    const encrypted = join(folder, 'backup.enc'),
      recovered = join(folder, 'recovered.dump');
    await sealArchive(
      Readable.from([bytes.subarray(0, 100), bytes.subarray(100)]),
      encrypted,
      key,
    );
    assert.equal((await stat(encrypted)).mode & 0o777, 0o600);
    assert.equal(
      (await readFile(encrypted)).includes(Buffer.from('private answers')),
      false,
    );
    await openArchive(encrypted, recovered, key);
    assert.deepEqual(await readFile(recovered), bytes);
    assert.equal((await stat(recovered)).mode & 0o777, 0o600);
    assert.deepEqual((await readdir(folder)).sort(), [
      'backup.enc',
      'recovered.dump',
    ]);
  }));
test('rejects altered headers, ciphertext, tags, truncation and wrong keys without publishing plaintext', () =>
  fixture(async (folder) => {
    const source = join(folder, 'source.enc');
    await sealArchive(
      Readable.from([Buffer.from('PGDMP synthetic data')]),
      source,
      key,
    );
    const original = await readFile(source);
    const changes = [0, original.length - 17, original.length - 1];
    for (const [n, index] of changes.entries()) {
      const bytes = Buffer.from(original);
      bytes[index] ^= 1;
      const bad = join(folder, `bad-${n}.enc`),
        dest = join(folder, `bad-${n}.dump`);
      await writeFile(bad, bytes);
      await assert.rejects(openArchive(bad, dest, key));
      await assert.rejects(stat(dest), { code: 'ENOENT' });
    }
    const short = join(folder, 'short.enc');
    await writeFile(short, original.subarray(0, 12));
    await assert.rejects(openArchive(short, join(folder, 'short.dump'), key));
    await assert.rejects(
      openArchive(
        source,
        join(folder, 'wrong.dump'),
        Buffer.alloc(32, 9).toString('base64'),
      ),
    );
    assert.equal(
      (await readdir(folder)).some(
        (name) => name.endsWith('.partial') || name.endsWith('.dump'),
      ),
      false,
    );
  }));
test('never overwrites existing artifacts and removes partial output on an input failure', () =>
  fixture(async (folder) => {
    const dest = join(folder, 'existing');
    await writeFile(dest, 'keep');
    await assert.rejects(sealArchive(Readable.from(['new']), dest, key), {
      code: 'EEXIST',
    });
    assert.equal(await readFile(dest, 'utf8'), 'keep');
    const failed = join(folder, 'failed.enc');
    async function* broken() {
      yield Buffer.from('partial');
      throw Error('synthetic input failure');
    }
    await assert.rejects(sealArchive(Readable.from(broken()), failed, key));
    await assert.rejects(stat(failed), { code: 'ENOENT' });
    for (const invalid of [
      '',
      'secret-key',
      Buffer.alloc(31).toString('base64'),
    ])
      await assert.rejects(sealArchive(Readable.from(['x']), failed, invalid));
    assert.deepEqual(await readdir(folder), ['existing']);
  }));

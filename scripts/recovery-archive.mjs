import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, link, rm, stat, mkdtemp } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
const magic = Buffer.from('SNAPFORM-ARCHIVE-1\n');
const nonceLength = 12,
  tagLength = 16;
function archiveKey(value) {
  if (typeof value !== 'string' || value.length !== 44)
    throw Error('A canonical 32-byte backup key is required.');
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32 || key.toString('base64') !== value)
    throw Error('A canonical 32-byte backup key is required.');
  return key;
}
// Only complete authenticated output is linked into place. The private staging
// directory prevents restore tooling from reading unverified plaintext.
async function privateArchive(destination, write) {
  const folder = await mkdtemp(
    join(dirname(destination), '.snapform-archive-'),
  );
  const staging = join(folder, 'artifact');
  try {
    await write(staging);
    await link(staging, destination);
    return { bytes: (await stat(destination)).size };
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
export async function sealArchive(source, destination, secret) {
  const key = archiveKey(secret),
    nonce = randomBytes(nonceLength);
  const header = Buffer.concat([magic, nonce]);
  const cipher = createCipheriv('aes-256-gcm', key, nonce, {
    authTagLength: tagLength,
  });
  cipher.setAAD(header);
  const framed = new Transform({
    transform(chunk, _encoding, callback) {
      callback(null, chunk);
    },
    flush(callback) {
      this.push(cipher.getAuthTag());
      callback();
    },
  });
  framed.push(header);
  return privateArchive(destination, (staging) =>
    pipeline(
      source,
      cipher,
      framed,
      createWriteStream(staging, { flags: 'wx', mode: 0o600, flush: true }),
    ),
  );
}
export async function openArchive(source, destination, secret) {
  const key = archiveKey(secret),
    handle = await open(source, 'r');
  const headerLength = magic.length + nonceLength;
  let size;
  const header = Buffer.alloc(headerLength),
    tag = Buffer.alloc(tagLength);
  try {
    size = (await handle.stat()).size;
    if (size < headerLength + tagLength)
      throw Error('Incomplete recovery archive.');
    const headerRead = await handle.read(header, 0, header.length, 0);
    const tagRead = await handle.read(tag, 0, tag.length, size - tagLength);
    if (
      headerRead.bytesRead !== header.length ||
      tagRead.bytesRead !== tag.length ||
      !header.subarray(0, magic.length).equals(magic)
    )
      throw Error('Unsupported recovery archive.');
  } finally {
    await handle.close();
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    header.subarray(magic.length),
    { authTagLength: tagLength },
  );
  decipher.setAAD(header);
  decipher.setAuthTag(tag);
  return privateArchive(destination, async (staging) => {
    const input =
      size === headerLength + tagLength
        ? Readable.from([])
        : createReadStream(source, {
            start: headerLength,
            end: size - tagLength - 1,
          });
    await pipeline(
      input,
      decipher,
      createWriteStream(staging, { flags: 'wx', mode: 0o600, flush: true }),
    );
  });
}

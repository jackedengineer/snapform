import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  r2PurgeReadConfig,
  parsePurgeListing,
  readR2PurgeLedger,
} from './r2-purge-reader.mjs';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
const credentials = {
  accountId: 'a'.repeat(32),
  accessKeyId: 'b'.repeat(32),
  secretAccessKey: 'c'.repeat(64),
};
const id = randomUUID(),
  key = `intents/${id}.enc`;
const listing = (keys = [], suffix = '<IsTruncated>false</IsTruncated>') =>
  `<?xml version="1.0"?><ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>snapform-purge-ledger</Name>${keys.map((key) => `<Contents><Key>${key}</Key></Contents>`).join('')}${suffix}</ListBucketResult>`;
test('restricts signed reads to the private purge ledger and keeps keys out of argv', () => {
  const request = r2PurgeReadConfig({ ...credentials, key });
  assert.deepEqual(request.args, ['-q', '--config', '-']);
  assert.ok(!request.args.join(' ').includes(credentials.secretAccessKey));
  assert.ok(
    request.config.includes(
      `url = "https://${credentials.accountId}.r2.cloudflarestorage.com/snapform-purge-ledger/${key}"`,
    ),
  );
  assert.ok(request.config.includes('proto = "=https"'));
  assert.ok(!request.config.includes('location'));
  assert.ok(!request.config.includes('upload-file'));
  const page = r2PurgeReadConfig({
    ...credentials,
    cursor: 'opaque&token+value=',
  });
  assert.ok(
    page.config.includes('continuation-token=opaque%26token%2Bvalue%3D'),
  );
  for (const patch of [
    { key: '../backup' },
    { key: 'archives/file' },
    { key: key + '?secret=x' },
    { accountId: 'foreign.example' },
    { accessKeyId: 'bad\nurl=x' },
    { cursor: 'x\nverbose' },
    { cursor: 'x'.repeat(2049) },
  ])
    assert.throws(
      () => r2PurgeReadConfig({ ...credentials, ...patch }),
      /R2_PURGE/,
    );
});
async function withCurl(run) {
  const folder = await mkdtemp(join(tmpdir(), 'snapform-ledger-read-')),
    previous = process.env.PATH;
  try {
    await mkdir(join(folder, 'objects'));
    await writeFile(
      join(folder, 'curl'),
      `#!${process.execPath}
const fs=require('node:fs'),path=require('node:path'),folder=${JSON.stringify(folder)};
let config='';process.stdin.on('data',part=>{config+=part;});process.stdin.on('end',()=>{
 const url=new URL(config.match(/^url = "([^"]+)"$/m)[1]);
 fs.appendFileSync(path.join(folder,'calls'),JSON.stringify({args:process.argv.slice(2),url:url.href})+'\\n');
 const mode=fs.existsSync(path.join(folder,'mode'))?fs.readFileSync(path.join(folder,'mode'),'utf8'):'';
 if(mode==='denied'){process.stderr.write('403');process.exitCode=22;return;}
 if(mode==='oversized'){process.stdout.write('x'.repeat(1048577));process.stderr.write('200');return;}
 const file=url.searchParams.has('list-type')?path.join(folder,url.searchParams.has('continuation-token')?'page2':'page1'):path.join(folder,'objects',path.basename(url.pathname));
 if(mode==='missing'&&!url.searchParams.has('list-type')){process.stderr.write('404');process.exitCode=22;return;}
 process.stdout.write(fs.readFileSync(file));process.stderr.write('200');
});`,
      { mode: 0o700 },
    );
    process.env.PATH = folder + delimiter + previous;
    await run(folder);
  } finally {
    process.env.PATH = previous;
    await rm(folder, { recursive: true, force: true });
  }
}
test('reads every page and object through bounded native subprocesses without credential arguments', async () => {
  await withCurl(async (folder) => {
    const second = `intents/${randomUUID()}.enc`;
    await writeFile(
      join(folder, 'page1'),
      listing(
        [key],
        '<IsTruncated>true</IsTruncated><NextContinuationToken>next&amp;page</NextContinuationToken>',
      ),
    );
    await writeFile(join(folder, 'page2'), listing([second]));
    await writeFile(join(folder, 'objects', key.split('/')[1]), 'cipher-one');
    await writeFile(
      join(folder, 'objects', second.split('/')[1]),
      'cipher-two',
    );
    const records = [];
    for await (const record of readR2PurgeLedger(credentials))
      records.push(record);
    assert.deepEqual(records, [
      { key, body: 'cipher-one' },
      { key: second, body: 'cipher-two' },
    ]);
    const calls = (await readFile(join(folder, 'calls'), 'utf8'))
      .trim()
      .split('\n')
      .map(JSON.parse);
    assert.equal(calls.length, 4);
    assert.ok(calls.every((call) => call.args.join(' ') === '-q --config -'));
    assert.ok(
      calls.every(
        (call) => !JSON.stringify(call).includes(credentials.secretAccessKey),
      ),
    );
    await assert.rejects(async () => {
      for await (const item of readR2PurgeLedger({
        ...credentials,
        cursor: 'skip-the-first-page',
      }))
        assert.ok(item);
    }, /R2_PURGE/);
    for (const mode of ['denied', 'oversized', 'missing']) {
      await writeFile(join(folder, 'mode'), mode);
      await assert.rejects(async () => {
        for await (const item of readR2PurgeLedger(credentials))
          assert.ok(item);
      }, /R2_PURGE/);
    }
  });
});
test('parses the bounded ListObjectsV2 XML shape and decodes opaque cursors', () => {
  assert.deepEqual(parsePurgeListing(listing([key])), {
    keys: [key],
    cursor: null,
  });
  assert.deepEqual(
    parsePurgeListing(
      listing(
        [key],
        '<IsTruncated>true</IsTruncated><NextContinuationToken>opaque&amp;token+value=</NextContinuationToken>',
      ),
    ),
    { keys: [key], cursor: 'opaque&token+value=' },
  );
  assert.deepEqual(parsePurgeListing(listing()), { keys: [], cursor: null });
});
test('rejects malformed, ambiguous, external-entity and unbounded listings', () => {
  for (const xml of [
    '',
    '<other/>',
    listing([key]).replace('</Contents>', ''),
    listing([key]).replace(
      'xmlns="http://s3.amazonaws.com/doc/2006-03-01/"',
      'xmlns="https://foreign.invalid/"',
    ),
    listing([key]).replace('<Key>', '<Key xmlns="https://foreign.invalid/">'),
    listing([key])
      .replace(
        '<Contents>',
        '<s:Contents xmlns:s="http://s3.amazonaws.com/doc/2006-03-01/">',
      )
      .replace('</Contents>', '</s:Contents>'),
    listing([key])
      .replace('<Contents>', '<Wrapper><Contents>')
      .replace('</Contents>', '</Contents></Wrapper>'),
    listing([key, key]),
    listing([key]).replace(
      '<Contents>',
      '<CommonPrefixes><Prefix>intents/nested/</Prefix></CommonPrefixes><Contents>',
    ),
    listing(['intents/../secret']),
    listing([key], '<IsTruncated>true</IsTruncated>'),
    listing(
      [key],
      '<IsTruncated>false</IsTruncated><NextContinuationToken>unexpected</NextContinuationToken>',
    ),
    listing(
      [key],
      '<IsTruncated>false</IsTruncated><IsTruncated>true</IsTruncated>',
    ),
    '<!DOCTYPE x [<!ENTITY leak SYSTEM "file:///etc/passwd">]>' +
      listing([key]),
    listing([key]).replace(key, '&undefinedEntity;'),
    listing(Array.from({ length: 1001 }, () => `intents/${randomUUID()}.enc`)),
    'x'.repeat(1048577),
  ])
    assert.throws(() => parsePurgeListing(xml), /R2_PURGE/);
});

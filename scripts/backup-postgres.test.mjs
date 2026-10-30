import { test } from 'node:test';
import assert from 'node:assert/strict';
import { postgresEnvironment } from './backup-postgres.mjs';
test('passes PostgreSQL credentials through environment with verified TLS and the one allowed database', () => {
  const env = postgresEnvironment(
    'postgresql://backup:synthetic%21@ep-synthetic.eu-central-1.aws.neon.tech/snapform?sslmode=require',
  );
  assert.equal(env.PGPASSWORD, 'synthetic!');
  assert.equal(env.PGSSLMODE, 'verify-full');
  assert.equal(env.PGSSLROOTCERT, 'system');
  assert.equal(env.PGDATABASE, 'snapform');
  assert.equal(Object.hasOwn(env, 'DATABASE_URL'), false);
});
test('rejects pooled, foreign, missing and malformed connections without reflecting a credential', () => {
  for (const url of [
    'postgresql://backup:synthetic@ep-test-pooler.region.neon.tech/snapform',
    'postgresql://backup:synthetic@unrelated.example/snapform',
    'postgresql://backup:synthetic@ep-test.region.neon.tech/another',
    'postgresql://ep-test.region.neon.tech/snapform',
    'postgresql://backup:private-password@',
  ]) {
    let caught = false;
    try {
      postgresEnvironment(url);
    } catch (error) {
      caught = true;
      assert.equal(String(error.message).includes('private-password'), false);
    }
    assert.equal(caught, true);
  }
});

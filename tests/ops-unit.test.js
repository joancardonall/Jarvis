import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, stat, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { databaseUrl, writePrivate } from '../scripts/ops-config.js';
import { packSnapshot, validateSnapshot, migrationDefinition } from '../scripts/database-ops.js';

test('operations reject unintended databases, pooled endpoints and non-TLS remote connections', () => {
  for (const url of ['postgresql://u:p@untrusted.example/jarvis_dev?sslmode=require',
    'postgresql://u:p@ep-test.eu-central-1.aws.neon.tech/personal?sslmode=require',
    'postgresql://u:p@ep-test-pooler.eu-central-1.aws.neon.tech/jarvis_dev?sslmode=require',
    'postgresql://u:p@ep-test.eu-central-1.aws.neon.tech/jarvis_dev',
    'postgresql://u:p@ep-test.us-east-1.aws.neon.tech/jarvis_dev?sslmode=require',
    'postgresql://u:p@127.0.0.1/jarvis_dev']) {
    assert.throws(() => databaseUrl(url, 'jarvis_dev'));
  }
  const verified = databaseUrl('postgresql://u:p@ep-test.eu-central-1.aws.neon.tech/jarvis_dev?sslmode=require', 'jarvis_dev');
  assert.equal(new URL(verified).searchParams.get('sslmode'), 'verify-full');
  assert.throws(() => databaseUrl(verified, 'jarvis_dev', { local: true }));
});

test('logical snapshot rejects corruption, wrong migration and unknown fields', async () => {
  const payload = { format: 1, migration_sha256: (await migrationDefinition()).hash, projects: [] };
  const snapshot = packSnapshot(payload);
  assert.deepEqual(await validateSnapshot(snapshot), payload);
  await assert.rejects(validateSnapshot({ ...snapshot, sha256: 'changed' }));
  await assert.rejects(validateSnapshot(packSnapshot({ ...payload, migration_sha256: 'other' })));
  assert.throws(() => packSnapshot({ ...payload, unexpected: true }));
});

test('private output is not overwritten and has restrictive Unix permissions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jarvis-private-test-'));
  try {
    const file = join(dir, 'synthetic.env');
    await writePrivate(file, 'fictitious');
    await assert.rejects(writePrivate(file, 'changed'));
    assert.equal(await readFile(file, 'utf8'), 'fictitious');
    if (process.platform !== 'win32') assert.equal((await stat(file)).mode & 0o777, 0o600);
  } finally { await rm(dir, { recursive: true }); }
});

test('development token generator writes separate private files, never overwrites', async () => {
  const { writeDevelopmentCredentials } = await import('../scripts/token.js');
  const { parseEnv } = await import('node:util');
  const { createHash } = await import('node:crypto');
  const dir = await mkdtemp(join(tmpdir(), 'jarvis-credentials-test-'));
  try {
    await writeDevelopmentCredentials('postgresql://synthetic:synthetic@synthetic.example/jarvis_dev', dir);
    const server = parseEnv(await readFile(join(dir, '.dev.vars'), 'utf8'));
    const client = parseEnv(await readFile(join(dir, '.env.client'), 'utf8'));
    assert.equal(server.DEV_TOKEN_SHA256, createHash('sha256').update(client.JARVIS_BEARER_TOKEN).digest('hex'));
    assert.equal('JARVIS_BEARER_TOKEN' in server, false);
    assert.equal('DATABASE_URL' in client, false);
    await assert.rejects(writeDevelopmentCredentials('unused', dir), /output_already_exists/);
  } finally { await rm(dir, { recursive: true }); }
});

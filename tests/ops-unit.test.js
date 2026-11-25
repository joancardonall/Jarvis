import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, stat, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { databaseUrl, writePrivate } from '../scripts/ops-config.js';
import { packSnapshot, validateSnapshot, migrationHashes } from '../scripts/database-ops.js';

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

test('logical snapshot rejects corruption, wrong migrations, old formats and invalid rows', async () => {
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const instant = '2030-01-01T10:00:00.000Z';
  const project = { id, owner_id: id, name: 'Synthetic', description: '', status: 'paused', priority: 'high',
    review_at: '2030-02-01', snoozed_until: null, created_at: instant, updated_at: instant, last_activity_at: instant,
    idempotency_key: null, request_hash: 'a'.repeat(64) };
  const task = { id, owner_id: id, project_id: id, title: 'Synthetic', notes: '', status: 'open', priority: 'normal',
    due_date: null, created_at: instant, updated_at: instant, completed_at: null, idempotency_key: 'key-1', request_hash: 'a'.repeat(64) };
  const note = { id, owner_id: id, project_id: null, kind: 'decision', content: 'Synthetic', source: '', status: 'active',
    created_at: instant, updated_at: instant, idempotency_key: null, request_hash: 'a'.repeat(64) };
  const payload = { format: 2, migrations: await migrationHashes(), projects: [project], tasks: [task], notes: [note] };
  assert.deepEqual(Object.keys(payload.migrations), ['001', '002', '003']);
  const snapshot = packSnapshot(payload);
  assert.deepEqual(await validateSnapshot(snapshot), payload);
  await assert.rejects(validateSnapshot({ ...snapshot, sha256: 'changed' }));
  await assert.rejects(validateSnapshot(packSnapshot({ ...payload, migrations: { ...payload.migrations, '003': 'other' } })));
  await assert.rejects(validateSnapshot(packSnapshot({ ...payload, migrations: { '001': payload.migrations['001'] } })));
  assert.throws(() => packSnapshot({ ...payload, unexpected: true }));
  assert.throws(() => packSnapshot({ ...payload, format: 1 }));
  assert.throws(() => packSnapshot({ ...payload, projects: [{ ...project, status: 'deleted' }] }));
  assert.throws(() => packSnapshot({ ...payload, projects: [{ ...project, extra: true }] }));
  assert.throws(() => packSnapshot({ ...payload, tasks: [{ ...task, due_date: '2030-1-1' }] }));
  assert.throws(() => packSnapshot({ ...payload, notes: [{ ...note, kind: 'secret' }] }));
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

test('token rotation keeps owner and settings, replaces token, and rejects the old one', async () => {
  const { writeDevelopmentCredentials, rotateDevelopmentToken } = await import('../scripts/token.js');
  const { authenticate } = await import('../src/auth.js');
  const { parseEnv } = await import('node:util');
  const { readdir, writeFile } = await import('node:fs/promises');
  const dir = await mkdtemp(join(tmpdir(), 'jarvis-rotation-test-'));
  const request = (token) => new Request('http://127.0.0.1/', { headers: { Authorization: `Bearer ${token}` } });
  try {
    await writeDevelopmentCredentials('postgresql://synthetic:synthetic@synthetic.example/jarvis_dev', dir);
    const oldServer = parseEnv(await readFile(join(dir, '.dev.vars'), 'utf8'));
    const oldClient = parseEnv(await readFile(join(dir, '.env.client'), 'utf8'));

    const now = Date.now() + 86400000;
    const { expiresAt } = await rotateDevelopmentToken(dir, now);
    const server = parseEnv(await readFile(join(dir, '.dev.vars'), 'utf8'));
    const client = parseEnv(await readFile(join(dir, '.env.client'), 'utf8'));

    assert.equal(server.DEV_OWNER_ID, oldServer.DEV_OWNER_ID);
    assert.equal(server.DATABASE_URL, oldServer.DATABASE_URL);
    assert.equal(server.ALLOWED_ORIGIN, oldServer.ALLOWED_ORIGIN);
    assert.notEqual(client.JARVIS_BEARER_TOKEN, oldClient.JARVIS_BEARER_TOKEN);
    assert.equal(server.DEV_TOKEN_EXPIRES_AT, expiresAt);
    assert.equal(Date.parse(expiresAt), now + 7 * 86400000);
    assert.equal(await authenticate(request(client.JARVIS_BEARER_TOKEN), server), oldServer.DEV_OWNER_ID);
    await assert.rejects(authenticate(request(oldClient.JARVIS_BEARER_TOKEN), server), { status: 401 });
    if (process.platform !== 'win32') {
      assert.equal((await stat(join(dir, '.dev.vars'))).mode & 0o777, 0o600);
      assert.equal((await stat(join(dir, '.env.client'))).mode & 0o777, 0o600);
    }
    assert.deepEqual((await readdir(dir)).sort(), ['.dev.vars', '.env.client']);

    // Broken existing config: refuse and leave files untouched.
    await rm(join(dir, '.dev.vars'));
    await writeFile(join(dir, '.dev.vars'), 'DEV_OWNER_ID="not-a-uuid"\n');
    const clientBefore = await readFile(join(dir, '.env.client'), 'utf8');
    await assert.rejects(rotateDevelopmentToken(dir), /invalid_existing_credentials/);
    assert.equal(await readFile(join(dir, '.env.client'), 'utf8'), clientBefore);
  } finally { await rm(dir, { recursive: true }); }
});

test('OAuth secrets template is private, has a strong signing key and is never overwritten', async () => {
  const { writeOAuthSecretsTemplate } = await import('../scripts/oauth-setup.js');
  const { isSigningSecret } = await import('../src/tokens.js');
  const dir = await mkdtemp(join(tmpdir(), 'jarvis-oauth-setup-test-'));
  try {
    const file = join(dir, '.env.oauth.json');
    await writeOAuthSecretsTemplate(file);
    const first = JSON.parse(await readFile(file, 'utf8'));
    assert.deepEqual(Object.keys(first), ['OAUTH_SIGNING_KEY', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET']);
    assert.equal(isSigningSecret(first.OAUTH_SIGNING_KEY), true);
    assert.equal(first.GITHUB_CLIENT_SECRET, '');
    await assert.rejects(writeOAuthSecretsTemplate(file), /output_already_exists/);
    assert.equal(await readFile(file, 'utf8'), JSON.stringify(first, null, 2) + '\n');
    if (process.platform !== 'win32') assert.equal((await stat(file)).mode & 0o777, 0o600);
  } finally { await rm(dir, { recursive: true }); }
});

test('later migrations are tracked by checksum and keep the projects snapshot format stable', async () => {
  const { laterMigrations } = await import('../scripts/database-ops.js');
  const migrations = await laterMigrations();
  assert.deepEqual(migrations.map(migration => migration.version), ['002', '003']);
  assert.match(migrations[0].sql, /CREATE TABLE oauth_grants/);
  assert.match(migrations[0].hash, /^[a-f0-9]{64}$/);
});

test('Telegram setup keeps the token private and stores only the latest private chat', async () => {
  const { writeTelegramTemplate, fillChatId } = await import('../scripts/telegram-setup.js');
  const { writeFile } = await import('node:fs/promises');
  const dir = await mkdtemp(join(tmpdir(), 'jarvis-telegram-setup-test-'));
  const file = join(dir, '.env.telegram.json');
  const token = '123456789:fictitious-telegram-token-for-tests-only';
  const updates = result => async url => {
    assert.equal(String(url), `https://api.telegram.org/bot${token}/getUpdates`);
    return Response.json({ ok: true, result });
  };
  try {
    await writeTelegramTemplate(file);
    await assert.rejects(writeTelegramTemplate(file), /output_already_exists/);
    if (process.platform !== 'win32') assert.equal((await stat(file)).mode & 0o777, 0o600);
    await assert.rejects(fillChatId(file, updates([])), /invalid_bot_token/); // token not pasted yet
    await writeFile(file, JSON.stringify({ TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: '' }));
    await assert.rejects(fillChatId(file, updates([])), /no_private_message_found/);
    await assert.rejects(fillChatId(file, updates([{ message: { chat: { id: -100, type: 'group' } } }])), /no_private_message_found/);
    await assert.rejects(fillChatId(file, async () => new Response('nope', { status: 401 })), /telegram_unavailable/);
    const found = await fillChatId(file, updates([{ message: { chat: { id: 111, type: 'private' } } },
      { edited_message: {} }, { message: { chat: { id: 222, type: 'private', first_name: 'Synthetic' } } },
      { message: { chat: { id: -5, type: 'group' } } }]));
    assert.deepEqual(found, { chatId: '222', name: 'Synthetic' });
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: '222' });
    const { telegramSettings } = await import('../src/telegram.js');
    assert.deepEqual(telegramSettings(JSON.parse(await readFile(file, 'utf8'))), { token, chat: '222' });
  } finally { await rm(dir, { recursive: true }); }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { CREATE_PROJECT, GET_PROJECT, createValues, grantOperations } from '../src/repository.js';
import { domainOperations } from '../src/domain-repository.js';
import { exerciseDomainStorage } from './domain-storage.js';
import { setup, ownerA, ownerB } from './helpers.js';
import { exerciseGrantStorage } from './grant-storage.js';

// Never infer a test target from DATABASE_URL. Require an explicitly dedicated loopback DB.
const target = process.env.TEST_DATABASE_URL;
if (!target) throw new Error('Set TEST_DATABASE_URL to a dedicated local jarvis_test database');
const parsed = new URL(target);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) ||
    parsed.pathname !== '/jarvis_test' || target === process.env.DATABASE_URL) {
  throw new Error('Tests require an isolated local database named jarvis_test');
}

test('real PostgreSQL migration, API/MCP, concurrent idempotency, rollback and constraints', async () => {
  const admin = new Pool({ connectionString: target });
  const schema = 'jarvis_test_' + crypto.randomUUID().replaceAll('-', '');
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString: target, options: `-c search_path=${schema}`, max: 12 });
  const repository = {
    async create(data) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query(CREATE_PROJECT, createValues(data));
        await client.query('COMMIT');
        return result.rows[0];
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
    async get(owner, id) { return (await pool.query(GET_PROJECT, [owner, id])).rows[0]; },
  };
  try {
    const migration = await readFile(new URL('../migrations/001_projects.sql', import.meta.url), 'utf8');
    await pool.query(migration);
    const api = await setup(repository);
    const body = { name: 'Fictitious PostgreSQL project', description: 'Synthetic' };
    const headers = { 'Idempotency-Key': 'concurrent-key' };
    const responses = await Promise.all(Array.from({ length: 10 }, () => api.request('/api/v1/projects', { body, headers })));
    assert.ok(responses.every(response => response.status === 201));
    const projects = await Promise.all(responses.map(response => response.json()));
    assert.equal(new Set(projects.map(p => p.id)).size, 1);
    const project = projects[0];
    const client = await api.connect();
    try {
      assert.deepEqual((await client.callTool({ name: 'jarvis.get_project', arguments: { project_id: project.id } })).structuredContent, project);
      const other = await client.callTool({ name: 'jarvis.create_project', arguments: { name: 'MCP synthetic project' } });
      const newInstance = await setup(repository);
      assert.deepEqual(await (await newInstance.request(`/api/v1/projects/${other.structuredContent.id}`)).json(), other.structuredContent);
    } finally { await client.close(); }
    const b = await setup(repository, ownerB);
    assert.equal((await b.request(`/api/v1/projects/${project.id}`)).status, 404);
    const differentOwner = await (await b.request('/api/v1/projects', { body, headers })).json();
    assert.notEqual(differentOwner.id, project.id);
    assert.equal((await api.request('/api/v1/projects', { body: { name: 'Conflict' }, headers })).status, 409);
    assert.deepEqual(await (await api.request(`/api/v1/projects/${project.id}`)).json(), project);
    const unkeyed = await Promise.all([api.request('/api/v1/projects', { body }), api.request('/api/v1/projects', { body })]);
    assert.notEqual((await unkeyed[0].json()).id, (await unkeyed[1].json()).id);
    const transaction = await pool.connect();
    const rollbackId = crypto.randomUUID();
    try {
      await transaction.query('BEGIN');
      await transaction.query(CREATE_PROJECT, [rollbackId, ownerB, 'Rollback synthetic', '', 'rollback-key', 'a'.repeat(64)]);
      await assert.rejects(transaction.query(CREATE_PROJECT, [crypto.randomUUID(), ownerB, '', '', null, 'a'.repeat(64)]), { code: '23514' });
      await transaction.query('ROLLBACK');
      assert.equal((await pool.query('SELECT id FROM projects WHERE id = $1', [rollbackId])).rowCount, 0);
    } finally { transaction.release(); }
    await assert.rejects(pool.query("UPDATE projects SET status = 'completed' WHERE id = $1", [project.id]), { code: '23514' });
    await assert.rejects(pool.query('UPDATE projects SET owner_id = NULL WHERE id = $1', [project.id]), { code: '23502' });
    // Reuse rolled-back key: no reservation leaked.
    assert.equal((await b.request('/api/v1/projects', { body, headers: { 'Idempotency-Key': 'rollback-key' } })).status, 201);
    assert.equal((await pool.query('SELECT count(*) FROM projects')).rows[0].count, '6');
  } finally {
    await pool.end();
    // Only this test's randomly named schema; never public or an arbitrary schema.
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});

test('real PostgreSQL: OAuth grant migration, single-use codes, rotation and constraints', async () => {
  const admin = new Pool({ connectionString: target });
  const schema = 'jarvis_test_' + crypto.randomUUID().replaceAll('-', '');
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString: target, options: `-c search_path=${schema}`, max: 12 });
  try {
    await pool.query(await readFile(new URL('../migrations/002_oauth_grants.sql', import.meta.url), 'utf8'));
    const storage = grantOperations(async (text, values) => (await pool.query(text, values)).rows);
    await exerciseGrantStorage(storage, ownerA);
    // Ten simultaneous exchanges of the same code: the database lets exactly one win.
    const code = 'e'.repeat(64);
    await storage.createGrant({ id: crypto.randomUUID(), owner_id: ownerA, client_hash: 'c'.repeat(64),
      redirect_uri: 'http://localhost/callback', code_hash: code, code_challenge: 'k'.repeat(43),
      code_expires_at: new Date(Date.now() + 60000) });
    const results = await Promise.all(Array.from({ length: 10 }, (_, index) => storage.redeemCode(code, {
      access_hash: index.toString(16).repeat(64), refresh_hash: (index + 6).toString(16).repeat(64),
      access_expires_at: new Date(Date.now() + 3600000), refresh_expires_at: new Date(Date.now() + 86400000) }, new Date())));
    assert.equal(results.filter(Boolean).length, 1);
    await assert.rejects(pool.query("UPDATE oauth_grants SET access_hash = 'not-a-hash'"), { code: '23514' });
    await assert.rejects(pool.query('UPDATE oauth_grants SET owner_id = NULL'), { code: '23502' });
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});

test('real PostgreSQL: migration 003 keeps existing projects; tasks, notes and summary ledger follow the shared scenario', async () => {
  const admin = new Pool({ connectionString: target });
  const schema = 'jarvis_test_' + crypto.randomUUID().replaceAll('-', '');
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString: target, options: `-c search_path=${schema}`, max: 12 });
  const run = async (text, values) => (await pool.query(text, values)).rows;
  const sql = name => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
  try {
    // A project created before the migration must survive it with sensible defaults.
    await pool.query(await sql('001_projects.sql'));
    const legacy = (await run(CREATE_PROJECT, [crypto.randomUUID(), ownerB, 'Legacy project', '', null, 'a'.repeat(64)]))[0];
    await pool.query("UPDATE projects SET updated_at = '2029-12-01T10:00:00Z' WHERE id = $1", [legacy.id]);
    await pool.query(await sql('003_tasks_notes_summary.sql'));
    const migrated = (await run(GET_PROJECT, [ownerB, legacy.id]))[0];
    assert.equal(migrated.priority, 'normal');
    assert.equal(migrated.status, 'active');
    assert.equal(migrated.review_at, null);
    assert.equal(migrated.last_activity_at.toISOString(), '2029-12-01T10:00:00.000Z');
    await pool.query('DELETE FROM projects');

    const storage = { ...domainOperations(run), get: async (owner, id) => (await run(GET_PROJECT, [owner, id]))[0] };
    const createProject = async (owner, name, description) =>
      (await run(CREATE_PROJECT, [crypto.randomUUID(), owner, name, description, null, 'a'.repeat(64)]))[0];
    await exerciseDomainStorage(storage, createProject, ownerA, ownerB);

    // The database itself refuses cross-owner links and inconsistent rows, whatever the application does.
    const foreign = await createProject(ownerB, 'Constraint project', '');
    await assert.rejects(pool.query(`INSERT INTO tasks (id, owner_id, project_id, title, request_hash)
      VALUES ($1, $2, $3, 'Cross owner', $4)`, [crypto.randomUUID(), ownerA, foreign.id, 'a'.repeat(64)]), { code: '23503' });
    await assert.rejects(pool.query(`INSERT INTO notes (id, owner_id, project_id, kind, content, request_hash)
      VALUES ($1, $2, $3, 'note', 'Cross owner', $4)`, [crypto.randomUUID(), ownerA, foreign.id, 'a'.repeat(64)]), { code: '23503' });
    await assert.rejects(pool.query("UPDATE tasks SET status = 'done' WHERE completed_at IS NULL"), { code: '23514' });
    await assert.rejects(pool.query("UPDATE tasks SET status = 'pending'"), { code: '23514' });
    await assert.rejects(pool.query("UPDATE notes SET kind = 'secret'"), { code: '23514' });
    await assert.rejects(pool.query("UPDATE projects SET status = 'deleted'"), { code: '23514' });
    await assert.rejects(pool.query("UPDATE projects SET priority = 'urgent'"), { code: '23514' });
    await assert.rejects(pool.query("UPDATE tasks SET title = '  '"), { code: '23514' });

    // Ten simultaneous creations with one idempotency key produce a single task.
    const key = 'concurrent-task';
    const created = await Promise.all(Array.from({ length: 10 }, () => storage.createTask({ id: crypto.randomUUID(),
      owner_id: ownerA, project_id: null, title: 'Concurrent', notes: '', priority: 'normal', due_date: null,
      idempotency_key: key, request_hash: 'e'.repeat(64) }, new Date())));
    assert.equal(new Set(created.map(row => row.id)).size, 1);
    // Ten simultaneous claims of the same day: exactly one may send.
    const claims = await Promise.all(Array.from({ length: 10 }, () => storage.claimSummary(ownerA, '2031-05-05', new Date())));
    assert.equal(claims.filter(Boolean).length, 1);
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});

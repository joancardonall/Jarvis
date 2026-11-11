import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { CREATE_PROJECT, GET_PROJECT, createValues } from '../src/repository.js';
import { setup, ownerB } from './helpers.js';

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

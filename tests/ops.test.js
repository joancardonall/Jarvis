import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from 'pg';
import { provision, applyRoles } from '../scripts/provision.js';
import { migrate, snapshotProjects, restoreProjects } from '../scripts/database-ops.js';
import { CREATE_PROJECT, createValues } from '../src/repository.js';
import { createProjectService } from '../src/projects.js';
import { ownerA } from './helpers.js';

const target = process.env.OPS_TEST_ADMIN_URL;
if (!target || process.env.OPS_TEST_ISOLATED_CLUSTER !== 'true') {
  throw new Error('Explicit OPS_TEST_ADMIN_URL and OPS_TEST_ISOLATED_CLUSTER=true required for a disposable loopback cluster');
}

test('real PostgreSQL: limited roles, tracked migration, persisted data and independent restore', async () => {
  const plan = await provision(target, { local: true });
  const migrator = new Client({ connectionString: plan.credentials.jarvis_migrator });
  const runtime = new Client({ connectionString: plan.credentials.jarvis_runtime });
  const restoreUrl = new URL(plan.credentials.jarvis_migrator);
  restoreUrl.pathname = '/jarvis_restore';
  const restore = new Client({ connectionString: restoreUrl.toString() });
  try {
    await applyRoles(plan.clients, plan.passwords);
    await migrator.connect();
    await migrate(migrator);
    await migrate(migrator); // checksum ledger makes a repeated invocation safe
    await migrator.query('GRANT SELECT, INSERT, UPDATE(idempotency_key) ON public.projects TO jarvis_runtime');
    await runtime.connect();
    const repo = {
      async create(data) { return (await runtime.query(CREATE_PROJECT, createValues(data))).rows[0]; },
      async get(owner, id) { return (await runtime.query('SELECT * FROM projects WHERE owner_id=$1 AND id=$2', [owner, id])).rows[0]; },
    };
    const service = createProjectService(repo);
    const first = await service.create(ownerA, { name: 'Synthetic operations proof', idempotency_key: 'restore-key' });
    assert.equal((await service.create(ownerA, { name: 'Synthetic operations proof', idempotency_key: 'restore-key' })).id, first.id);
    for (const query of ['CREATE TABLE public.denied(id int)', 'DELETE FROM projects',
      "UPDATE projects SET name='unauthorized'", 'SELECT * FROM jarvis_migrations']) {
      await assert.rejects(runtime.query(query), { code: '42501' });
    }
    const roles = await migrator.query("SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname='jarvis_runtime'");
    assert.ok(Object.values(roles.rows[0]).every(value => value === false));
    const snapshot = await snapshotProjects(migrator);
    assert.equal(snapshot.payload.projects.length, 1);
    await restore.connect();
    await assert.rejects(restoreProjects(restore, { ...snapshot, sha256: 'corrupt' }));
    await restoreProjects(restore, snapshot);
    const recovered = await snapshotProjects(restore);
    assert.deepEqual(recovered, snapshot);
    await assert.rejects(restoreProjects(restore, snapshot), /restore_database_not_empty/);
    assert.equal((await migrator.query('SELECT count(*) FROM projects')).rows[0].count, '1');
    const fresh = new Client({ connectionString: restoreUrl.toString() });
    try {
      await fresh.connect();
      assert.equal((await fresh.query('SELECT id FROM projects')).rows[0].id, first.id);
      const replay = await fresh.query(CREATE_PROJECT, [crypto.randomUUID(), ownerA, 'Synthetic operations proof', '', 'restore-key', snapshot.payload.projects[0].request_hash]);
      assert.equal(replay.rows[0].id, first.id);
    } finally { await fresh.end(); }
  } finally {
    await Promise.allSettled([migrator, runtime, restore, ...plan.clients].map(client => client.end()));
  }
});

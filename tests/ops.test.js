import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from 'pg';
import { provision, applyRoles } from '../scripts/provision.js';
import { migrate, grantRuntime, snapshotData, restoreData } from '../scripts/database-ops.js';
import { CREATE_PROJECT, GET_PROJECT, createValues, grantOperations } from '../src/repository.js';
import { domainOperations } from '../src/domain-repository.js';
import { createServices } from '../src/services.js';
import { exerciseDomainStorage } from './domain-storage.js';
import { exerciseGrantStorage } from './grant-storage.js';
import { ownerA, ownerB } from './helpers.js';

const target = process.env.OPS_TEST_ADMIN_URL;
if (!target || process.env.OPS_TEST_ISOLATED_CLUSTER !== 'true') {
  throw new Error('Explicit OPS_TEST_ADMIN_URL and OPS_TEST_ISOLATED_CLUSTER=true required for a disposable loopback cluster');
}

test('real PostgreSQL: limited roles, tracked migrations, runtime privileges and independent restore', async () => {
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
    assert.deepEqual((await migrator.query('SELECT version FROM jarvis_migrations ORDER BY version')).rows.map(row => row.version),
      ['001', '002', '003']);
    await grantRuntime(migrator);
    await grantRuntime(migrator);
    await runtime.connect();

    // Everything the Worker does must work with the runtime role's privileges, and nothing more.
    const run = async (text, values) => (await runtime.query(text, values)).rows;
    const repository = { ...domainOperations(run), ...grantOperations(run),
      async create(data) { return (await run(CREATE_PROJECT, createValues(data)))[0]; },
      async get(owner, id) { return (await run(GET_PROJECT, [owner, id]))[0]; } };
    const createProject = (owner, name, description) => repository.create({ id: crypto.randomUUID(), owner_id: owner,
      name, description, idempotency_key: null, request_hash: 'a'.repeat(64) });
    await exerciseDomainStorage(repository, createProject, ownerA, ownerB);
    await exerciseGrantStorage(repository, ownerA);
    const services = createServices(repository);
    const first = await services.projects.create(ownerA, { name: 'Synthetic operations proof', idempotency_key: 'restore-key' });
    assert.equal((await services.projects.create(ownerA, { name: 'Synthetic operations proof', idempotency_key: 'restore-key' })).id, first.id);
    await services.tasks.create(ownerA, { title: 'Synthetic task', project_id: first.id, due_date: '2030-02-28' });
    await services.notes.create(ownerA, { kind: 'decision', content: 'Synthetic decision', project_id: first.id });
    assert.equal((await services.overview(ownerA, { project_id: first.id })).open_tasks.length, 1);
    assert.equal(typeof (await services.summary.daily(ownerA)).text, 'string');

    for (const query of ['CREATE TABLE public.denied(id int)', 'DELETE FROM projects', 'DELETE FROM tasks',
      'DELETE FROM notes', 'DELETE FROM oauth_grants', 'DELETE FROM summary_runs', 'TRUNCATE tasks',
      `UPDATE projects SET owner_id='${ownerB}'`, `UPDATE tasks SET owner_id='${ownerB}'`,
      `UPDATE notes SET owner_id='${ownerB}'`, "UPDATE projects SET request_hash=request_hash",
      "UPDATE tasks SET created_at=now()", 'SELECT * FROM jarvis_migrations', 'ALTER TABLE tasks ADD COLUMN x int',
      'DROP TABLE notes']) {
      await assert.rejects(runtime.query(query), { code: '42501' }, query);
    }
    const roles = await migrator.query("SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname='jarvis_runtime'");
    assert.ok(Object.values(roles.rows[0]).every(value => value === false));

    // Backup covers projects, tasks and notes of every owner; operational tables are left out.
    const snapshot = await snapshotData(migrator);
    assert.equal(snapshot.payload.format, 2);
    assert.ok(snapshot.payload.projects.length >= 4);
    assert.ok(snapshot.payload.tasks.some(task => task.due_date === '2030-02-28'));
    assert.ok(snapshot.payload.notes.some(note => note.content === 'Synthetic decision'));
    assert.equal('oauth_grants' in snapshot.payload, false);
    await restore.connect();
    await assert.rejects(restoreData(restore, { ...snapshot, sha256: 'corrupt' }));
    assert.equal((await restore.query("SELECT 1 FROM pg_tables WHERE schemaname = 'public'")).rowCount, 0);
    await restoreData(restore, snapshot);
    const recovered = await snapshotData(restore);
    assert.deepEqual(recovered, snapshot);
    await assert.rejects(restoreData(restore, snapshot), /restore_database_not_empty/);
    assert.equal((await restore.query('SELECT count(*) FROM oauth_grants')).rows[0].count, '0');
    assert.equal((await restore.query('SELECT count(*) FROM summary_runs')).rows[0].count, '0');
    const fresh = new Client({ connectionString: restoreUrl.toString() });
    try {
      await fresh.connect();
      assert.equal((await fresh.query('SELECT name FROM projects WHERE id = $1', [first.id])).rows[0].name, 'Synthetic operations proof');
      // Idempotency state travels with the data: a replay after the restore still finds the original.
      const original = snapshot.payload.projects.find(project => project.id === first.id);
      const replay = await fresh.query(CREATE_PROJECT, [crypto.randomUUID(), ownerA, 'Synthetic operations proof', '', 'restore-key', original.request_hash]);
      assert.equal(replay.rows[0].id, first.id);
      // Links between tables are intact.
      assert.equal((await fresh.query('SELECT count(*) FROM tasks t JOIN projects p ON p.id = t.project_id AND p.owner_id = t.owner_id')).rows[0].count,
        String(snapshot.payload.tasks.filter(task => task.project_id).length));
    } finally { await fresh.end(); }
  } finally {
    await Promise.allSettled([migrator, runtime, restore, ...plan.clients].map(client => client.end()));
  }
});

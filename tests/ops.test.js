import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from 'pg';
import { provision, applyRoles } from '../scripts/provision.js';
import { migrate, grantRuntime, snapshotData, restoreData, snapshotRows, purgeDiscarded, listConnections,
  revokeConnections } from '../scripts/database-ops.js';
import { createHash } from 'node:crypto';
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
      ['001', '002', '003', '004']);
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
      'DELETE FROM courses', 'DELETE FROM course_groups', `UPDATE courses SET owner_id='${ownerB}'`,
      `UPDATE course_groups SET course_id='${ownerB}'`, "UPDATE course_groups SET label='x'",
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
    assert.equal(snapshot.payload.format, 3);
    assert.ok(snapshot.payload.courses.length >= 2);
    assert.ok(snapshot.payload.course_groups.length >= 4);
    assert.ok(snapshot.payload.tasks.some(task => task.course_id));
    assert.ok(snapshot.payload.projects.length >= 4);
    assert.ok(snapshot.payload.tasks.some(task => task.due_date === '2030-02-28'));
    assert.ok(snapshot.payload.notes.some(note => note.content === 'Synthetic decision'));
    assert.equal('oauth_grants' in snapshot.payload, false);
    await restore.connect();
    await assert.rejects(restoreData(restore, { ...snapshot, sha256: 'corrupt' }));
    assert.equal((await restore.query("SELECT 1 FROM pg_tables WHERE schemaname = 'public'")).rowCount, 0);
    // A corrupt row makes the whole restore fail and leaves the target database empty again.
    const broken = structuredClone(snapshot.payload);
    broken.tasks.push({ ...broken.tasks[0], id: crypto.randomUUID(), project_id: crypto.randomUUID(), idempotency_key: null });
    await assert.rejects(restoreData(restore, { payload: broken, sha256: createHash('sha256').update(JSON.stringify(broken)).digest('hex') }));
    assert.equal((await restore.query("SELECT 1 FROM pg_tables WHERE schemaname = 'public'")).rowCount, 0);
    await restoreData(restore, snapshot);
    const recovered = await snapshotData(restore);
    assert.deepEqual(recovered, snapshot);
    assert.deepEqual(snapshotRows(recovered.payload), snapshotRows(snapshot.payload));
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

    // --- Data policy operations, with the migration role ---
    // Connections: list without hashes, revoke one, revoke all.
    const connections = await listConnections(migrator, new Date(Date.UTC(2030, 0, 1, 0, 2)));
    assert.ok(connections.length >= 3);
    assert.deepEqual(Object.keys(connections[0]).sort(), ['client', 'created_at', 'id', 'last_renewed_at', 'status']);
    assert.equal(JSON.stringify(connections).includes('hash'), false);
    assert.ok(connections.every(item => item.client === 'localhost'));
    assert.ok(connections.some(item => item.status === 'revoked') && connections.some(item => item.status === 'active'));
    const active = connections.find(item => item.status === 'active');
    await assert.rejects(revokeConnections(migrator, 'not-an-id'), /invalid_connection_id/);
    await assert.rejects(revokeConnections(migrator, undefined), /invalid_connection_id/);
    assert.equal(await revokeConnections(migrator, active.id), 1);
    assert.equal(await revokeConnections(migrator, active.id), 0);
    assert.equal((await listConnections(migrator)).find(item => item.id === active.id).status, 'revoked');
    assert.ok(await revokeConnections(migrator, 'all') >= 0);
    assert.equal((await listConnections(migrator)).some(item => item.status === 'active'), false);

    // Purge: discarded items older than the limit are erased for real; live data is untouched.
    const live = await services.projects.create(ownerA, { name: 'Live project' });
    const doomed = await services.projects.create(ownerA, { name: 'Doomed project' });
    const keptTask = await services.tasks.create(ownerA, { title: 'Live task', project_id: live.id });
    const inside = await services.tasks.create(ownerA, { title: 'Task inside doomed project', project_id: doomed.id });
    const cancelled = await services.tasks.create(ownerA, { title: 'Cancelled task' });
    await services.tasks.update(ownerA, { task_id: cancelled.id, status: 'cancelled' });
    const done = await services.tasks.create(ownerA, { title: 'Done task' });
    await services.tasks.update(ownerA, { task_id: done.id, status: 'done' });
    const forgotten = await services.notes.create(ownerA, { kind: 'preference', content: 'Forgotten note' });
    await services.notes.update(ownerA, { note_id: forgotten.id, status: 'inactive' });
    const keptNote = await services.notes.create(ownerA, { kind: 'fact', content: 'Live note', project_id: live.id });
    const insideNote = await services.notes.create(ownerA, { kind: 'fact', content: 'Note inside doomed project', project_id: doomed.id });
    await services.projects.update(ownerA, { project_id: doomed.id, status: 'archived' });
    const oldCourse = await services.courses.create(ownerA, { name: 'Doomed course' });
    await services.courses.saveGroup(ownerA, { course_id: oldCourse.id, kind: 'lab', teacher: 'Synthetic' });
    const deliverable = await services.tasks.create(ownerA, { title: 'Deliverable of doomed course', course_id: oldCourse.id });
    await services.courses.update(ownerA, { course_id: oldCourse.id, status: 'archived' });
    const exists = async (table, id) => (await migrator.query(`SELECT 1 FROM ${table} WHERE id = $1`, [id])).rowCount === 1;
    // Later than every date used by the shared scenarios (which live in 2030).
    // Linked to something erased and to something live: kept, and only the erased link is removed.
    const liveCourse = await services.courses.create(ownerA, { name: 'Live course' });
    const sharedTask = await services.tasks.create(ownerA, { title: 'In doomed project and live course', project_id: doomed.id, course_id: liveCourse.id });
    const sharedNote = await services.notes.create(ownerA, { kind: 'fact', content: 'In live project and doomed course', project_id: live.id, course_id: oldCourse.id });
    const bothDoomed = await services.tasks.create(ownerA, { title: 'In doomed project and doomed course', project_id: doomed.id, course_id: oldCourse.id });
    await migrator.query("UPDATE projects SET status = 'archived' WHERE id = $1", [doomed.id]);
    await migrator.query("UPDATE courses SET status = 'archived' WHERE id = $1", [oldCourse.id]);
    const future = new Date(Date.UTC(2032, 0, 1));

    await assert.rejects(purgeDiscarded(migrator, { days: -1 }), /invalid_days/);
    await assert.rejects(purgeDiscarded(migrator, { days: 1.5 }), /invalid_days/);
    // Nothing is old enough yet.
    const early = await purgeDiscarded(migrator, { days: 30, confirm: true });
    assert.deepEqual([early.erased.projects, early.erased.courses], [0, 0]);
    assert.ok(await exists('projects', doomed.id) && await exists('notes', forgotten.id));
    // Preview from a later date: exact counts, nothing erased.
    const preview = await purgeDiscarded(migrator, { days: 30, now: future });
    assert.equal(preview.confirmed, false);
    assert.ok(preview.erased.projects >= 1 && preview.erased.courses >= 1 && preview.erased.oauth_grants >= 3);
    assert.ok(await exists('projects', doomed.id) && await exists('notes', forgotten.id) && await exists('tasks', cancelled.id));
    // Confirmed: discarded data and what it contained are gone; everything live remains.
    const purged = await purgeDiscarded(migrator, { days: 30, confirm: true, now: future });
    assert.deepEqual(purged.erased, preview.erased);
    assert.deepEqual([preview.unlinked, purged.unlinked], [{ tasks: 1, notes: 1 }, { tasks: 1, notes: 1 }]);
    assert.equal(await exists('tasks', bothDoomed.id), false);
    assert.deepEqual((await migrator.query('SELECT project_id, course_id FROM tasks WHERE id = $1', [sharedTask.id])).rows,
      [{ project_id: null, course_id: liveCourse.id }]);
    assert.deepEqual((await migrator.query('SELECT project_id, course_id FROM notes WHERE id = $1', [sharedNote.id])).rows,
      [{ project_id: live.id, course_id: null }]);
    for (const [table, id] of [['projects', doomed.id], ['tasks', inside.id], ['notes', insideNote.id], ['tasks', cancelled.id],
      ['notes', forgotten.id], ['courses', oldCourse.id], ['tasks', deliverable.id]]) {
      assert.equal(await exists(table, id), false, table);
    }
    for (const [table, id] of [['projects', live.id], ['tasks', keptTask.id], ['notes', keptNote.id], ['tasks', done.id], ['projects', first.id]]) {
      assert.equal(await exists(table, id), true, table);
    }
    assert.equal((await migrator.query('SELECT count(*) FROM course_groups WHERE course_id = $1', [oldCourse.id])).rows[0].count, '0');
    assert.equal((await migrator.query('SELECT count(*) FROM oauth_grants')).rows[0].count, '0');
    assert.equal((await migrator.query('SELECT count(*) FROM summary_runs')).rows[0].count, '0');
    const repeat = await purgeDiscarded(migrator, { days: 30, confirm: true, now: future });
    assert.ok(Object.values(repeat.erased).every(rows => rows === 0));
    assert.deepEqual(repeat.unlinked, { tasks: 0, notes: 0 });
    // The application keeps working after a purge.
    assert.equal((await services.overview(ownerA, { project_id: live.id })).open_tasks.length, 1);
  } finally {
    await Promise.allSettled([migrator, runtime, restore, ...plan.clients].map(client => client.end()));
  }
});

import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { z } from 'zod';

const checksum = value => createHash('sha256').update(value).digest('hex');
export async function migrationDefinition() {
  const sql = await readFile(new URL('../migrations/001_projects.sql', import.meta.url), 'utf8');
  return { sql, hash: checksum(sql) };
}

// Migrations applied after version 001, in order.
const LATER_MIGRATIONS = [{ version: '002', file: '002_oauth_grants.sql' },
  { version: '003', file: '003_tasks_notes_summary.sql' }, { version: '004', file: '004_courses.sql' }];
const withoutTransaction = sql => sql.replace(/^BEGIN;\s*/, '').replace(/COMMIT;\s*$/, '');

export async function laterMigrations() {
  return Promise.all(LATER_MIGRATIONS.map(async ({ version, file }) => {
    const sql = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8');
    return { version, sql, hash: checksum(sql) };
  }));
}

// Applies every pending migration inside one transaction and records its checksum in a ledger.
// Repeating the command is safe; a reviewed file that changed after being applied is refused.
export async function migrate(client) {
  await client.query('BEGIN');
  try {
    await applyMigrations(client);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

// The migration steps without transaction control, so a restore can run them and insert the
// data inside one single transaction.
async function applyMigrations(client) {
  const definition = await migrationDefinition();
  {
    const existing = await client.query("SELECT to_regclass('public.jarvis_migrations') AS ledger, to_regclass('public.projects') AS projects");
    if (existing.rows[0].ledger) {
      const record = await client.query("SELECT sha256 FROM public.jarvis_migrations WHERE version = '001'");
      if (record.rows[0]?.sha256 !== definition.hash || !existing.rows[0].projects) throw new Error('migration_mismatch');
    } else {
      if (existing.rows[0].projects) throw new Error('untracked_existing_schema');
      // The reviewed SQL includes BEGIN/COMMIT for psql. One outer transaction also records its checksum.
      await client.query(withoutTransaction(definition.sql));
      await client.query('CREATE TABLE public.jarvis_migrations (version text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
      await client.query('INSERT INTO public.jarvis_migrations(version, sha256) VALUES ($1, $2)', ['001', definition.hash]);
    }
    for (const migration of await laterMigrations()) {
      const record = await client.query('SELECT sha256 FROM public.jarvis_migrations WHERE version = $1', [migration.version]);
      if (record.rows[0]) {
        if (record.rows[0].sha256 !== migration.hash) throw new Error('migration_mismatch');
        continue;
      }
      await client.query(withoutTransaction(migration.sql));
      await client.query('INSERT INTO public.jarvis_migrations(version, sha256) VALUES ($1, $2)', [migration.version, migration.hash]);
    }
  }
}

// Runtime privileges: the application role can read and write rows but never delete them, alter
// the schema or change who owns a row (owner_id, ids and fingerprints are not updatable columns).
export const RUNTIME_GRANTS = [
  `GRANT SELECT, INSERT, UPDATE (idempotency_key, name, description, status, priority, review_at,
     snoozed_until, updated_at, last_activity_at) ON public.projects TO jarvis_runtime`,
  'GRANT SELECT, INSERT, UPDATE ON public.oauth_grants TO jarvis_runtime',
  `GRANT SELECT, INSERT, UPDATE (idempotency_key, title, notes, status, priority, due_date, project_id,
     course_id, completed_at, updated_at) ON public.tasks TO jarvis_runtime`,
  'GRANT SELECT, INSERT, UPDATE (idempotency_key, content, kind, status, updated_at) ON public.notes TO jarvis_runtime',
  'GRANT SELECT, INSERT, UPDATE (status, attempts, updated_at) ON public.summary_runs TO jarvis_runtime',
  'GRANT SELECT, INSERT, UPDATE (idempotency_key, name, code, term, notes, status, updated_at) ON public.courses TO jarvis_runtime',
  'GRANT SELECT, INSERT, UPDATE (teacher, schedule, location, status, updated_at) ON public.course_groups TO jarvis_runtime',
];
export async function grantRuntime(client) {
  for (const statement of RUNTIME_GRANTS) await client.query(statement);
}

// Logical backup: the user's data, that is projects, courses, tasks and notes. OAuth grants and
// the summary ledger are operational state and are deliberately left out: after a restore, clients
// log in again. Every value is validated before it is written or restored.
// Format 3 is written; format 2 (before courses) can still be restored: fields and tables added
// later take their defaults, exactly as the migrations give them to existing rows.
const id = z.string().uuid();
const instant = z.iso.datetime();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();
const key = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/).nullable();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const priority = z.enum(['low', 'normal', 'high']);
// Order matters for restoring: a table comes after the tables it references.
const TABLES = {
  projects: z.object({ id, owner_id: id, name: z.string().min(1).max(200), description: z.string().max(2000),
    status: z.enum(['active', 'paused', 'completed', 'archived']), priority, review_at: day, snoozed_until: day,
    created_at: instant, updated_at: instant, last_activity_at: instant, idempotency_key: key, request_hash: hash }).strict(),
  courses: z.object({ id, owner_id: id, name: z.string().min(1).max(200), code: z.string().max(40),
    term: z.string().max(60), notes: z.string().max(4000), status: z.enum(['active', 'archived']),
    created_at: instant, updated_at: instant, idempotency_key: key, request_hash: hash }).strict(),
  course_groups: z.object({ id, owner_id: id, course_id: id, kind: z.enum(['theory', 'seminar', 'lab', 'other']),
    label: z.string().max(60), teacher: z.string().max(200), schedule: z.string().max(300),
    location: z.string().max(200), status: z.enum(['active', 'inactive']), created_at: instant, updated_at: instant }).strict(),
  tasks: z.object({ id, owner_id: id, project_id: id.nullable(), title: z.string().min(1).max(300),
    notes: z.string().max(4000), status: z.enum(['open', 'done', 'cancelled']), priority, due_date: day,
    created_at: instant, updated_at: instant, completed_at: instant.nullable(), idempotency_key: key, request_hash: hash,
    course_id: id.nullable().default(null) }).strict(),
  notes: z.object({ id, owner_id: id, project_id: id.nullable(),
    kind: z.enum(['decision', 'open_question', 'fact', 'preference', 'note']), content: z.string().min(1).max(4000),
    source: z.string().max(200), status: z.enum(['active', 'inactive']),
    created_at: instant, updated_at: instant, idempotency_key: key, request_hash: hash,
    course_id: id.nullable().default(null) }).strict(),
};
const payloadSchema = z.object({ format: z.union([z.literal(2), z.literal(3)]), migrations: z.record(z.string(), z.string()),
  projects: z.array(TABLES.projects).max(10000), courses: z.array(TABLES.courses).max(1000).default([]),
  course_groups: z.array(TABLES.course_groups).max(10000).default([]),
  tasks: z.array(TABLES.tasks).max(50000), notes: z.array(TABLES.notes).max(50000) }).strict();

export async function migrationHashes() {
  const later = await laterMigrations();
  return Object.fromEntries([['001', (await migrationDefinition()).hash], ...later.map(item => [item.version, item.hash])]);
}

export function packSnapshot(payload) {
  const validated = payloadSchema.parse(payload);
  return { payload: validated, sha256: checksum(JSON.stringify(validated)) };
}

// A snapshot is restorable when it is intact and every migration it was taken under is still one
// of ours, unchanged. Newer migrations are fine: they are applied before the rows are inserted.
export async function validateSnapshot(snapshot) {
  if (snapshot?.sha256 !== checksum(JSON.stringify(snapshot?.payload))) throw new Error('invalid_snapshot');
  const payload = payloadSchema.parse(snapshot.payload);
  const current = await migrationHashes();
  const taken = Object.entries(payload.migrations);
  if (!taken.length || !taken.every(([version, sha]) => current[version] === sha)) throw new Error('invalid_snapshot');
  return payload;
}

// The rows of a snapshot in a form that can be compared across formats (used to verify a restore).
export function snapshotRows(payload) {
  const parsed = payloadSchema.parse(payload);
  return Object.fromEntries(Object.keys(TABLES).map(table => [table, parsed[table]]));
}

// pg returns timestamps and dates as Date objects; the snapshot stores unambiguous text.
const DAY_COLUMNS = ['review_at', 'snoozed_until', 'due_date'];
const pad = number => String(number).padStart(2, '0');
function plain(row) {
  return Object.fromEntries(Object.entries(row).map(([name, value]) => {
    if (!(value instanceof Date)) return [name, value];
    return [name, DAY_COLUMNS.includes(name)
      ? `${String(value.getFullYear()).padStart(4, '0')}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}` : value.toISOString()];
  }));
}

export async function snapshotData(client) {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const migrations = await migrationHashes();
    const ledger = await client.query('SELECT version, sha256 FROM public.jarvis_migrations ORDER BY version');
    if (JSON.stringify(Object.fromEntries(ledger.rows.map(row => [row.version, row.sha256]))) !== JSON.stringify(migrations)) {
      throw new Error('migration_mismatch');
    }
    const payload = { format: 3, migrations };
    for (const [table, schema] of Object.entries(TABLES)) {
      // Explicit column list in the schema's order, so the file does not depend on column order in the database.
      payload[table] = (await client.query(`SELECT ${Object.keys(schema.shape).join(', ')} FROM public.${table} ORDER BY id`)).rows.map(plain);
    }
    const snapshot = packSnapshot(payload);
    await client.query('COMMIT');
    return snapshot;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

export async function restoreData(client, snapshot) {
  const payload = await validateSnapshot(snapshot);
  // Restores are never allowed over existing application or migration state.
  const tables = await client.query("SELECT 1 FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') LIMIT 1");
  if (tables.rowCount) throw new Error('restore_database_not_empty');
  // Schema, ledger and rows in one transaction: a failed restore leaves the database empty again.
  await client.query('BEGIN');
  try {
    await applyMigrations(client);
    // Table and column names come from the fixed schemas above, never from the snapshot file.
    for (const [table, schema] of Object.entries(TABLES)) {
      const columns = Object.keys(schema.shape);
      const insert = `INSERT INTO public.${table} (${columns.join(', ')}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(', ')})`;
      for (const row of payload[table]) await client.query(insert, columns.map(column => row[column]));
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

// --- Data policy operations (D027). Run by the developer with the migration role, never by the Worker. ---

// Permanently erases what the user already discarded (forgotten notes, cancelled tasks, archived
// projects and courses with everything inside them) once it is older than `days`, plus expired
// operational rows. With confirm = false everything runs and is rolled back: an exact preview.
// Command-line arguments of the purge: `--days N` and `--confirm`, nothing else. Erasing needs an
// explicit period, so a typo (`--day 90`, `--days=90`, an empty value) can never erase with a default.
export function purgeArguments(args) {
  let days = null;
  let confirm = false;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--confirm' && !confirm) confirm = true;
    else if (args[index] === '--days' && days === null && /^\d{1,4}$/.test(args[index + 1] ?? '')) days = Number(args[++index]);
    else throw new Error('invalid_purge_arguments');
  }
  if (confirm && days === null) throw new Error('invalid_purge_arguments');
  return { days: days ?? 30, confirm };
}

export async function purgeDiscarded(client, { days, confirm = false, now = new Date() }) {
  if (!Number.isInteger(days) || days < 0 || days > 3650) throw new Error('invalid_days');
  const cutoff = new Date(now.getTime() - days * 86400000).toISOString();
  const count = async (text, values = [cutoff]) => (await client.query(text, values)).rowCount;
  const archivedProjects = "SELECT id FROM public.projects WHERE status = 'archived' AND updated_at < $1";
  const archivedCourses = "SELECT id FROM public.courses WHERE status = 'archived' AND updated_at < $1";
  await client.query('BEGIN');
  try {
    // A task or note inside an archived project (or course) that also belongs to a live course (or
    // project) is still in use: it only loses the link to what is being erased.
    const unlinked = {};
    for (const table of ['tasks', 'notes']) {
      unlinked[table] = await count(`UPDATE public.${table} SET project_id = NULL WHERE project_id IN (${archivedProjects})
        AND course_id IS NOT NULL AND course_id NOT IN (${archivedCourses})`)
        + await count(`UPDATE public.${table} SET course_id = NULL WHERE course_id IN (${archivedCourses})
        AND project_id IS NOT NULL AND project_id NOT IN (${archivedProjects})`);
    }
    const erased = {
      notes: await count(`DELETE FROM public.notes WHERE (status = 'inactive' AND updated_at < $1)
        OR project_id IN (${archivedProjects}) OR course_id IN (${archivedCourses})`),
      tasks: await count(`DELETE FROM public.tasks WHERE (status = 'cancelled' AND updated_at < $1)
        OR project_id IN (${archivedProjects}) OR course_id IN (${archivedCourses})`),
      course_groups: await count(`DELETE FROM public.course_groups WHERE (status = 'inactive' AND updated_at < $1)
        OR course_id IN (${archivedCourses})`),
      projects: await count(`DELETE FROM public.projects WHERE id IN (${archivedProjects})`),
      courses: await count(`DELETE FROM public.courses WHERE id IN (${archivedCourses})`),
      // Connections that can no longer be used: revoked, expired, or a code that was never redeemed.
      oauth_grants: await count(`DELETE FROM public.oauth_grants WHERE revoked_at < $1 OR refresh_expires_at < $1
        OR (code_used_at IS NULL AND code_expires_at < $1)`),
      summary_runs: await count("DELETE FROM public.summary_runs WHERE summary_date < ($1::timestamptz AT TIME ZONE 'Europe/Madrid')::date"),
    };
    await client.query(confirm ? 'COMMIT' : 'ROLLBACK');
    return { erased, unlinked, confirmed: confirm, cutoff };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

// Lists client connections without exposing any hash: enough to recognise and revoke one.
export async function listConnections(client, now = new Date()) {
  const result = await client.query(`SELECT id, created_at, redirect_uri, code_used_at, refresh_rotated_at,
    refresh_expires_at, revoked_at FROM public.oauth_grants ORDER BY created_at`);
  return result.rows.map(row => ({
    id: row.id, created_at: row.created_at.toISOString(),
    client: URL.canParse(row.redirect_uri) ? new URL(row.redirect_uri).hostname : 'unknown',
    last_renewed_at: (row.refresh_rotated_at ?? row.code_used_at)?.toISOString() ?? null,
    status: row.revoked_at ? 'revoked' : !row.code_used_at ? 'never_completed'
      : row.refresh_expires_at <= now ? 'expired' : 'active',
  }));
}

// Revokes one connection by id, or all of them. The client must log in again; nothing else changes.
export async function revokeConnections(client, target, now = new Date()) {
  if (target !== 'all' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target ?? '')) {
    throw new Error('invalid_connection_id');
  }
  const result = target === 'all'
    ? await client.query('UPDATE public.oauth_grants SET revoked_at = $1 WHERE revoked_at IS NULL', [now.toISOString()])
    : await client.query('UPDATE public.oauth_grants SET revoked_at = $1 WHERE revoked_at IS NULL AND id = $2', [now.toISOString(), target]);
  return result.rowCount;
}

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
  { version: '003', file: '003_tasks_notes_summary.sql' }];
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
     completed_at, updated_at) ON public.tasks TO jarvis_runtime`,
  'GRANT SELECT, INSERT, UPDATE (idempotency_key, content, kind, status, updated_at) ON public.notes TO jarvis_runtime',
  'GRANT SELECT, INSERT, UPDATE (status, attempts, updated_at) ON public.summary_runs TO jarvis_runtime',
];
export async function grantRuntime(client) {
  for (const statement of RUNTIME_GRANTS) await client.query(statement);
}

// Logical backup (format 2): the user's data, that is projects, tasks and notes. OAuth grants and
// the summary ledger are operational state and are deliberately left out: after a restore, clients
// log in again. Every value is validated before it is written or restored.
const id = z.string().uuid();
const instant = z.iso.datetime();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();
const key = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/).nullable();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const priority = z.enum(['low', 'normal', 'high']);
const TABLES = {
  projects: z.object({ id, owner_id: id, name: z.string().min(1).max(200), description: z.string().max(2000),
    status: z.enum(['active', 'paused', 'completed', 'archived']), priority, review_at: day, snoozed_until: day,
    created_at: instant, updated_at: instant, last_activity_at: instant, idempotency_key: key, request_hash: hash }).strict(),
  tasks: z.object({ id, owner_id: id, project_id: id.nullable(), title: z.string().min(1).max(300),
    notes: z.string().max(4000), status: z.enum(['open', 'done', 'cancelled']), priority, due_date: day,
    created_at: instant, updated_at: instant, completed_at: instant.nullable(), idempotency_key: key, request_hash: hash }).strict(),
  notes: z.object({ id, owner_id: id, project_id: id.nullable(),
    kind: z.enum(['decision', 'open_question', 'fact', 'preference', 'note']), content: z.string().min(1).max(4000),
    source: z.string().max(200), status: z.enum(['active', 'inactive']),
    created_at: instant, updated_at: instant, idempotency_key: key, request_hash: hash }).strict(),
};
const payloadSchema = z.object({ format: z.literal(2), migrations: z.record(z.string(), z.string()),
  projects: z.array(TABLES.projects).max(10000), tasks: z.array(TABLES.tasks).max(50000),
  notes: z.array(TABLES.notes).max(50000) }).strict();

export async function migrationHashes() {
  const later = await laterMigrations();
  return Object.fromEntries([['001', (await migrationDefinition()).hash], ...later.map(item => [item.version, item.hash])]);
}

export function packSnapshot(payload) {
  const validated = payloadSchema.parse(payload);
  return { payload: validated, sha256: checksum(JSON.stringify(validated)) };
}
export async function validateSnapshot(snapshot) {
  const payload = payloadSchema.parse(snapshot.payload);
  if (snapshot.sha256 !== checksum(JSON.stringify(payload)) ||
      JSON.stringify(payload.migrations) !== JSON.stringify(await migrationHashes())) throw new Error('invalid_snapshot');
  return payload;
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
    const payload = { format: 2, migrations };
    for (const table of Object.keys(TABLES)) {
      payload[table] = (await client.query(`SELECT * FROM public.${table} ORDER BY id`)).rows.map(plain);
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

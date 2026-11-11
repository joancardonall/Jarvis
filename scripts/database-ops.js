import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { z } from 'zod';

const checksum = value => createHash('sha256').update(value).digest('hex');
export async function migrationDefinition() {
  const sql = await readFile(new URL('../migrations/001_projects.sql', import.meta.url), 'utf8');
  return { sql, hash: checksum(sql) };
}

export async function migrate(client) {
  const definition = await migrationDefinition();
  await client.query('BEGIN');
  try {
    const existing = await client.query("SELECT to_regclass('public.jarvis_migrations') AS ledger, to_regclass('public.projects') AS projects");
    if (existing.rows[0].ledger) {
      const record = await client.query("SELECT sha256 FROM public.jarvis_migrations WHERE version = '001'");
      if (record.rows[0]?.sha256 !== definition.hash || !existing.rows[0].projects) throw new Error('migration_mismatch');
    } else {
      if (existing.rows[0].projects) throw new Error('untracked_existing_schema');
      // The reviewed SQL includes BEGIN/COMMIT for psql. One outer transaction also records its checksum.
      await client.query(definition.sql.replace(/^BEGIN;\s*/, '').replace(/COMMIT;\s*$/, ''));
      await client.query('CREATE TABLE public.jarvis_migrations (version text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
      await client.query('INSERT INTO public.jarvis_migrations(version, sha256) VALUES ($1, $2)', ['001', definition.hash]);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

const rowSchema = z.object({
  id: z.string().uuid(), owner_id: z.string().uuid(), name: z.string().min(1).max(200),
  description: z.string().max(2000), status: z.literal('active'),
  created_at: z.iso.datetime(), updated_at: z.iso.datetime(),
  idempotency_key: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/).nullable(),
  request_hash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
const payloadSchema = z.object({ format: z.literal(1), migration_sha256: z.string(), projects: z.array(rowSchema).max(10000) }).strict();

export function packSnapshot(payload) {
  const validated = payloadSchema.parse(payload);
  return { payload: validated, sha256: checksum(JSON.stringify(validated)) };
}
export async function validateSnapshot(snapshot) {
  const payload = payloadSchema.parse(snapshot.payload);
  if (snapshot.sha256 !== checksum(JSON.stringify(payload)) ||
      payload.migration_sha256 !== (await migrationDefinition()).hash) throw new Error('invalid_snapshot');
  return payload;
}

export async function snapshotProjects(client) {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const definition = await migrationDefinition();
    const record = await client.query("SELECT sha256 FROM public.jarvis_migrations WHERE version = '001'");
    if (record.rows[0]?.sha256 !== definition.hash) throw new Error('migration_mismatch');
    const result = await client.query('SELECT * FROM public.projects ORDER BY id');
    const projects = result.rows.map(row => ({ ...row,
      created_at: row.created_at.toISOString(), updated_at: row.updated_at.toISOString() }));
    const snapshot = packSnapshot({ format: 1, migration_sha256: definition.hash, projects });
    await client.query('COMMIT');
    return snapshot;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

export async function restoreProjects(client, snapshot) {
  const payload = await validateSnapshot(snapshot);
  // Restores are never allowed over existing application or migration state.
  const tables = await client.query("SELECT 1 FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') LIMIT 1");
  if (tables.rowCount) throw new Error('restore_database_not_empty');
  await client.query('BEGIN');
  try {
    const definition = await migrationDefinition();
    await client.query(definition.sql.replace(/^BEGIN;\s*/, '').replace(/COMMIT;\s*$/, ''));
    await client.query('CREATE TABLE public.jarvis_migrations (version text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    await client.query('INSERT INTO public.jarvis_migrations(version, sha256) VALUES ($1, $2)', ['001', definition.hash]);
    for (const row of payload.projects) {
      await client.query(`INSERT INTO public.projects
        (id, owner_id, name, description, status, created_at, updated_at, idempotency_key, request_hash)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [row.id, row.owner_id, row.name, row.description,
        row.status, row.created_at, row.updated_at, row.idempotency_key, row.request_hash]);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

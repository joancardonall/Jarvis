import { readFile, mkdir } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { Client } from 'pg';
import { databaseUrl, runSafely, writePrivate } from './ops-config.js';
import { migrate, snapshotProjects, restoreProjects } from './database-ops.js';

await runSafely(async () => {
  const config = parseEnv(await readFile('.env.database', 'utf8'));
  const command = process.argv[2];
  if (!['migrate', 'backup', 'restore', 'verify'].includes(command)) throw new Error('invalid_command');
  const sourceUrl = databaseUrl(config.MIGRATION_DATABASE_URL, 'jarvis_dev');
  const runtimeUrl = databaseUrl(config.RUNTIME_DATABASE_URL, 'jarvis_dev');
  const restoreUrl = databaseUrl(config.RESTORE_DATABASE_URL, 'jarvis_restore');
  if (new Set([sourceUrl, runtimeUrl, restoreUrl].map(value => new URL(value).hostname)).size !== 1 ||
      new URL(sourceUrl).username !== 'jarvis_migrator' || new URL(runtimeUrl).username !== 'jarvis_runtime' ||
      new URL(restoreUrl).username !== 'jarvis_migrator') throw new Error('invalid_role_or_target');
  const client = new Client({ connectionString: command === 'restore' ? restoreUrl : sourceUrl,
    statement_timeout: 15000, connectionTimeoutMillis: 15000 });
  try {
    await client.connect();
    if (command === 'migrate') {
      await migrate(client);
      await client.query('GRANT SELECT, INSERT, UPDATE(idempotency_key) ON public.projects TO jarvis_runtime');
      console.log('Migration 001 and runtime table grants verified.');
    } else if (command === 'backup') {
      const snapshot = await snapshotProjects(client);
      await mkdir('backups', { recursive: true, mode: 0o700 });
      await writePrivate('backups/projects.json', JSON.stringify(snapshot));
      console.log('Logical projects snapshot saved privately; file not overwritten.');
    } else if (command === 'restore') {
      const snapshot = JSON.parse(await readFile('backups/projects.json', 'utf8'));
      await restoreProjects(client, snapshot);
      const actual = await snapshotProjects(client);
      if (actual.sha256 !== snapshot.sha256) throw new Error('restored_snapshot_mismatch');
      console.log('Restore into empty jarvis_restore verified against snapshot checksum.');
    } else {
      const runtime = new Client({ connectionString: runtimeUrl, connectionTimeoutMillis: 15000 });
      try {
        await runtime.connect();
        const privileges = (await runtime.query(`SELECT
          NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolbypassrls AS limited,
          NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE member = (SELECT oid FROM pg_roles WHERE rolname=current_user)) AS no_memberships,
          has_table_privilege(current_user, 'public.projects','SELECT') AS can_read,
          has_table_privilege(current_user, 'public.projects','INSERT') AS can_insert,
          has_column_privilege(current_user,'public.projects','idempotency_key','UPDATE') AS can_replay,
          NOT has_table_privilege(current_user,'public.projects','DELETE') AS no_delete,
          NOT has_column_privilege(current_user,'public.projects','name','UPDATE') AS no_edit,
          NOT has_schema_privilege(current_user,'public','CREATE') AS no_ddl
          FROM pg_roles WHERE rolname=current_user`)).rows[0];
        if (!privileges || !Object.values(privileges).every(Boolean)) throw new Error('privileges_too_broad');
        await runtime.query('SELECT id FROM public.projects LIMIT 1');
        console.log('Runtime connection and minimum permissions verified.');
      } finally { await runtime.end(); }
    }
  } finally { await client.end(); }
});

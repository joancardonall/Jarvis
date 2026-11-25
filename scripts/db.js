import { readFile, mkdir, readdir } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { Client } from 'pg';
import { databaseUrl, runSafely, writePrivate } from './ops-config.js';
import { migrate, grantRuntime, snapshotData, restoreData } from './database-ops.js';

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
      await grantRuntime(client);
      console.log('Migrations 001-003 and runtime table grants verified.');
    } else if (command === 'backup') {
      const snapshot = await snapshotData(client);
      await mkdir('backups', { recursive: true, mode: 0o700 });
      // A new dated file each time: earlier backups are never overwritten.
      const file = `backups/jarvis-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      await writePrivate(file, JSON.stringify(snapshot));
      console.log(`Logical snapshot of projects, tasks and notes saved privately to ${file}.`);
    } else if (command === 'restore') {
      // Restores the most recent backup file (names sort by date).
      const latest = (await readdir('backups')).filter(name => /^jarvis-[0-9TZ-]+\.json$/.test(name)).sort().at(-1);
      if (!latest) throw new Error('no_backup_found');
      const snapshot = JSON.parse(await readFile(`backups/${latest}`, 'utf8'));
      await restoreData(client, snapshot);
      const actual = await snapshotData(client);
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
          has_column_privilege(current_user,'public.projects','status','UPDATE') AS can_edit_project,
          NOT has_column_privilege(current_user,'public.projects','owner_id','UPDATE') AS project_owner_fixed,
          has_table_privilege(current_user,'public.tasks','SELECT, INSERT') AS can_use_tasks,
          has_column_privilege(current_user,'public.tasks','status','UPDATE') AS can_edit_task,
          NOT has_column_privilege(current_user,'public.tasks','owner_id','UPDATE') AS task_owner_fixed,
          has_table_privilege(current_user,'public.notes','SELECT, INSERT') AS can_use_notes,
          NOT has_column_privilege(current_user,'public.notes','owner_id','UPDATE') AS note_owner_fixed,
          has_table_privilege(current_user,'public.summary_runs','SELECT, INSERT') AS can_use_ledger,
          NOT has_table_privilege(current_user,'public.tasks','DELETE') AS no_task_delete,
          NOT has_table_privilege(current_user,'public.notes','DELETE') AS no_note_delete,
          has_table_privilege(current_user, 'public.oauth_grants','SELECT, INSERT, UPDATE') AS can_use_grants,
          NOT has_table_privilege(current_user,'public.oauth_grants','DELETE') AS no_grant_delete,
          NOT has_schema_privilege(current_user,'public','CREATE') AS no_ddl
          FROM pg_roles WHERE rolname=current_user`)).rows[0];
        if (!privileges || !Object.values(privileges).every(Boolean)) throw new Error('privileges_too_broad');
        await runtime.query('SELECT id FROM public.projects LIMIT 1');
        await runtime.query('SELECT id FROM public.oauth_grants LIMIT 1');
        console.log('Runtime connection and minimum permissions verified.');
      } finally { await runtime.end(); }
    }
  } finally { await client.end(); }
});

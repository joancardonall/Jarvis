import { readFile, mkdir, readdir } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { Client } from 'pg';
import { databaseUrl, runSafely, writePrivate } from './ops-config.js';
import { migrate, grantRuntime, snapshotData, restoreData, snapshotRows, purgeDiscarded, listConnections,
  revokeConnections } from './database-ops.js';

await runSafely(async () => {
  const config = parseEnv(await readFile('.env.database', 'utf8'));
  const command = process.argv[2];
  if (!['migrate', 'backup', 'restore', 'verify', 'purge', 'connections', 'revoke'].includes(command)) throw new Error('invalid_command');
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
      console.log('Migrations 001-004 and runtime table grants verified.');
    } else if (command === 'backup') {
      const snapshot = await snapshotData(client);
      await mkdir('backups', { recursive: true, mode: 0o700 });
      // A new dated file each time: earlier backups are never overwritten.
      const file = `backups/jarvis-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      await writePrivate(file, JSON.stringify(snapshot));
      console.log(`Logical snapshot of projects, courses, tasks and notes saved privately to ${file}.`);
    } else if (command === 'restore') {
      // Restores the most recent backup file (names sort by date).
      const latest = (await readdir('backups')).filter(name => /^jarvis-[0-9TZ-]+\.json$/.test(name)).sort().at(-1);
      if (!latest) throw new Error('no_backup_found');
      const snapshot = JSON.parse(await readFile(`backups/${latest}`, 'utf8'));
      await restoreData(client, snapshot);
      // Compared row by row, so a backup taken in an earlier format still verifies.
      const actual = await snapshotData(client);
      if (JSON.stringify(snapshotRows(actual.payload)) !== JSON.stringify(snapshotRows(snapshot.payload))) {
        throw new Error('restored_snapshot_mismatch');
      }
      console.log('Restore into empty jarvis_restore verified against snapshot checksum.');
    } else if (command === 'purge') {
      // npm run data:purge -- --days 30 [--confirm]. Without --confirm nothing is erased.
      const flag = process.argv.indexOf('--days');
      const days = flag === -1 ? 30 : Number(process.argv[flag + 1]);
      const outcome = await purgeDiscarded(client, { days, confirm: process.argv.includes('--confirm') });
      console.log(outcome.confirmed ? `Permanently erased (discarded more than ${days} days ago):`
        : `PREVIEW, nothing erased. Would erase (discarded more than ${days} days ago):`);
      for (const [table, rows] of Object.entries(outcome.erased)) console.log(`  ${table}: ${rows}`);
      if (!outcome.confirmed) console.log('Repeat with --confirm to erase. Backup files are not touched.');
    } else if (command === 'connections') {
      const connections = await listConnections(client);
      if (!connections.length) console.log('No client connections.');
      for (const item of connections) {
        console.log(`${item.id}  ${item.status.padEnd(15)}  ${item.client}  created ${item.created_at.slice(0, 16)}  renewed ${item.last_renewed_at?.slice(0, 16) ?? '-'}`);
      }
    } else if (command === 'revoke') {
      // npm run oauth:revoke -- <connection id> | --all
      const target = process.argv.includes('--all') ? 'all' : process.argv[3];
      console.log(`Connections revoked: ${await revokeConnections(client, target)}. Those clients must log in again.`);
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
          has_table_privilege(current_user,'public.courses','SELECT, INSERT') AS can_use_courses,
          has_table_privilege(current_user,'public.course_groups','SELECT, INSERT') AS can_use_groups,
          has_column_privilege(current_user,'public.tasks','course_id','UPDATE') AS can_link_course,
          NOT has_column_privilege(current_user,'public.courses','owner_id','UPDATE') AS course_owner_fixed,
          NOT has_table_privilege(current_user,'public.courses','DELETE') AS no_course_delete,
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

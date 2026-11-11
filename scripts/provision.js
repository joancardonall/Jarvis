import { Client } from 'pg';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { loadOps, databaseUrl, mustNotExist, writePrivate, runSafely } from './ops-config.js';

// Role names are fixed constants, never request data.
export async function provision(adminUrl, { local = false } = {}) {
  const source = databaseUrl(adminUrl, 'jarvis_dev', { local });
  const restoreUrl = new URL(source);
  restoreUrl.pathname = '/jarvis_restore';
  const clients = [new Client({ connectionString: source }), new Client({ connectionString: restoreUrl.toString() })];
  const passwords = { jarvis_migrator: randomBytes(32).toString('base64url'), jarvis_runtime: randomBytes(32).toString('base64url') };
  try {
    for (const client of clients) {
      await client.connect();
      const tables = await client.query("SELECT 1 FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') LIMIT 1");
      if (tables.rowCount) throw new Error('database_not_empty');
    }
    if ((await clients[0].query("SELECT 1 FROM pg_roles WHERE rolname IN ('jarvis_migrator','jarvis_runtime')")).rowCount) {
      throw new Error('roles_already_exist');
    }
    // Persist generated credentials privately before remote changes: failures remain recoverable.
    const credentials = {};
    for (const role of Object.keys(passwords)) {
      const url = new URL(source);
      url.username = role;
      url.password = passwords[role];
      credentials[role] = url.toString();
    }
    return { clients, credentials, passwords, restoreUrl: restoreUrl.toString() };
  } catch (error) {
    await Promise.allSettled(clients.map(client => client.end()));
    throw error;
  }
}

export async function applyRoles(clients, passwords) {
  const [dev, restore] = clients;
  await dev.query('BEGIN');
  try {
    for (const role of Object.keys(passwords)) {
      // Password generated as base64url only. No shell interpolation or secret logging.
      if (!/^[A-Za-z0-9_-]{43}$/.test(passwords[role])) throw new Error('invalid_generated_password');
      await dev.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD '${passwords[role]}'`);
    }
    await dev.query('REVOKE ALL ON DATABASE jarvis_dev FROM PUBLIC');
    await dev.query('GRANT CONNECT ON DATABASE jarvis_dev TO jarvis_migrator, jarvis_runtime');
    await dev.query('REVOKE ALL ON SCHEMA public FROM PUBLIC');
    await dev.query('GRANT USAGE, CREATE ON SCHEMA public TO jarvis_migrator');
    await dev.query('GRANT USAGE ON SCHEMA public TO jarvis_runtime');
    await dev.query('COMMIT');
  } catch (error) { await dev.query('ROLLBACK'); throw error; }
  // Cross-database changes cannot be atomic; credentials are retained for diagnosis/recovery.
  await restore.query('BEGIN');
  try {
    await restore.query('REVOKE ALL ON DATABASE jarvis_restore FROM PUBLIC');
    await restore.query('GRANT CONNECT ON DATABASE jarvis_restore TO jarvis_migrator');
    await restore.query('REVOKE ALL ON SCHEMA public FROM PUBLIC');
    await restore.query('GRANT USAGE, CREATE ON SCHEMA public TO jarvis_migrator');
    await restore.query('COMMIT');
  } catch (error) { await restore.query('ROLLBACK'); throw error; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runSafely(async () => {
    const config = await loadOps();
    if (config.JARVIS_FREE_PLAN_CONFIRMED !== 'true') throw new Error('free_plan_not_confirmed');
    await mustNotExist('.env.database');
    const plan = await provision(config.NEON_ADMIN_DATABASE_URL);
    try {
      const restore = new URL(plan.credentials.jarvis_migrator);
      restore.pathname = '/jarvis_restore';
      await writePrivate('.env.database', [
        `MIGRATION_DATABASE_URL=${JSON.stringify(plan.credentials.jarvis_migrator)}`,
        `RUNTIME_DATABASE_URL=${JSON.stringify(plan.credentials.jarvis_runtime)}`,
        `RESTORE_DATABASE_URL=${JSON.stringify(restore.toString())}`,
      ].join('\n') + '\n');
      await applyRoles(plan.clients, plan.passwords);
      console.log('Development roles configured. Credentials saved privately to .env.database; no Worker published.');
    } finally { await Promise.allSettled(plan.clients.map(client => client.end())); }
  });
}

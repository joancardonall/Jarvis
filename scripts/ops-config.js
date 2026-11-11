import { readFile, writeFile, access } from 'node:fs/promises';
import { parseEnv } from 'node:util';

export async function loadOps() {
  return parseEnv(await readFile('.env.ops', 'utf8'));
}

export function databaseUrl(value, database, { local = false } = {}) {
  const url = new URL(value);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.username ||
      url.pathname !== `/${database}` ||
      (local ? !loopback : (!url.hostname.endsWith('.eu-central-1.aws.neon.tech') ||
        url.hostname.includes('-pooler.') || !['require', 'verify-full'].includes(url.searchParams.get('sslmode'))))) {
    throw new Error('unsafe_database_target');
  }
  // Node pg verifies server certificates when using verify-full. Never disable verification.
  if (!local) url.searchParams.set('sslmode', 'verify-full');
  return url.toString();
}

export async function mustNotExist(path) {
  try { await access(path); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  throw new Error('output_already_exists');
}

export async function writePrivate(path, content) {
  await writeFile(path, content, { mode: 0o600, flag: 'wx' });
}

export async function runSafely(task) {
  try { await task(); }
  catch {
    // Never print pg errors: they may include DSNs, parameters or credentials.
    console.error('Operation failed. No credentials were printed. Check the documented prerequisites locally.');
    process.exitCode = 1;
  }
}

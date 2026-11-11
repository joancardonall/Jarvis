import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { pathToFileURL } from 'node:url';
import { databaseUrl, mustNotExist, writePrivate, runSafely } from './ops-config.js';

export async function writeDevelopmentCredentials(runtimeUrl, directory = '.') {
  await mustNotExist(`${directory}/.dev.vars`);
  await mustNotExist(`${directory}/.env.client`);
  const token = randomBytes(32).toString('base64url');
  const hash = createHash('sha256').update(token).digest('hex');
  const settings = {
    DATABASE_URL: runtimeUrl, DEV_TOKEN_SHA256: hash, DEV_OWNER_ID: randomUUID(),
    DEV_TOKEN_EXPIRES_AT: new Date(Date.now() + 7 * 86400000).toISOString(), ALLOWED_ORIGIN: '',
  };
  await writePrivate(`${directory}/.dev.vars`, Object.entries(settings).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n');
  await writePrivate(`${directory}/.env.client`, `JARVIS_BEARER_TOKEN=${JSON.stringify(token)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runSafely(async () => {
    const config = parseEnv(await readFile('.env.database', 'utf8'));
    const url = databaseUrl(config.RUNTIME_DATABASE_URL, 'jarvis_dev');
    if (new URL(url).username !== 'jarvis_runtime') throw new Error('invalid_role');
    await writeDevelopmentCredentials(url);
    console.log('Development credentials saved privately to .dev.vars and .env.client. No token printed.');
  });
}

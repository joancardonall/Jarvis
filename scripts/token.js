import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFile, rename, rm } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { pathToFileURL } from 'node:url';
import { databaseUrl, mustNotExist, writePrivate, runSafely } from './ops-config.js';

const TOKEN_LIFETIME_MS = 7 * 86400000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function newToken(now) {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    hash: createHash('sha256').update(token).digest('hex'),
    expiresAt: new Date(now + TOKEN_LIFETIME_MS).toISOString(),
  };
}

function toEnvFile(settings) {
  return Object.entries(settings).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n';
}

export async function writeDevelopmentCredentials(runtimeUrl, directory = '.') {
  await mustNotExist(`${directory}/.dev.vars`);
  await mustNotExist(`${directory}/.env.client`);
  const { token, hash, expiresAt } = newToken(Date.now());
  const settings = {
    DATABASE_URL: runtimeUrl, DEV_TOKEN_SHA256: hash, DEV_OWNER_ID: randomUUID(),
    DEV_TOKEN_EXPIRES_AT: expiresAt, ALLOWED_ORIGIN: '',
  };
  await writePrivate(`${directory}/.dev.vars`, toEnvFile(settings));
  await writePrivate(`${directory}/.env.client`, toEnvFile({ JARVIS_BEARER_TOKEN: token }));
}

// Replaces only the token hash and expiry. The owner and every other setting are kept,
// so existing projects stay visible with the new token. The old token stops working.
export async function rotateDevelopmentToken(directory = '.', now = Date.now()) {
  const serverPath = `${directory}/.dev.vars`;
  const clientPath = `${directory}/.env.client`;
  const server = parseEnv(await readFile(serverPath, 'utf8'));
  const client = parseEnv(await readFile(clientPath, 'utf8'));
  if (!UUID_PATTERN.test(server.DEV_OWNER_ID ?? '') || !server.DEV_TOKEN_SHA256) {
    throw new Error('invalid_existing_credentials');
  }

  const { token, hash, expiresAt } = newToken(now);
  const serverTemp = `${serverPath}.rotate`;
  const clientTemp = `${clientPath}.rotate`;
  try {
    // Write both files completely before replacing anything, so a failure leaves the old pair intact.
    await writePrivate(serverTemp, toEnvFile({ ...server, DEV_TOKEN_SHA256: hash, DEV_TOKEN_EXPIRES_AT: expiresAt }));
    await writePrivate(clientTemp, toEnvFile({ ...client, JARVIS_BEARER_TOKEN: token }));
    await rename(serverTemp, serverPath);
    await rename(clientTemp, clientPath);
  } finally {
    await rm(serverTemp, { force: true });
    await rm(clientTemp, { force: true });
  }
  return { expiresAt };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runSafely(async () => {
    if (process.argv.includes('--rotate')) {
      const { expiresAt } = await rotateDevelopmentToken();
      console.log(`Token rotated privately in .dev.vars and .env.client. Same owner. Expires ${expiresAt}. No token printed.`);
      console.log('Remote Worker still accepts only the old token until its secrets are updated (see docs/DEVELOPMENT.md).');
      return;
    }
    const config = parseEnv(await readFile('.env.database', 'utf8'));
    const url = databaseUrl(config.RUNTIME_DATABASE_URL, 'jarvis_dev');
    if (new URL(url).username !== 'jarvis_runtime') throw new Error('invalid_role');
    await writeDevelopmentCredentials(url);
    console.log('Development credentials saved privately to .dev.vars and .env.client. No token printed.');
  });
}

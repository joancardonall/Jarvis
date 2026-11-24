import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { mustNotExist, writePrivate, runSafely } from './ops-config.js';

// Creates the private file later uploaded with `wrangler secret bulk`. The signing key is
// generated here; the two GitHub values are filled in locally by the developer, never in chat.
// JSON (not dotenv) avoids Wrangler's variable expansion, as decided in D021.
export async function writeOAuthSecretsTemplate(path = '.env.oauth.json') {
  await mustNotExist(path);
  await writePrivate(path, JSON.stringify({
    OAUTH_SIGNING_KEY: randomBytes(32).toString('base64url'),
    GITHUB_CLIENT_ID: '',
    GITHUB_CLIENT_SECRET: '',
  }, null, 2) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runSafely(async () => {
    await writeOAuthSecretsTemplate();
    console.log('Created private .env.oauth.json with a new signing key. No secret printed.');
    console.log('Fill in GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET locally (see docs/DEVELOPMENT.md).');
  });
}

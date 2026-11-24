import { AppError } from './errors.js';
import { ACCESS_PREFIX, isAccessToken } from './oauth.js';
import { safeEqual, sha256Hex } from './tokens.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Optional fixed development token (scripts and local checks). Disabled unless fully configured.
async function matchesDevelopmentToken(token, env, now) {
  const expires = Date.parse(env.DEV_TOKEN_EXPIRES_AT);
  if (!/^[a-f0-9]{64}$/.test(env.DEV_TOKEN_SHA256 ?? '') || !Number.isFinite(expires) || expires <= now) return false;
  return /^[A-Za-z0-9_-]{43,128}$/.test(token) && safeEqual(await sha256Hex(token), env.DEV_TOKEN_SHA256);
}

// Returns the owner id for a valid credential and throws 401 otherwise. The owner always comes
// from server-side state (configuration or the stored grant), never from the client.
export async function authenticate(request, env, { repository, now = Date.now() } = {}) {
  if (!UUID.test(env.DEV_OWNER_ID ?? '')) throw new AppError(503, 'auth_not_configured');
  const header = request.headers.get('Authorization') ?? '';
  const token = /^Bearer ([A-Za-z0-9._-]{43,200})$/.exec(header)?.[1];
  if (!token) throw new AppError(401, 'unauthorized');
  if (token.startsWith(ACCESS_PREFIX)) {
    // The signature check rejects forged tokens before the database is queried.
    if (!repository || !await isAccessToken(env, token)) throw new AppError(401, 'unauthorized');
    const grant = await repository().findGrantByAccess(await sha256Hex(token), new Date(now));
    if (!grant || !safeEqual(String(grant.owner_id).toLowerCase(), env.DEV_OWNER_ID.toLowerCase())) throw new AppError(401, 'unauthorized');
    return grant.owner_id;
  }
  if (!await matchesDevelopmentToken(token, env, now)) throw new AppError(401, 'unauthorized');
  return env.DEV_OWNER_ID;
}

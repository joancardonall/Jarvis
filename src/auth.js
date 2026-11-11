import { AppError } from './errors.js';
import { digest } from './projects.js';

export async function authenticate(request, env) {
  const expires = Date.parse(env.DEV_TOKEN_EXPIRES_AT);
  if (!/^[a-f0-9]{64}$/.test(env.DEV_TOKEN_SHA256 ?? '') ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(env.DEV_OWNER_ID ?? '') ||
      !Number.isFinite(expires)) throw new AppError(503, 'auth_not_configured');
  const header = request.headers.get('Authorization') ?? '';
  const token = /^Bearer ([A-Za-z0-9_-]{43,128})$/.exec(header)?.[1];
  if (!token || expires <= Date.now()) throw new AppError(401, 'unauthorized');
  const actual = await digest(token);
  let difference = 0;
  for (let index = 0; index < 64; index++) {
    difference |= actual.charCodeAt(index) ^ env.DEV_TOKEN_SHA256.charCodeAt(index);
  }
  if (difference !== 0) throw new AppError(401, 'unauthorized');
  return env.DEV_OWNER_ID;
}

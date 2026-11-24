// OAuth 2.1 authorization server for Jarvis. Identity is delegated to GitHub and a single
// GitHub account (numeric id) is accepted. See docs/SECURITY_PRIVACY.md for the threat model.
import { AppError } from './errors.js';
import { isMintedToken, isSigningSecret, mintToken, openJson, randomId, safeEqual, sealJson, sha256Hex,
  base64url } from './tokens.js';

export const ACCESS_PREFIX = 'jvs_at_';
const REFRESH_PREFIX = 'jvs_rt_';
const CODE_PREFIX = 'jvs_ac_';

export const ACCESS_TTL_MS = 3600_000;           // 1 hour
export const REFRESH_TTL_MS = 30 * 86400_000;    // 30 days, renewed on every use
export const REFRESH_GRACE_MS = 60_000;          // retry window for a lost refresh response
const CODE_TTL_MS = 60_000;
const LOGIN_TTL_MS = 600_000;                    // time allowed to finish consent + GitHub login

const CSRF_COOKIE = '__Host-jarvis_csrf';
const LOGIN_COOKIE = '__Host-jarvis_login';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
const VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;

// Authorization codes are only ever delivered to these addresses. A client that registers
// any other redirect is rejected, so a stranger cannot receive a code for this server.
const CLAUDE_CALLBACKS = ['https://claude.ai/api/mcp/auth_callback', 'https://claude.com/api/mcp/auth_callback'];

export function isAllowedRedirect(value) {
  if (typeof value !== 'string' || value.length > 300) return false;
  if (CLAUDE_CALLBACKS.includes(value)) return true;
  let url;
  try { url = new URL(value); } catch { return false; }
  // Loopback redirect for native clients on the user's own machine (RFC 8252), e.g. Claude Code.
  return url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname) &&
    !url.username && !url.password && !url.hash && url.href === value;
}

const withoutPort = value => { const url = new URL(value); url.port = ''; return url.href; };

// Exact match with a registered redirect. For loopback addresses the port is ignored, because
// native clients listen on a different free port each time (RFC 8252 section 7.3).
function isRegisteredRedirect(registered, redirect) {
  if (!isAllowedRedirect(redirect)) return false;
  if (registered.includes(redirect)) return true;
  return redirect.startsWith('http://') && registered.some(candidate =>
    isAllowedRedirect(candidate) && candidate.startsWith('http://') && withoutPort(candidate) === withoutPort(redirect));
}

export function oauthSettings(env) {
  if (!isSigningSecret(env.OAUTH_SIGNING_KEY) || !/^[A-Za-z0-9._-]{10,100}$/.test(env.GITHUB_CLIENT_ID ?? '') ||
      !/^[A-Za-z0-9_-]{20,200}$/.test(env.GITHUB_CLIENT_SECRET ?? '') ||
      !/^[1-9][0-9]{0,18}$/.test(env.GITHUB_ALLOWED_USER_ID ?? '') || !UUID.test(env.DEV_OWNER_ID ?? '')) {
    throw new AppError(503, 'oauth_not_configured');
  }
  return { secret: env.OAUTH_SIGNING_KEY, githubId: env.GITHUB_CLIENT_ID, githubSecret: env.GITHUB_CLIENT_SECRET,
    allowedUser: env.GITHUB_ALLOWED_USER_ID, owner: env.DEV_OWNER_ID };
}

// Used by the authentication check: is this a well-formed access token issued by this server?
export async function isAccessToken(env, token) {
  return isSigningSecret(env.OAUTH_SIGNING_KEY) && isMintedToken(env.OAUTH_SIGNING_KEY, ACCESS_PREFIX, token);
}

export const resourceMetadataUrl = origin => `${origin}/.well-known/oauth-protected-resource`;

const SECURITY_HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
const json = (body, status = 200) => Response.json(body, { status, headers: SECURITY_HEADERS });
// OAuth error format (RFC 6749 §5.2): machine-readable code, never internal details.
const oauthError = (error, status = 400) => json({ error }, status);

const escapeHtml = text => String(text).replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function page(title, body, status = 200, cookies = []) {
  // Referrer-Policy must not be `no-referrer` here: browsers would then send `Origin: null` with
  // the consent form and the same-origin check in approve() could never pass.
  const headers = new Headers({ ...SECURITY_HEADERS, 'Referrer-Policy': 'same-origin', 'Content-Type': 'text/html; charset=utf-8',
    // No scripts, no external resources, never inside a frame (prevents clickjacking of the approve button).
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
    'X-Frame-Options': 'DENY' });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(`<!doctype html><html lang="ca"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:34rem;margin:3rem auto;padding:0 1rem;color:#1a1a1a;background:#fafafa}
dl{background:#fff;border:1px solid #ddd;border-radius:8px;padding:1rem}dt{font-weight:600}dd{margin:0 0 .75rem;word-break:break-all}
button{font:inherit;padding:.6rem 1.2rem;border-radius:8px;border:0;background:#1a1a1a;color:#fff;cursor:pointer}
.warn{border-left:4px solid #c77700;padding-left:.75rem}</style></head>
<body><h1>${escapeHtml(title)}</h1>${body}</body></html>`, { status, headers });
}

const failurePage = (message, status = 400, cookies = []) => page('No s’ha pogut autoritzar',
  `<p>${escapeHtml(message)}</p><p>Pots tancar aquesta pestanya i tornar-ho a provar des de Claude.</p>`, status, cookies);

const setCookie = (name, value, maxAgeSeconds, sameSite) =>
  `${name}=${value}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=${sameSite}`;

function readCookie(request, name) {
  for (const part of (request.headers.get('Cookie') ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=');
  }
  return null;
}

async function openClient(secret, clientId) {
  const client = await openJson(secret, 'client', clientId, 0);
  return client && Array.isArray(client.r) ? client : null;
}

// Tokens are valid for this server only. Clients name it with the `resource` parameter (RFC 8707).
const isOwnResource = (origin, resource) => [origin, `${origin}/`, `${origin}/mcp`].includes(resource);

function metadata(origin, path) {
  if (path.startsWith('/.well-known/oauth-protected-resource')) {
    return json({ resource: `${origin}/mcp`, authorization_servers: [origin], bearer_methods_supported: ['header'] });
  }
  return json({
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['offline_access'],
    authorization_response_iss_parameter_supported: true,
  });
}

// Dynamic Client Registration (RFC 7591) without storage: the client_id is the signed
// registration itself, so anonymous callers can never fill the database.
async function register(request, settings, readJson) {
  const body = await readJson(request);
  const uris = body?.redirect_uris;
  if (!Array.isArray(uris) || uris.length < 1 || uris.length > 5 || !uris.every(isAllowedRedirect)) {
    return oauthError('invalid_redirect_uri');
  }
  const name = typeof body.client_name === 'string' ? body.client_name.slice(0, 80) : 'Client sense nom';
  const clientId = await sealJson(settings.secret, 'client', { r: uris, n: name });
  return json({
    client_id: clientId, client_name: name, redirect_uris: uris, token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
  }, 201);
}

// Checks the parameters of an authorization request. Problems are shown to the user and never
// redirected, so this endpoint cannot be abused to bounce browsers to arbitrary sites.
async function validAuthorization(settings, origin, params) {
  const client = await openClient(settings.secret, params.get('client_id'));
  if (!client) return { failure: 'Client desconegut. Torna a afegir el connector a Claude.' };
  const redirect = params.get('redirect_uri');
  if (!isRegisteredRedirect(client.r, redirect)) return { failure: 'Adreça de retorn no permesa.' };
  const state = params.get('state') ?? '';
  const resource = params.get('resource');
  if (params.get('response_type') !== 'code' || params.get('code_challenge_method') !== 'S256' ||
      !CHALLENGE.test(params.get('code_challenge') ?? '') || state.length > 512 ||
      (resource !== null && !isOwnResource(origin, resource))) {
    return { failure: 'Petició d’autorització no vàlida.' };
  }
  return { client, redirect, state, challenge: params.get('code_challenge'), clientId: params.get('client_id') };
}

// Step 1: show who is asking for access. Nothing is granted until the user presses the button.
async function consent(url, settings, now) {
  const request = await validAuthorization(settings, url.origin, url.searchParams);
  if (request.failure) return failurePage(request.failure);
  const csrf = randomId();
  const sealed = await sealJson(settings.secret, 'consent', {
    c: request.clientId, r: request.redirect, s: request.state, k: request.challenge,
    x: await sha256Hex(csrf), exp: now + LOGIN_TTL_MS,
  });
  return page('Autoritzar accés a Jarvis', `
<p>Una aplicació demana permís per llegir i crear dades al teu Jarvis.</p>
<dl><dt>Nom declarat per l’aplicació (no verificat)</dt><dd>${escapeHtml(request.client.n)}</dd>
<dt>L’accés s’entregarà a</dt><dd>${escapeHtml(new URL(request.redirect).host)}</dd></dl>
<p class="warn"><strong>Continua només si acabes d’iniciar tu aquesta connexió</strong> des de Claude.
Si has arribat aquí per un enllaç que t’han enviat, tanca la pestanya.</p>
<form method="post" action="/oauth/authorize"><input type="hidden" name="request" value="${escapeHtml(sealed)}">
<p><label><input type="checkbox" name="confirmed" value="yes" required>
He iniciat jo aquesta connexió ara mateix i vull donar-hi accés.</label></p>
<button type="submit">Continuar amb GitHub</button></form>`, 200,
  [setCookie(CSRF_COOKIE, csrf, LOGIN_TTL_MS / 1000, 'Strict')]);
}

// Step 2: the user approved. Only a form submitted from our own page, by the same browser that
// received the consent page, is accepted (protection against cross-site request forgery).
async function approve(request, url, settings, now, readForm) {
  if (request.headers.get('Origin') !== url.origin) return failurePage('Origen de la petició no vàlid.', 403);
  const form = await readForm(request);
  const consented = await openJson(settings.secret, 'consent', form.get('request'), now);
  const csrf = readCookie(request, CSRF_COOKIE);
  if (!consented || !csrf || !safeEqual(await sha256Hex(csrf), consented.x)) {
    return failurePage('La sol·licitud ha caducat o no és vàlida.', 403);
  }
  // Two deliberate actions (tick + button) so a single tricked click cannot approve access.
  if (form.get('confirmed') !== 'yes') return failurePage('Cal marcar la casella de confirmació.', 400);
  const nonce = randomId();
  const login = await sealJson(settings.secret, 'login', {
    c: await sha256Hex(consented.c), r: consented.r, s: consented.s, k: consented.k, n: nonce, exp: now + LOGIN_TTL_MS,
  });
  const github = new URL('https://github.com/login/oauth/authorize');
  github.searchParams.set('client_id', settings.githubId);
  github.searchParams.set('redirect_uri', `${url.origin}/oauth/callback`);
  github.searchParams.set('state', nonce);
  github.searchParams.set('allow_signup', 'false');
  // No scope requested: GitHub only confirms who the user is. Jarvis never reads repositories.
  const headers = new Headers({ ...SECURITY_HEADERS, Location: github.href });
  headers.append('Set-Cookie', setCookie(LOGIN_COOKIE, login, LOGIN_TTL_MS / 1000, 'Lax'));
  headers.append('Set-Cookie', setCookie(CSRF_COOKIE, '', 0, 'Strict'));
  return new Response(null, { status: 303, headers });
}

// Asks GitHub who just logged in. The GitHub token is used once and never stored.
async function githubUserId(settings, origin, code, fetchUpstream) {
  const exchange = await fetchUpstream('https://github.com/login/oauth/access_token', {
    method: 'POST', signal: AbortSignal.timeout(10000),
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'jarvis-oauth' },
    body: JSON.stringify({ client_id: settings.githubId, client_secret: settings.githubSecret, code,
      redirect_uri: `${origin}/oauth/callback` }),
  });
  const token = exchange.ok ? (await exchange.json())?.access_token : null;
  if (typeof token !== 'string' || !token) return null;
  const profile = await fetchUpstream('https://api.github.com/user', {
    signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'jarvis-oauth' },
  });
  const id = profile.ok ? (await profile.json())?.id : null;
  return Number.isSafeInteger(id) && id > 0 ? String(id) : null;
}

// Step 3: GitHub sends the browser back. Verify it is the same browser that approved, that the
// GitHub account is the allowed one, and only then hand a one-time code to the client.
async function callback(request, url, settings, repository, fetchUpstream, now) {
  const clear = [setCookie(LOGIN_COOKIE, '', 0, 'Lax')];
  const login = await openJson(settings.secret, 'login', readCookie(request, LOGIN_COOKIE), now);
  const state = url.searchParams.get('state');
  const githubCode = url.searchParams.get('code');
  if (!login || !state || !safeEqual(state, login.n)) return failurePage('La sessió d’inici ha caducat o no coincideix.', 403, clear);
  // Shape check first, so junk never causes a request carrying the client secret to GitHub.
  if (!githubCode || !/^[A-Za-z0-9_-]{8,128}$/.test(githubCode)) return failurePage('GitHub no ha completat l’inici de sessió.', 403, clear);
  let user = null;
  try { user = await githubUserId(settings, url.origin, githubCode, fetchUpstream); }
  catch { return failurePage('No s’ha pogut contactar amb GitHub.', 502, clear); }
  if (user === null) return failurePage('GitHub no ha confirmat la identitat.', 403, clear);
  // The numeric id never changes, unlike the username, which can be renamed and reused.
  if (!safeEqual(user, settings.allowedUser)) return failurePage('Aquest compte de GitHub no té accés a Jarvis.', 403, clear);
  const code = await mintToken(settings.secret, CODE_PREFIX);
  await repository().createGrant({
    id: crypto.randomUUID(), owner_id: settings.owner, client_hash: login.c, redirect_uri: login.r,
    code_hash: await sha256Hex(code), code_challenge: login.k, code_expires_at: new Date(now + CODE_TTL_MS),
  });
  const target = new URL(login.r);
  target.searchParams.set('code', code);
  if (login.s) target.searchParams.set('state', login.s);
  target.searchParams.set('iss', url.origin);
  const headers = new Headers({ ...SECURITY_HEADERS, Location: target.href });
  headers.append('Set-Cookie', clear[0]);
  return new Response(null, { status: 302, headers });
}

async function newTokens(settings, now) {
  const access = await mintToken(settings.secret, ACCESS_PREFIX);
  const refresh = await mintToken(settings.secret, REFRESH_PREFIX);
  return {
    response: { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL_MS / 1000,
      refresh_token: refresh, scope: 'offline_access' },
    stored: { access_hash: await sha256Hex(access), refresh_hash: await sha256Hex(refresh),
      access_expires_at: new Date(now + ACCESS_TTL_MS), refresh_expires_at: new Date(now + REFRESH_TTL_MS) },
  };
}

async function token(request, url, settings, repository, now, readForm) {
  const form = await readForm(request);
  const clientId = form.get('client_id');
  if (!await openClient(settings.secret, clientId)) return oauthError('invalid_client', 401);
  const clientHash = await sha256Hex(clientId);
  const resource = form.get('resource');
  if (resource !== null && !isOwnResource(url.origin, resource)) return oauthError('invalid_target');
  const grantType = form.get('grant_type');

  if (grantType === 'authorization_code') {
    const code = form.get('code');
    const verifier = form.get('code_verifier') ?? '';
    // Forged or malformed codes are rejected here, before any database access.
    if (!await isMintedToken(settings.secret, CODE_PREFIX, code) || !VERIFIER.test(verifier)) return oauthError('invalid_grant');
    const codeHash = await sha256Hex(code);
    const grant = await repository().findGrantByCode(codeHash);
    if (!grant || grant.revoked_at) return oauthError('invalid_grant');
    if (grant.code_used_at) {
      // A code presented twice means it leaked: cancel everything issued from it.
      await repository().revokeGrant(grant.id, new Date(now));
      return oauthError('invalid_grant');
    }
    // PKCE: only the client that started the flow knows the verifier behind the stored challenge.
    const challenge = base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    if (new Date(grant.code_expires_at).getTime() <= now || !safeEqual(grant.client_hash, clientHash) ||
        grant.redirect_uri !== form.get('redirect_uri') || !safeEqual(challenge, grant.code_challenge)) {
      return oauthError('invalid_grant');
    }
    const tokens = await newTokens(settings, now);
    // Atomic single use: of two simultaneous exchanges, only one can win.
    if (await repository().redeemCode(codeHash, tokens.stored, new Date(now))) return json(tokens.response);
    // Lost the race against another exchange of the same code: that is a replay too.
    await repository().revokeGrant(grant.id, new Date(now));
    return oauthError('invalid_grant');
  }

  if (grantType === 'refresh_token') {
    const refresh = form.get('refresh_token');
    if (!await isMintedToken(settings.secret, REFRESH_PREFIX, refresh)) return oauthError('invalid_grant');
    const tokens = await newTokens(settings, now);
    const rotated = await repository().rotateRefresh(await sha256Hex(refresh), clientHash, tokens.stored,
      new Date(now), new Date(now - REFRESH_GRACE_MS));
    return rotated ? json(tokens.response) : oauthError('invalid_grant');
  }
  return oauthError('unsupported_grant_type');
}

export const isConsentSubmission = (request, url) => request.method === 'POST' && url.pathname === '/oauth/authorize';

// Returns a Response for OAuth routes, or null when the request is not an OAuth route.
export async function handleOAuth(request, url, env, { repository, fetchUpstream, now, readJson, readForm }) {
  const path = url.pathname;
  const isMetadata = path === '/.well-known/oauth-authorization-server' ||
    path === '/.well-known/oauth-protected-resource' || path === '/.well-known/oauth-protected-resource/mcp';
  if (path.startsWith('/.well-known/') && !isMetadata) throw new AppError(404, 'route_not_found');
  if (!isMetadata && !path.startsWith('/oauth/')) return null;
  const settings = oauthSettings(env);
  const route = `${request.method} ${path}`;
  if (isMetadata && request.method === 'GET') return metadata(url.origin, path);
  if (route === 'POST /oauth/register') return register(request, settings, readJson);
  if (route === 'GET /oauth/authorize') return consent(url, settings, now);
  if (route === 'POST /oauth/authorize') return approve(request, url, settings, now, readForm);
  if (route === 'GET /oauth/callback') return callback(request, url, settings, repository, fetchUpstream, now);
  if (route === 'POST /oauth/token') return token(request, url, settings, repository, now, readForm);
  throw new AppError(404, 'route_not_found');
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, refreshAuthorization } from '@modelcontextprotocol/sdk/client/auth.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../src/index.js';
import { isAllowedRedirect, ACCESS_TTL_MS, REFRESH_TTL_MS, REFRESH_GRACE_MS } from '../src/oauth.js';
import { setup, memoryRepository, fakeGithub, ownerA } from './helpers.js';
import { exerciseGrantStorage } from './grant-storage.js';

// All tests use a simulated GitHub and in-memory storage: they prove Jarvis' own logic,
// not the behaviour of the real GitHub, Claude or PostgreSQL.
const origin = 'https://jarvis.example';
const claudeCallback = 'https://claude.ai/api/mcp/auth_callback';
const form = values => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(values).toString() });

async function server(options = {}) {
  const repository = options.repository ?? memoryRepository();
  const api = await setup(repository, ownerA, options);
  const send = (path, init) => api.app.fetch(new Request(new URL(path, origin), init), api.env);
  return { ...api, repository, send, fetchFn: (url, init) => api.app.fetch(new Request(url, init), api.env) };
}

async function registerClient(app, redirect = claudeCallback, name = 'Claude') {
  const response = await app.send('/oauth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_name: name, redirect_uris: [redirect] }) });
  assert.equal(response.status, 201);
  return (await response.json()).client_id;
}

const cookieOf = (response, name) => response.headers.getSetCookie()
  .find(cookie => cookie.startsWith(`${name}=`))?.split(';')[0];

async function pkce() {
  const verifier = 'v'.repeat(43) + crypto.randomUUID().replaceAll('-', '');
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: Buffer.from(hash).toString('base64url') };
}

function authorizePath(clientId, challenge, extra = {}) {
  return '/oauth/authorize?' + new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: claudeCallback,
    code_challenge: challenge, code_challenge_method: 'S256', state: 'client-state', ...extra });
}

// Simulates the user's browser: consent page -> approve -> GitHub -> callback.
async function browse(app, path) {
  const consent = await app.send(path);
  const html = await consent.text();
  const sealed = /name="request" value="([^"]+)"/.exec(html)?.[1];
  const csrf = cookieOf(consent, '__Host-jarvis_csrf');
  const approve = async (overrides = {}) => app.send('/oauth/authorize', {
    ...form({ request: overrides.request ?? sealed, ...(overrides.unconfirmed ? {} : { confirmed: 'yes' }) }),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: origin, Cookie: csrf, ...overrides.headers } });
  const finish = async (overrides = {}) => {
    const approved = await approve();
    assert.equal(approved.status, 303);
    const github = new URL(approved.headers.get('Location'));
    const login = cookieOf(approved, '__Host-jarvis_login');
    const state = overrides.state ?? github.searchParams.get('state');
    const response = await app.send(`/oauth/callback?code=github-code&state=${state}`,
      { headers: overrides.withoutCookie ? {} : { Cookie: login } });
    return { response, github, location: response.headers.get('Location') && new URL(response.headers.get('Location')) };
  };
  return { consent, html, sealed, csrf, approve, finish };
}

// Runs the whole flow by hand and returns tokens plus what is needed to attack them afterwards.
async function obtainTokens(app) {
  const clientId = await registerClient(app);
  const { verifier, challenge } = await pkce();
  const { location } = await (await browse(app, authorizePath(clientId, challenge))).finish();
  const code = location.searchParams.get('code');
  const exchange = { grant_type: 'authorization_code', code, client_id: clientId, redirect_uri: claudeCallback, code_verifier: verifier };
  const response = await app.send('/oauth/token', form(exchange));
  assert.equal(response.status, 200);
  return { clientId, code, verifier, exchange, tokens: await response.json() };
}

const callApi = (app, accessToken) => app.send('/api/v1/projects', { method: 'POST',
  headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Synthetic OAuth project' }) });

test('discovery: 401 points to metadata that describes this server only', async () => {
  const app = await server();
  const denied = await app.send('/mcp', { method: 'POST' });
  assert.equal(denied.status, 401);
  assert.match(denied.headers.get('WWW-Authenticate'),
    /resource_metadata="https:\/\/jarvis\.example\/\.well-known\/oauth-protected-resource"/);
  for (const path of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp']) {
    assert.deepEqual(await (await app.send(path)).json(),
      { resource: `${origin}/mcp`, authorization_servers: [origin], bearer_methods_supported: ['header'] });
  }
  const metadata = await (await app.send('/.well-known/oauth-authorization-server')).json();
  assert.equal(metadata.issuer, origin);
  assert.deepEqual(metadata.code_challenge_methods_supported, ['S256']);
  assert.deepEqual(metadata.token_endpoint_auth_methods_supported, ['none']);
  assert.equal(metadata.registration_endpoint, `${origin}/oauth/register`);
  assert.equal((await app.send('/.well-known/openid-configuration')).status, 404);
  assert.equal((await app.send('/oauth/unknown')).status, 404);
});

test('incomplete OAuth configuration fails closed', async () => {
  for (const missing of ['OAUTH_SIGNING_KEY', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'GITHUB_ALLOWED_USER_ID']) {
    const app = await server();
    delete app.env[missing];
    for (const path of ['/.well-known/oauth-authorization-server', '/oauth/authorize', '/oauth/callback']) {
      assert.equal((await app.send(path)).status, 503);
    }
    assert.equal((await app.send('/oauth/token', form({}))).status, 503);
  }
  const app = await server();
  app.env.GITHUB_ALLOWED_USER_ID = 'joancardonall'; // a username is refused: only the numeric id is accepted
  assert.equal((await app.send('/oauth/authorize')).status, 503);
});

test('official MCP SDK completes discovery, registration, PKCE login and tool calls', async () => {
  const app = await server();
  const saved = {};
  const provider = {
    redirectUrl: claudeCallback,
    clientMetadata: { client_name: 'Claude', redirect_uris: [claudeCallback], token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] },
    clientInformation: () => saved.client, saveClientInformation: client => { saved.client = client; },
    tokens: () => saved.tokens, saveTokens: tokens => { saved.tokens = tokens; },
    redirectToAuthorization: url => { saved.authorizeUrl = url; },
    saveCodeVerifier: verifier => { saved.verifier = verifier; }, codeVerifier: () => saved.verifier,
  };
  assert.equal(await auth(provider, { serverUrl: `${origin}/mcp`, fetchFn: app.fetchFn }), 'REDIRECT');
  assert.equal(saved.authorizeUrl.searchParams.get('resource'), `${origin}/mcp`);

  const browser = await browse(app, saved.authorizeUrl.pathname + saved.authorizeUrl.search);
  assert.equal(browser.consent.status, 200);
  assert.equal(app.repository.grants.length, 0);
  const { response, github, location } = await browser.finish();
  assert.equal(response.status, 302);
  assert.equal(github.origin + github.pathname, 'https://github.com/login/oauth/authorize');
  assert.equal(github.searchParams.get('redirect_uri'), `${origin}/oauth/callback`);
  assert.equal(github.searchParams.has('scope'), false);
  assert.equal(location.origin + location.pathname, claudeCallback);
  assert.equal(location.searchParams.get('iss'), origin);
  assert.equal(JSON.parse(app.github.calls[0].init.body).client_secret, app.env.GITHUB_CLIENT_SECRET);

  assert.equal(await auth(provider, { serverUrl: `${origin}/mcp`, fetchFn: app.fetchFn,
    authorizationCode: location.searchParams.get('code') }), 'AUTHORIZED');
  assert.equal(saved.tokens.token_type, 'Bearer');
  assert.equal(saved.tokens.expires_in, ACCESS_TTL_MS / 1000);

  const client = new Client({ name: 'jarvis-oauth-test', version: '1.0.0' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), { authProvider: provider, fetch: app.fetchFn }));
    const created = await client.callTool({ name: 'jarvis.create_project', arguments: { name: 'Synthetic OAuth project' } });
    assert.equal(created.isError, undefined);
    assert.equal([...app.repository.rows.values()][0].owner_id, ownerA);
  } finally { await client.close(); }

  // Only hashes are persisted: no code or token appears in storage.
  const stored = JSON.stringify(app.repository.grants);
  for (const secret of [saved.tokens.access_token, saved.tokens.refresh_token, location.searchParams.get('code')]) {
    assert.equal(stored.includes(secret), false);
  }
  const metadata = await (await app.send('/.well-known/oauth-authorization-server')).json();
  const refreshed = await refreshAuthorization(origin, { metadata, clientInformation: saved.client,
    refreshToken: saved.tokens.refresh_token, fetchFn: app.fetchFn });
  assert.notEqual(refreshed.refresh_token, saved.tokens.refresh_token);
  assert.equal((await callApi(app, refreshed.access_token)).status, 201);
});

test('redirect allowlist: codes can only go to Claude or to a loopback address', async () => {
  for (const allowed of [claudeCallback, 'https://claude.com/api/mcp/auth_callback', 'http://localhost:3118/callback',
    'http://127.0.0.1:52000/callback', 'http://localhost/callback']) assert.equal(isAllowedRedirect(allowed), true, allowed);
  for (const refused of ['https://evil.example/callback', 'https://claude.ai.evil.example/api/mcp/auth_callback',
    'https://claude.ai/api/mcp/auth_callback/../x', 'https://claude.ai/api/mcp/auth_callback?next=evil',
    'http://claude.ai/api/mcp/auth_callback', 'http://localhost.evil.example/callback', 'http://user@localhost/callback',
    'http://localhost/callback#fragment', 'https://localhost/callback', 'http://192.168.1.10/callback',
    'http://[::1]/callback', 'javascript:alert(1)', 'http://LOCALHOST/callback', '', null, 42,
    `http://localhost/${'a'.repeat(300)}`]) assert.equal(isAllowedRedirect(refused), false, String(refused));
  const app = await server();
  for (const body of [{ redirect_uris: ['https://evil.example/cb'] }, { redirect_uris: [claudeCallback, 'https://evil.example/cb'] },
    { redirect_uris: [] }, { redirect_uris: Array(6).fill(claudeCallback) }, { redirect_uris: 'x' }, {}, null]) {
    const response = await app.send('/oauth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(response.status, 400);
  }
  assert.equal(app.repository.grants.length, 0);
});

test('loopback clients may use a different port than registered, but never another host or path', async () => {
  const app = await server();
  const clientId = await registerClient(app, 'http://localhost/callback');
  const { challenge } = await pkce();
  for (const [redirect, status] of [['http://localhost:3118/callback', 200], ['http://localhost:51000/callback', 200],
    ['http://127.0.0.1:3118/callback', 400], ['http://localhost:3118/other', 400], [claudeCallback, 400],
    ['http://localhost.evil.example:3118/callback', 400]]) {
    assert.equal((await app.send(authorizePath(clientId, challenge, { redirect_uri: redirect }))).status, status, redirect);
  }
  // A client registered for Claude web can never be redirected to a loopback address.
  const webClient = await registerClient(app);
  assert.equal((await app.send(authorizePath(webClient, challenge, { redirect_uri: 'http://localhost:3118/callback' }))).status, 400);
});

test('authorization request problems are shown, never redirected', async () => {
  const app = await server();
  const clientId = await registerClient(app);
  const { challenge } = await pkce();
  const tampered = clientId.replace(/.$/, char => (char === 'A' ? 'B' : 'A'));
  const other = await server();
  other.env.OAUTH_SIGNING_KEY = 'another_fictitious_signing_key_0123456789abcdef';
  const foreignClient = await registerClient(other);
  for (const path of [
    authorizePath(tampered, challenge), authorizePath(foreignClient, challenge), authorizePath('unknown', challenge),
    authorizePath(clientId, challenge, { redirect_uri: 'http://localhost:1/callback' }),
    authorizePath(clientId, challenge, { redirect_uri: 'https://evil.example/cb' }),
    authorizePath(clientId, challenge, { code_challenge_method: 'plain' }),
    authorizePath(clientId, 'short'), authorizePath(clientId, challenge, { response_type: 'token' }),
    authorizePath(clientId, challenge, { resource: 'https://other.example/mcp' }),
    authorizePath(clientId, challenge, { state: 's'.repeat(513) }),
  ]) {
    const response = await app.send(path);
    assert.equal(response.status, 400, path);
    assert.equal(response.headers.get('Location'), null);
    assert.equal(response.headers.getSetCookie().length, 0);
  }
});

test('consent page escapes client data, forbids framing and cannot be approved cross-site', async () => {
  const app = await server();
  const clientId = await registerClient(app, claudeCallback, '<script>alert(1)</script>"\'');
  const { challenge } = await pkce();
  const browser = await browse(app, authorizePath(clientId, challenge));
  assert.equal(browser.html.includes('<script'), false);
  assert.match(browser.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;&quot;&#39;/);
  assert.match(browser.html, /claude\.ai/);
  assert.match(browser.consent.headers.get('Content-Security-Policy'), /default-src 'none'.*frame-ancestors 'none'/);
  assert.equal(browser.consent.headers.get('X-Frame-Options'), 'DENY');
  assert.equal(browser.consent.headers.get('Cache-Control'), 'no-store');
  // `no-referrer` would make real browsers send `Origin: null` with the form and break approval.
  assert.equal(browser.consent.headers.get('Referrer-Policy'), 'same-origin');
  assert.match(browser.consent.headers.getSetCookie()[0], /^__Host-jarvis_csrf=[^;]+; Path=\/; Max-Age=600; HttpOnly; Secure; SameSite=Strict$/);

  // Cross-site form, missing Origin, another browser (no cookie or a different one), altered request.
  assert.equal((await browser.approve({ headers: { Origin: 'https://evil.example' } })).status, 403);
  const noOrigin = await app.send('/oauth/authorize', { ...form({ request: browser.sealed }),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: browser.csrf } });
  assert.equal(noOrigin.status, 403);
  assert.equal((await browser.approve({ headers: { Cookie: '' } })).status, 403);
  const stranger = await browse(app, authorizePath(clientId, challenge));
  assert.equal((await browser.approve({ headers: { Cookie: stranger.csrf } })).status, 403);
  assert.equal((await browser.approve({ request: browser.sealed.replace(/^./, 'x') })).status, 403);
  assert.equal((await browser.approve({ request: clientId })).status, 403); // signature made for another purpose
  for (const refused of [await browser.approve({ headers: { Cookie: '' } })]) assert.equal(refused.headers.get('Location'), null);

  // The confirmation box is enforced by the server, not only by the browser.
  assert.match(browser.html, /<input type="checkbox" name="confirmed" value="yes" required>/);
  const unconfirmed = await browser.approve({ unconfirmed: true });
  assert.equal(unconfirmed.status, 400);
  assert.equal(unconfirmed.headers.get('Location'), null);
  // What a real browser sends when a page forbids referrers; must never be accepted.
  assert.equal((await browser.approve({ headers: { Origin: 'null' } })).status, 403);

  const approved = await browser.approve();
  assert.equal(approved.status, 303);
  assert.match(cookieOf(approved, '__Host-jarvis_login'), /^__Host-jarvis_login=/);
  assert.match(approved.headers.getSetCookie().find(cookie => cookie.startsWith('__Host-jarvis_login')), /HttpOnly; Secure; SameSite=Lax$/);
});

test('callback: only the approving browser and only the allowed GitHub account get a code', async () => {
  const start = async options => {
    const app = await server(options);
    const clientId = await registerClient(app);
    return { app, browser: await browse(app, authorizePath(clientId, (await pkce()).challenge)) };
  };
  // A link forwarded to a victim: their browser never approved, so it has no login cookie.
  let { app, browser } = await start();
  let result = await browser.finish({ withoutCookie: true });
  assert.equal(result.response.status, 403);
  assert.equal(app.github.calls.length, 0);
  ({ app, browser } = await start());
  result = await browser.finish({ state: 'guessed-state' });
  assert.equal(result.response.status, 403);
  assert.equal(app.github.calls.length, 0);

  // Any other GitHub account, even with a valid GitHub login, is refused.
  ({ app, browser } = await start({ github: fakeGithub(999999) }));
  result = await browser.finish();
  assert.equal(result.response.status, 403);
  assert.equal(result.location, null);
  assert.equal(app.repository.grants.length, 0);
  assert.match(result.response.headers.getSetCookie()[0], /^__Host-jarvis_login=; Path=\/; Max-Age=0/);

  for (const github of [fakeGithub(null), fakeGithub('424242'), fakeGithub(0),
    { calls: [], fetchUpstream: async () => new Response('down', { status: 500 }) }]) {
    ({ app, browser } = await start({ github }));
    assert.equal((await browser.finish()).response.status, 403);
    assert.equal(app.repository.grants.length, 0);
  }
  ({ app, browser } = await start({ github: { calls: [], fetchUpstream: async () => { throw new Error('SECRET network detail'); } } }));
  result = await browser.finish();
  assert.equal(result.response.status, 502);
  assert.equal((await result.response.text()).includes('SECRET'), false);

  // Malformed GitHub codes never reach GitHub.
  ({ app, browser } = await start());
  const approvedOnce = await browser.approve();
  const junk = await app.send(`/oauth/callback?code=${encodeURIComponent('a b<>')}&state=${
    new URL(approvedOnce.headers.get('Location')).searchParams.get('state')}`,
    { headers: { Cookie: cookieOf(approvedOnce, '__Host-jarvis_login') } });
  assert.equal(junk.status, 403);
  assert.equal(app.github.calls.length, 0);

  // The login must be finished within ten minutes.
  let now = Date.now();
  ({ app, browser } = await start({ clock: () => now }));
  const approved = await browser.approve();
  now += 601_000;
  const late = await app.send(`/oauth/callback?code=x&state=${new URL(approved.headers.get('Location')).searchParams.get('state')}`,
    { headers: { Cookie: cookieOf(approved, '__Host-jarvis_login') } });
  assert.equal(late.status, 403);
  now += 0;
  assert.equal((await browser.approve()).status, 403); // the consent itself has expired too
});

test('token endpoint: PKCE, client and redirect binding, single-use codes', async () => {
  const attempt = async change => {
    const app = await server();
    const flow = await obtainTokensUpToCode(app);
    const response = await app.send('/oauth/token', form(change(flow.exchange, app, flow)));
    return { app, flow, response };
  };
  async function obtainTokensUpToCode(app) {
    const clientId = await registerClient(app);
    const { verifier, challenge } = await pkce();
    const { location } = await (await browse(app, authorizePath(clientId, challenge))).finish();
    return { clientId, exchange: { grant_type: 'authorization_code', code: location.searchParams.get('code'),
      client_id: clientId, redirect_uri: claudeCallback, code_verifier: verifier } };
  }
  for (const change of [
    exchange => ({ ...exchange, code_verifier: 'w'.repeat(43) }),
    exchange => ({ ...exchange, code_verifier: '' }),
    exchange => ({ ...exchange, redirect_uri: 'https://claude.com/api/mcp/auth_callback' }),
    exchange => ({ ...exchange, code: exchange.code.slice(0, -1) + (exchange.code.endsWith('A') ? 'B' : 'A') }),
    exchange => ({ ...exchange, code: 'jvs_ac_invented' }),
  ]) {
    const { response } = await attempt(change);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid_grant' });
  }
  // A different registered client cannot redeem someone else's code.
  let { app, flow, response } = await attempt(exchange => exchange);
  assert.equal(response.status, 200);
  const thief = await server();
  thief.env.OAUTH_SIGNING_KEY = 'another_fictitious_signing_key_0123456789abcdef'; // not registered with this server
  const thiefClient = await registerClient(thief, 'http://localhost:9/callback');
  const fresh = await obtainTokensUpToCode(app);
  response = await app.send('/oauth/token', form({ ...fresh.exchange, client_id: await registerClient(app, 'http://localhost:9/callback') }));
  assert.deepEqual(await response.json(), { error: 'invalid_grant' });
  response = await app.send('/oauth/token', form({ ...fresh.exchange, client_id: thiefClient }));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'invalid_client' });

  // Replaying a used code cancels the tokens that were issued from it.
  ({ app, flow, response } = await attempt(exchange => exchange));
  const tokens = await response.json();
  assert.equal((await callApi(app, tokens.access_token)).status, 201);
  assert.deepEqual(await (await app.send('/oauth/token', form(flow.exchange))).json(), { error: 'invalid_grant' });
  assert.equal((await callApi(app, tokens.access_token)).status, 401);
  assert.deepEqual(await (await app.send('/oauth/token', form({ grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token, client_id: flow.clientId }))).json(), { error: 'invalid_grant' });

  // Two simultaneous exchanges: exactly one succeeds.
  app = await server();
  flow = await obtainTokensUpToCode(app);
  const race = await Promise.all([1, 2].map(() => app.send('/oauth/token', form(flow.exchange))));
  assert.deepEqual(race.map(result => result.status).sort(), [200, 400]);
  const winner = await race.find(result => result.status === 200).json();
  assert.equal((await callApi(app, winner.access_token)).status, 401); // the duplicate exchange revoked it

  let now = Date.now();
  app = await server({ clock: () => now });
  flow = await obtainTokensUpToCode(app);
  now += 61_000;
  assert.equal((await app.send('/oauth/token', form(flow.exchange))).status, 400);

  assert.deepEqual(await (await app.send('/oauth/token', form({ ...flow.exchange, grant_type: 'password' }))).json(),
    { error: 'unsupported_grant_type' });
  assert.deepEqual(await (await app.send('/oauth/token', form({ ...flow.exchange, resource: 'https://other.example' }))).json(),
    { error: 'invalid_target' });
  assert.equal((await app.send('/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 415);
  assert.equal((await app.send('/oauth/token', form({ padding: 'x'.repeat(20000) }))).status, 413);
  assert.equal((await app.send('/oauth/token', { ...form(flow.exchange),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://evil.example' } })).status, 403);
});

test('refresh tokens rotate; an old one used later revokes the connection', async () => {
  let now = Date.now();
  const app = await server({ clock: () => now });
  const { clientId, tokens } = await obtainTokens(app);
  const refresh = (refreshToken, client = clientId) => app.send('/oauth/token',
    form({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: client }));

  now += ACCESS_TTL_MS - 1000;
  assert.equal((await callApi(app, tokens.access_token)).status, 201);
  now += 2000;
  assert.equal((await callApi(app, tokens.access_token)).status, 401); // access token expired

  const second = await (await refresh(tokens.refresh_token)).json();
  assert.notEqual(second.refresh_token, tokens.refresh_token);
  assert.equal((await callApi(app, second.access_token)).status, 201);

  // Lost response: the same old token retried within the short window still works.
  now += REFRESH_GRACE_MS - 1000;
  const retried = await refresh(tokens.refresh_token);
  assert.equal(retried.status, 200);
  const third = await retried.json();
  assert.equal((await callApi(app, third.access_token)).status, 201);

  // Another client cannot use this refresh token, and an invented one is refused.
  const otherClient = await registerClient(app, 'http://localhost:7/callback');
  assert.deepEqual(await (await refresh(third.refresh_token, otherClient)).json(), { error: 'invalid_grant' });
  assert.deepEqual(await (await refresh('jvs_rt_invented')).json(), { error: 'invalid_grant' });
  assert.equal((await callApi(app, third.access_token)).status, 201);

  // After the window, the replaced token is evidence of theft: everything is revoked.
  now += 5000;
  assert.deepEqual(await (await refresh(tokens.refresh_token)).json(), { error: 'invalid_grant' });
  assert.equal((await callApi(app, third.access_token)).status, 401);
  assert.deepEqual(await (await refresh(third.refresh_token)).json(), { error: 'invalid_grant' });

  // Thief replays a stolen token inside the retry window: when the legitimate client then uses
  // the token it was given, both holders are cut off instead of the thief keeping access.
  const raided = await server({ clock: () => now });
  const victim = await obtainTokens(raided);
  const use = token => raided.send('/oauth/token', form({ grant_type: 'refresh_token', refresh_token: token, client_id: victim.clientId }));
  const legitimate = await (await use(victim.tokens.refresh_token)).json();
  now += 5000;
  const stolen = await (await use(victim.tokens.refresh_token)).json();
  assert.ok(stolen.refresh_token);
  assert.deepEqual(await (await use(legitimate.refresh_token)).json(), { error: 'invalid_grant' });
  assert.equal((await callApi(raided, stolen.access_token)).status, 401);
  assert.deepEqual(await (await use(stolen.refresh_token)).json(), { error: 'invalid_grant' });

  // An unused refresh token expires after 30 days; using it in time extends the connection.
  const longLived = await server({ clock: () => now });
  const session = await obtainTokens(longLived);
  const renew = token => longLived.send('/oauth/token', form({ grant_type: 'refresh_token', refresh_token: token, client_id: session.clientId }));
  now += REFRESH_TTL_MS - 60_000;
  const renewed = await (await renew(session.tokens.refresh_token)).json();
  now += REFRESH_TTL_MS - 60_000;
  const again = await (await renew(renewed.refresh_token)).json();
  assert.ok(again.access_token);
  now += REFRESH_TTL_MS + 1000;
  assert.deepEqual(await (await renew(again.refresh_token)).json(), { error: 'invalid_grant' });
});

test('forged credentials are rejected without touching the database', async () => {
  const failing = new Proxy({}, { get: () => () => { throw new Error('database must not be used'); } });
  const app = await server({ repository: failing });
  const forged = `jvs_at_${'A'.repeat(43)}.${'B'.repeat(43)}`;
  for (const Authorization of [`Bearer ${forged}`, 'Bearer jvs_at_short', `Bearer ${'x'.repeat(43)}`, 'Basic abc', '']) {
    const response = await app.send('/mcp', { method: 'POST', headers: { Authorization } });
    assert.equal(response.status, 401, Authorization);
  }
  const clientId = await registerClient(app);
  assert.equal((await app.send('/oauth/token', form({ grant_type: 'authorization_code', client_id: clientId,
    code: `jvs_ac_${'A'.repeat(43)}.${'B'.repeat(43)}`, code_verifier: 'v'.repeat(43), redirect_uri: claudeCallback }))).status, 400);
  assert.equal((await app.send('/oauth/token', form({ grant_type: 'refresh_token', client_id: clientId,
    refresh_token: `jvs_rt_${'A'.repeat(43)}.${'B'.repeat(43)}` }))).status, 400);
  assert.equal((await app.send('/oauth/authorize?client_id=x')).status, 400);
});

test('tokens stop working when the signing key or the owner changes; fixed token is optional', async () => {
  const app = await server();
  const { tokens } = await obtainTokens(app);
  assert.equal((await callApi(app, tokens.access_token)).status, 201);
  // A refresh or code token is never accepted as an access token.
  assert.equal((await callApi(app, tokens.refresh_token)).status, 401);

  delete app.env.DEV_TOKEN_SHA256; // fixed development token disabled: OAuth keeps working
  assert.equal((await callApi(app, tokens.access_token)).status, 201);
  assert.equal((await app.request('/api/v1/projects', { body: { name: 'x' } })).status, 401);

  const original = app.env.OAUTH_SIGNING_KEY;
  app.env.OAUTH_SIGNING_KEY = 'rotated_fictitious_signing_key_0123456789abcdef'; // emergency switch
  assert.equal((await callApi(app, tokens.access_token)).status, 401);
  app.env.OAUTH_SIGNING_KEY = original;
  app.env.DEV_OWNER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  assert.equal((await callApi(app, tokens.access_token)).status, 401);
});

test('in-memory storage simulator follows the shared storage scenario', async () => {
  await exerciseGrantStorage(memoryRepository(), ownerA);
});

test('createApp defaults stay usable without injected dependencies', () => {
  assert.equal(typeof createApp().fetch, 'function');
});

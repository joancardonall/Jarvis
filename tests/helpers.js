import { createApp } from '../src/index.js';
import { digest } from '../src/projects.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export const ownerA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const ownerB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const token = 'fictitious_test_credential_not_for_deployment_123456789';
// Fictitious OAuth configuration: never valid against GitHub or any deployment.
export const allowedGithubUser = '424242';
export const oauthEnv = {
  OAUTH_SIGNING_KEY: 'fictitious_signing_key_for_tests_only_0123456789',
  GITHUB_CLIENT_ID: 'fictitious-github-client', GITHUB_CLIENT_SECRET: 'fictitious_github_secret_0123456789',
  GITHUB_ALLOWED_USER_ID: allowedGithubUser,
};

// Simulated GitHub: answers the two calls Jarvis makes, as the given numeric user. No network.
export function fakeGithub(userId = Number(allowedGithubUser)) {
  const calls = [];
  const fetchUpstream = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url) === 'https://github.com/login/oauth/access_token') {
      return Response.json(userId === null ? { error: 'bad_verification_code' } : { access_token: 'fictitious-github-token' });
    }
    if (String(url) === 'https://api.github.com/user') return Response.json({ id: userId, login: 'renamable-login' });
    throw new Error('unexpected upstream call');
  };
  return { calls, fetchUpstream };
}

export async function setup(repository, owner = ownerA, { github = fakeGithub(), clock = Date.now } = {}) {
  const env = { DEV_TOKEN_SHA256: await digest(token), DEV_OWNER_ID: owner,
    DEV_TOKEN_EXPIRES_AT: new Date(Date.now() + 3600000).toISOString(), ...oauthEnv };
  const app = createApp(() => repository, { fetchUpstream: github.fetchUpstream, clock });
  const request = (path, { body, headers, method, ...rest } = {}) => app.fetch(new Request(`http://localhost${path}`, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), ...rest,
  }), env);
  const connect = async () => {
    const client = new Client({ name: 'jarvis-test-client', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
      fetch: (url, init) => app.fetch(new Request(url, init), env),
    });
    await client.connect(transport);
    return client;
  };
  return { env, app, request, connect, github };
}

// Deterministic storage simulator; never presented as PostgreSQL validation.
export function memoryRepository() {
  const rows = new Map();
  const grants = [];
  const time = value => new Date(value).getTime();
  const store = (grant, tokens) => Object.assign(grant, {
    access_hash: tokens.access_hash, access_expires_at: tokens.access_expires_at,
    refresh_hash: tokens.refresh_hash, refresh_expires_at: tokens.refresh_expires_at });
  return {
    rows, grants,
    // Mirrors the conditions of the SQL statements in src/repository.js.
    async createGrant(grant) {
      if (grants.some(existing => existing.code_hash === grant.code_hash)) throw new Error('duplicate');
      grants.push({ ...grant, code_used_at: null, access_hash: null, refresh_hash: null,
        previous_refresh_hash: null, superseded_refresh_hash: null, refresh_rotated_at: null, revoked_at: null });
    },
    async findGrantByCode(codeHash) { return grants.find(grant => grant.code_hash === codeHash); },
    async redeemCode(codeHash, tokens, now) {
      const grant = grants.find(candidate => candidate.code_hash === codeHash && !candidate.code_used_at &&
        !candidate.revoked_at && time(candidate.code_expires_at) > time(now));
      if (!grant) return false;
      store(grant, tokens).code_used_at = now;
      return true;
    },
    async findGrantByAccess(accessHash, now) {
      return grants.find(grant => grant.access_hash === accessHash && !grant.revoked_at &&
        time(grant.access_expires_at) > time(now));
    },
    async rotateRefresh(refreshHash, clientHash, tokens, now, retryLimit) {
      const usable = grant => grant.client_hash === clientHash && !grant.revoked_at &&
        time(grant.refresh_expires_at) > time(now);
      const current = grants.find(grant => grant.refresh_hash === refreshHash && usable(grant));
      if (current) {
        current.previous_refresh_hash = current.refresh_hash;
        current.superseded_refresh_hash = null;
        current.refresh_rotated_at = now;
        store(current, tokens);
        return true;
      }
      const retried = grants.find(grant => grant.previous_refresh_hash === refreshHash && usable(grant) &&
        !grant.superseded_refresh_hash && time(grant.refresh_rotated_at) > time(retryLimit));
      if (retried) {
        retried.superseded_refresh_hash = retried.refresh_hash;
        store(retried, tokens);
        return true;
      }
      for (const grant of grants) {
        if ([grant.previous_refresh_hash, grant.superseded_refresh_hash].includes(refreshHash) && !grant.revoked_at) {
          grant.revoked_at = now;
        }
      }
      return false;
    },
    async revokeGrant(id, now) {
      const grant = grants.find(candidate => candidate.id === id);
      if (grant && !grant.revoked_at) grant.revoked_at = now;
    },
    async create(data) {
      const existing = data.idempotency_key && [...rows.values()].find(row =>
        row.owner_id === data.owner_id && row.idempotency_key === data.idempotency_key);
      if (existing) return existing;
      const row = { ...data, status: 'active', created_at: new Date(), updated_at: new Date() };
      rows.set(row.id, row);
      return row;
    },
    async get(owner, id) { const row = rows.get(id); return row?.owner_id === owner ? row : undefined; },
  };
}

import { createApp } from '../src/index.js';
import { digest } from '../src/projects.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export const ownerA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const ownerB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const token = 'fictitious_test_credential_not_for_deployment_123456789';
export async function setup(repository, owner = ownerA) {
  const env = { DEV_TOKEN_SHA256: await digest(token), DEV_OWNER_ID: owner,
    DEV_TOKEN_EXPIRES_AT: new Date(Date.now() + 3600000).toISOString() };
  const app = createApp(() => repository);
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
  return { env, app, request, connect };
}

// Deterministic storage simulator; never presented as PostgreSQL validation.
export function memoryRepository() {
  const rows = new Map();
  return {
    rows,
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

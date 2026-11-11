import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, memoryRepository, ownerB, token } from './helpers.js';

const input = { name: 'Fictitious bicycle', description: 'Synthetic project' };

test('API create -> MCP get; MCP create -> new API instance get', async () => {
  const repo = memoryRepository();
  const api = await setup(repo);
  const response = await api.request('/api/v1/projects', { body: input });
  assert.equal(response.status, 201);
  const first = await response.json();
  assert.equal(first.name, input.name);
  assert.equal('owner_id' in first, false);
  assert.equal('request_hash' in first, false);
  const client = await api.connect();
  try {
    assert.deepEqual((await client.listTools()).tools.map(t => t.name).sort(),
      ['jarvis.create_project', 'jarvis.get_project']);
    const read = await client.callTool({ name: 'jarvis.get_project', arguments: { project_id: first.id } });
    assert.deepEqual(read.structuredContent, first);
    const created = await client.callTool({ name: 'jarvis.create_project', arguments: { name: 'Second synthetic project' } });
    assert.equal(created.isError, undefined);
    const fresh = await setup(repo);
    assert.deepEqual(await (await fresh.request(`/api/v1/projects/${created.structuredContent.id}`)).json(), created.structuredContent);
  } finally { await client.close(); }
});

test('optional idempotency: no key creates distinct projects; keyed replay crosses transports', async () => {
  const repo = memoryRepository();
  const api = await setup(repo);
  const first = await (await api.request('/api/v1/projects', { body: input })).json();
  const second = await (await api.request('/api/v1/projects', { body: input })).json();
  assert.notEqual(first.id, second.id);
  const keyed = await (await api.request('/api/v1/projects', { body: input, headers: { 'Idempotency-Key': 'retry-1' } })).json();
  const client = await api.connect();
  try {
    const replay = await client.callTool({ name: 'jarvis.create_project', arguments: { ...input, idempotency_key: 'retry-1' } });
    assert.deepEqual(replay.structuredContent, keyed);
    const conflict = await client.callTool({ name: 'jarvis.create_project', arguments: { name: 'Different', idempotency_key: 'retry-1' } });
    assert.equal(conflict.isError, true);
    assert.equal(conflict.content[0].text, 'idempotency_conflict');
    assert.equal((await api.request('/api/v1/projects', { body: { name: 'Changed' }, headers: { 'Idempotency-Key': 'retry-1' } })).status, 409);
    assert.equal(repo.rows.size, 3);
  } finally { await client.close(); }
});

test('owner isolation and independent key namespaces', async () => {
  const repo = memoryRepository();
  const a = await setup(repo);
  const b = await setup(repo, ownerB);
  const body = { name: 'Synthetic' };
  const headers = { 'Idempotency-Key': 'same-key' };
  const one = await (await a.request('/api/v1/projects', { body, headers })).json();
  const two = await (await b.request('/api/v1/projects', { body, headers })).json();
  assert.notEqual(one.id, two.id);
  assert.equal((await b.request(`/api/v1/projects/${one.id}`)).status, 404);
  const client = await b.connect();
  try {
    const denied = await client.callTool({ name: 'jarvis.get_project', arguments: { project_id: one.id } });
    assert.equal(denied.isError, true);
    assert.equal(denied.content[0].text, 'project_not_found');
  } finally { await client.close(); }
});

for (const body of [{}, { name: '' }, { name: '  ' }, { name: 123 }, { name: 'a'.repeat(201) },
  { name: 'test', description: 'a'.repeat(2001) }, { name: 'test', owner_id: ownerB },
  { name: 'test', status: 'completed' }, { name: 'test', idempotency_key: 'body-key' }, null, []]) {
  test(`HTTP rejects invalid project ${JSON.stringify(body).slice(0, 80)}`, async () => {
    const api = await setup(memoryRepository());
    assert.equal((await api.request('/api/v1/projects', { body })).status, 422);
  });
}

test('authentication fails closed for absent, bad, expired and unconfigured credentials', async () => {
  const api = await setup(memoryRepository());
  for (const path of ['/api/v1/projects', '/mcp']) {
    for (const Authorization of ['', 'Bearer invalid', `Bearer ${'x'.repeat(43)}`]) {
      const response = await api.request(path, { headers: { Authorization } });
      assert.equal(response.status, 401);
      assert.match(response.headers.get('WWW-Authenticate'), /Bearer/);
    }
  }
  api.env.DEV_TOKEN_EXPIRES_AT = '2000-01-01T00:00:00Z';
  assert.equal((await api.request('/mcp')).status, 401);
  delete api.env.DEV_TOKEN_SHA256;
  assert.equal((await api.request('/mcp')).status, 503);
});

test('validation, media, body limit, Origin, HTTPS and non-disclosing errors', async () => {
  const api = await setup(memoryRepository());
  assert.equal((await api.request('/health', { headers: { Authorization: '' } })).status, 200);
  assert.equal((await api.request('/api/v1/projects/not-uuid')).status, 422);
  assert.equal((await api.request('/api/v1/projects/cccccccc-cccc-4ccc-8ccc-cccccccccccc')).status, 404);
  assert.equal((await api.request('/api/v1/projects', { body: input, headers: { 'Idempotency-Key': '' } })).status, 422);
  assert.equal((await api.request('/api/v1/projects', { body: input, headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await api.request('/api/v1/projects', { body: { name: 'x'.repeat(20000) } })).status, 413);
  assert.equal((await api.request('/mcp', { headers: { Origin: 'https://evil.example' } })).status, 403);
  const insecure = await api.app.fetch(new Request('http://external.example/mcp'), api.env);
  assert.equal(insecure.status, 400);
  const malformed = await api.app.fetch(new Request('http://localhost/api/v1/projects', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{',
  }), api.env);
  assert.equal(malformed.status, 400);
  const failing = await setup({ create() { throw new Error('SECRET_DSN'); }, get() { throw new Error('SECRET_DSN'); } });
  const failure = await failing.request('/api/v1/projects', { body: input });
  assert.equal(failure.status, 503);
  assert.equal(await failure.text(), '{"error":"service_unavailable"}');
  const client = await failing.connect();
  try {
    const result = await client.callTool({ name: 'jarvis.create_project', arguments: input });
    assert.equal(result.isError, true);
    assert.equal(result.content[0].text, 'service_unavailable');
  } finally { await client.close(); }
});

test('MCP schema rejects unknown owner and invalid UUID without writing', async () => {
  const repo = memoryRepository();
  const api = await setup(repo);
  const client = await api.connect();
  try {
    for (const arguments_ of [{ name: 'Synthetic', owner_id: ownerB }, { name: '' }, { name: 'Synthetic', idempotency_key: '' }]) {
      const result = await client.callTool({ name: 'jarvis.create_project', arguments: arguments_ });
      assert.equal(result.isError, true);
    }
    assert.equal((await client.callTool({ name: 'jarvis.get_project', arguments: { project_id: 'bad' } })).isError, true);
    assert.equal(repo.rows.size, 0);
  } finally { await client.close(); }
});

test('production Neon adapter sends parameterized transaction and owner-filtered reads (HTTP simulated)', async () => {
  const { neonConfig } = await import('@neondatabase/serverless');
  const { neonRepository, CREATE_PROJECT, GET_PROJECT } = await import('../src/repository.js');
  const previous = neonConfig.fetchFunction;
  const calls = [];
  neonConfig.fetchFunction = async (_url, options) => {
    const payload = JSON.parse(options.body);
    calls.push(payload);
    assert.ok(options.signal instanceof AbortSignal);
    const result = { fields: [{ name: 'id', dataTypeID: 25 }], rows: [['synthetic-result']] };
    return Response.json(payload.queries ? { results: [result] } : result);
  };
  try {
    const repo = neonRepository('postgresql://synthetic:synthetic@synthetic.example/jarvis_test');
    const data = { id: 'id', owner_id: 'owner', name: "Name with ' quotes", description: '', idempotency_key: null, request_hash: 'a'.repeat(64) };
    assert.equal((await repo.create(data)).id, 'synthetic-result');
    assert.equal((await repo.get('owner', 'id')).id, 'synthetic-result');
    assert.equal(calls[0].queries[0].query, CREATE_PROJECT);
    assert.deepEqual(calls[0].queries[0].params, [data.id, data.owner_id, data.name, '', null, data.request_hash]);
    assert.equal(calls[1].query, GET_PROJECT);
    assert.deepEqual(calls[1].params, ['owner', 'id']);
  } finally { neonConfig.fetchFunction = previous; }
});

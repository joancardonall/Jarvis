import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../src/index.js';
import { databaseUrl, runSafely } from './ops-config.js';

await runSafely(async () => {
  const env = parseEnv(await readFile('.dev.vars', 'utf8'));
  databaseUrl(env.DATABASE_URL, 'jarvis_dev');
  const { JARVIS_BEARER_TOKEN: token } = parseEnv(await readFile('.env.client', 'utf8'));
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const useWorker = process.argv.includes('--worker');
  const useRemote = process.argv.includes('--remote');
  const base = useRemote ? 'https://jarvis.jarvis-joancardonall.workers.dev'
    : useWorker ? 'http://127.0.0.1:8787' : 'http://localhost';
  const send = request => useWorker || useRemote ? fetch(request) : createApp().fetch(request, env);
  if (useRemote) {
    assert.equal((await send(new Request(`${base}/health`))).status, 200);
    assert.equal((await send(new Request(`${base}/mcp`))).status, 401);
    assert.equal((await send(new Request(`${base}/mcp`, {
      headers: { Authorization: 'Bearer invalid' },
    }))).status, 401);
    assert.equal((await send(new Request(`${base}/mcp`, {
      headers: { ...headers, Origin: 'https://untrusted.example' },
    }))).status, 403);
  }
  const response = await send(new Request(`${base}/api/v1/projects`, {
    method: 'POST', headers: { ...headers, 'Idempotency-Key': 'jarvis-neon-api-proof' },
    body: JSON.stringify({ name: 'Synthetic Neon API proof' }),
  }));
  assert.equal(response.status, 201);
  const first = await response.json();
  const client = new Client({ name: 'jarvis-neon-development-proof', version: '1.0.0' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
      requestInit: { headers }, fetch: (url, options) => send(new Request(url, options)),
    }));
    assert.equal((await client.listTools()).tools.length, 2);
    assert.deepEqual((await client.callTool({ name: 'jarvis.get_project', arguments: { project_id: first.id } })).structuredContent, first);
    const result = await client.callTool({ name: 'jarvis.create_project', arguments: {
      name: 'Synthetic Neon MCP proof', idempotency_key: 'jarvis-neon-mcp-proof',
    } });
    assert.ok(!result.isError);
    const second = result.structuredContent;
    const fresh = await send(new Request(`${base}/api/v1/projects/${second.id}`, { headers }));
    assert.equal(fresh.status, 200);
    assert.deepEqual(await fresh.json(), second);
  } finally { await client.close(); }
  console.log(useRemote
    ? 'Remote HTTPS, authentication, Origin, MCP discovery, API/MCP cross-read and Neon persistence verified. Synthetic data only.'
    : useWorker
    ? 'API/MCP cross-read and real Neon persistence verified through local workerd HTTP. No public Worker.'
    : 'API/MCP cross-read, fresh app instance and real Neon persistence verified from Node. No public Worker.');
});

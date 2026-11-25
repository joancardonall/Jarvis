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
    assert.equal((await client.listTools()).tools.length, 13);
    assert.deepEqual((await client.callTool({ name: 'jarvis.get_project', arguments: { project_id: first.id } })).structuredContent, first);
    const result = await client.callTool({ name: 'jarvis.create_project', arguments: {
      name: 'Synthetic Neon MCP proof', idempotency_key: 'jarvis-neon-mcp-proof',
    } });
    assert.ok(!result.isError);
    const second = result.structuredContent;
    const fresh = await send(new Request(`${base}/api/v1/projects/${second.id}`, { headers }));
    assert.equal(fresh.status, 200);
    assert.deepEqual(await fresh.json(), second);

    // Tasks, notes, overview and summary through the real Neon HTTP driver. Stable idempotency
    // keys make this proof repeatable: running it again finds the same synthetic rows.
    const tool = async (name, args) => {
      const outcome = await client.callTool({ name: `jarvis.${name}`, arguments: args });
      assert.ok(!outcome.isError, `${name}: ${outcome.content?.[0]?.text}`);
      return outcome.structuredContent;
    };
    assert.ok((await tool('list_projects', { query: 'Synthetic Neon API proof' })).projects.some(project => project.id === first.id));
    const task = await tool('create_task', { title: 'Synthetic Neon task proof', project_id: first.id,
      due_date: '2030-01-15', idempotency_key: 'jarvis-neon-task-proof' });
    assert.equal(task.due_date, '2030-01-15');
    assert.equal((await tool('update_task', { task_id: task.id, priority: 'high', status: 'open' })).priority, 'high');
    const note = await tool('save_note', { kind: 'decision', content: 'Synthetic Neon note proof', project_id: first.id,
      source: 'verify-neon', idempotency_key: 'jarvis-neon-note-proof' });
    assert.ok((await tool('search_notes', { query: 'neon note proof' })).notes.some(found => found.id === note.id));
    const overview = await tool('get_project_overview', { project_id: first.id });
    assert.ok(overview.open_tasks.some(found => found.id === task.id));
    assert.ok(overview.notes.some(found => found.id === note.id));
    assert.ok((await tool('get_daily_summary', { date: '2030-01-15' })).due_today.some(found => found.id === task.id));
    assert.equal((await tool('update_project', { project_id: first.id, priority: 'normal' })).id, first.id);
    const listed = await send(new Request(`${base}/api/v1/tasks?project_id=${first.id}`, { headers }));
    assert.equal(listed.status, 200);
    assert.ok((await listed.json()).tasks.some(found => found.id === task.id));
  } finally { await client.close(); }
  console.log(useRemote
    ? 'Remote HTTPS, authentication, Origin, MCP discovery, API/MCP cross-read and Neon persistence verified. Synthetic data only.'
    : useWorker
    ? 'API/MCP cross-read and real Neon persistence verified through local workerd HTTP. No public Worker.'
    : 'API/MCP cross-read, fresh app instance and real Neon persistence verified from Node. No public Worker.');
});

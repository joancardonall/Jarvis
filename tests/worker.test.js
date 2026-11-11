import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { token, ownerA } from './helpers.js';
import { digest } from '../src/projects.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

test('workerd runtime: health, auth and official MCP discovery over real HTTP', { timeout: 30000 }, async () => {
  const base = 'http://127.0.0.1:18787';
  const worker = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--local', '--ip', '127.0.0.1', '--port', '18787',
    '--var', `DEV_TOKEN_SHA256:${await digest(token)}`, '--var', `DEV_OWNER_ID:${ownerA}`,
    '--var', `DEV_TOKEN_EXPIRES_AT:${new Date(Date.now() + 3600000).toISOString()}`,
    '--var', 'DATABASE_URL:postgresql://synthetic:synthetic@127.0.0.1:1/jarvis_test'], {
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  worker.stdout.on('data', chunk => { output += chunk; });
  worker.stderr.on('data', chunk => { output += chunk; });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      if (worker.exitCode !== null) throw new Error(`Worker exited: ${output}`);
      try { ready = (await fetch(`${base}/health`)).ok; }
      catch { /* process still starting */ }
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    assert.ok(ready, output);
    assert.equal((await fetch(`${base}/mcp`)).status, 401);
    assert.equal((await fetch(`${base}/mcp`, { headers: { Origin: 'https://evil.example' } })).status, 403);
    const client = new Client({ name: 'jarvis-runtime-test', version: '1.0.0' });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
      }));
      assert.equal((await client.listTools()).tools.length, 2);
    } finally { await client.close(); }
  } finally {
    if (worker.exitCode === null) {
      const stopped = once(worker, 'exit');
      worker.kill('SIGTERM');
      await stopped;
    }
  }
});

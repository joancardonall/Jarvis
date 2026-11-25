import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { token, ownerA, oauthEnv } from './helpers.js';
import { digest } from '../src/projects.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

test('workerd runtime: health, auth and official MCP discovery over real HTTP', { timeout: 30000 }, async () => {
  const base = 'http://127.0.0.1:18787';
  const worker = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--local', '--ip', '127.0.0.1', '--port', '18787',
    '--var', `DEV_TOKEN_SHA256:${await digest(token)}`, '--var', `DEV_OWNER_ID:${ownerA}`,
    '--var', `DEV_TOKEN_EXPIRES_AT:${new Date(Date.now() + 3600000).toISOString()}`,
    '--var', 'DATABASE_URL:postgresql://synthetic:synthetic@127.0.0.1:1/jarvis_test',
    ...Object.entries(oauthEnv).flatMap(([name, value]) => ['--var', `${name}:${value}`])], {
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
    const denied = await fetch(`${base}/mcp`);
    assert.equal(denied.status, 401);
    assert.match(denied.headers.get('WWW-Authenticate'), /resource_metadata="http:\/\/127\.0\.0\.1:18787\/\.well-known\/oauth-protected-resource"/);
    // OAuth cryptography (HMAC, SHA-256, random values) running inside the real Workers runtime.
    assert.equal((await (await fetch(`${base}/.well-known/oauth-protected-resource/mcp`)).json()).resource, `${base}/mcp`);
    assert.equal((await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json()).token_endpoint, `${base}/oauth/token`);
    const registration = await fetch(`${base}/oauth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_name: 'Runtime test', redirect_uris: ['http://localhost:3118/callback'] }) });
    assert.equal(registration.status, 201);
    const { client_id: clientId } = await registration.json();
    const consent = await fetch(`${base}/oauth/authorize?` + new URLSearchParams({ response_type: 'code', client_id: clientId,
      redirect_uri: 'http://localhost:3118/callback', code_challenge: 'c'.repeat(43), code_challenge_method: 'S256' }));
    assert.equal(consent.status, 200);
    assert.match(await consent.text(), /Continuar amb GitHub/);
    const forged = await fetch(`${base}/mcp`, { headers: { Authorization: `Bearer jvs_at_${'A'.repeat(43)}.${'B'.repeat(43)}` } });
    assert.equal(forged.status, 401);
    assert.equal((await fetch(`${base}/mcp`, { headers: { Origin: 'https://evil.example' } })).status, 403);
    const client = new Client({ name: 'jarvis-runtime-test', version: '1.0.0' });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
      }));
      assert.equal((await client.listTools()).tools.length, 19);
    } finally { await client.close(); }
  } finally {
    if (worker.exitCode === null) {
      const stopped = once(worker, 'exit');
      worker.kill('SIGTERM');
      await stopped;
    }
  }
});

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

export { memoryRepository } from './memory-repository.js';

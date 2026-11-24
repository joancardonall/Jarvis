import { authenticate } from './auth.js';
import { AppError, publicError } from './errors.js';
import { createProjectService } from './projects.js';
import { neonRepository } from './repository.js';
import { handleMcp } from './mcp.js';
import { handleOAuth, isConsentSubmission, resourceMetadataUrl } from './oauth.js';

const json = (body, status = 200) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
});

// Reads the body with a hard size limit and the expected media type.
async function readBody(request, mediaType) {
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== mediaType) {
    throw new AppError(415, 'unsupported_media_type');
  }
  const reader = request.body?.getReader();
  let size = 0;
  const chunks = [];
  if (reader) {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16384) {
        await reader.cancel();
        throw new AppError(413, 'request_too_large');
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}

async function readJson(request) {
  const text = await readBody(request, 'application/json');
  try { return JSON.parse(text); }
  catch { throw new AppError(400, 'invalid_json'); }
}

const readForm = async request => new URLSearchParams(await readBody(request, 'application/x-www-form-urlencoded'));

// Dependency injection is used only by tests; production always uses Neon, real time and real fetch.
export function createApp(repositoryFactory = env => neonRepository(env.DATABASE_URL),
  { fetchUpstream = (...args) => fetch(...args), clock = Date.now } = {}) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      try {
        if (url.pathname === '/health' && request.method === 'GET') return json({ status: 'ok' });
        const origin = request.headers.get('Origin');
        // The consent form is the only browser request accepted, and only from this server's own page.
        const ownForm = isConsentSubmission(request, url) && origin === url.origin;
        if (origin && origin !== env.ALLOWED_ORIGIN && !ownForm) throw new AppError(403, 'origin_forbidden');
        // Plain HTTP is accepted only on loopback for local development.
        if (url.protocol !== 'https:' && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
          throw new AppError(400, 'https_required');
        }
        const now = clock();
        // Created on first use: requests rejected earlier never open a database connection.
        let cached;
        const repository = () => cached ??= repositoryFactory(env);
        const oauthResponse = await handleOAuth(request, url, env, { repository, fetchUpstream, now, readJson, readForm });
        if (oauthResponse) return oauthResponse;
        const owner = await authenticate(request, env, { repository, now });
        const service = createProjectService(repository());
        if (url.pathname === '/mcp') {
          // Bound the body before handing parsed JSON back through the official transport.
          let incoming = request;
          if (request.method === 'POST') {
            const body = await readJson(request);
            incoming = new Request(request.url, { method: 'POST', headers: request.headers,
              body: JSON.stringify(body) });
          }
          const response = await handleMcp(incoming, service, owner);
          const headers = new Headers(response.headers);
          headers.set('Cache-Control', 'no-store');
          return new Response(response.body, { status: response.status, headers });
        }
        if (url.pathname === '/api/v1/projects' && request.method === 'POST') {
          const body = await readJson(request);
          if (body === null || typeof body !== 'object' || Array.isArray(body) || 'idempotency_key' in body) {
            throw new AppError(422, 'invalid_project');
          }
          const key = request.headers.get('Idempotency-Key');
          const project = await service.create(owner, { ...body, ...(key === null ? {} : { idempotency_key: key }) });
          return json(project, 201);
        }
        const match = /^\/api\/v1\/projects\/([^/]+)$/.exec(url.pathname);
        if (match && request.method === 'GET') return json(await service.get(owner, { project_id: match[1] }));
        throw new AppError(404, 'route_not_found');
      } catch (error) {
        const safe = publicError(error);
        const response = json({ error: safe.code }, safe.status);
        // Tells OAuth clients such as Claude where to discover how to log in (RFC 9728).
        if (safe.status === 401) response.headers.set('WWW-Authenticate',
          `Bearer realm="jarvis", resource_metadata="${resourceMetadataUrl(url.origin)}"`);
        return response;
      }
    },
  };
}
export default createApp();

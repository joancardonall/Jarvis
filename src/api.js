import { AppError } from './errors.js';

// HTTP adapter for the domain services: the same operations the MCP tools expose.
// Returns a [body, status] pair, or throws 404 when no route matches.

function objectBody(body, code) {
  if (body === null || typeof body !== 'object' || Array.isArray(body) || 'idempotency_key' in body) {
    throw new AppError(422, code);
  }
  return body;
}

// Query strings are text; listed numeric and boolean filters are converted before validation.
function filters(url, { numbers = ['limit'], booleans = [] } = {}) {
  const input = {};
  for (const [name, value] of url.searchParams) {
    if (numbers.includes(name)) input[name] = /^[0-9]{1,4}$/.test(value) ? Number(value) : value;
    else if (booleans.includes(name)) input[name] = value === 'true' ? true : value === 'false' ? false : value;
    else input[name] = value;
  }
  return input;
}

export async function handleApi(request, url, { services, owner, readJson, sendSummary }) {
  const { projects, tasks, notes, summary } = services;
  const [, collection, id, action, ...rest] = url.pathname.slice('/api/v1'.length).split('/');
  if (!url.pathname.startsWith('/api/v1/') || rest.length) throw new AppError(404, 'route_not_found');
  // "daily-summary/send" is an action on a collection without ids; everything else is "<collection>/<id>[/<action>]".
  const hasId = id && collection !== 'daily-summary';
  const route = `${request.method} ${collection}${hasId ? '/:id' : id ? `/${id}` : ''}${action ? `/${action}` : ''}`;
  // The idempotency key travels in a header, never in the JSON body.
  const creation = async code => {
    const body = objectBody(await readJson(request), code);
    const key = request.headers.get('Idempotency-Key');
    return { ...body, ...(key === null ? {} : { idempotency_key: key }) };
  };
  const change = async (code, name) => ({ ...objectBody(await readJson(request), code), [name]: id });

  switch (route) {
    case 'POST projects': return [await projects.create(owner, await creation('invalid_project')), 201];
    case 'GET projects': return [await projects.list(owner, filters(url))];
    case 'GET projects/:id': return [await projects.get(owner, { project_id: id })];
    case 'PATCH projects/:id': return [await projects.update(owner, await change('invalid_project_update', 'project_id'))];
    case 'GET projects/:id/overview': return [await services.overview(owner, { project_id: id })];
    case 'POST tasks': return [await tasks.create(owner, await creation('invalid_task')), 201];
    case 'GET tasks': return [await tasks.list(owner, filters(url))];
    case 'PATCH tasks/:id': return [await tasks.update(owner, await change('invalid_task_update', 'task_id'))];
    case 'POST notes': return [await notes.create(owner, await creation('invalid_note')), 201];
    case 'GET notes': return [await notes.search(owner, filters(url, { booleans: ['include_inactive'] }))];
    case 'PATCH notes/:id': return [await notes.update(owner, await change('invalid_note_update', 'note_id'))];
    case 'GET daily-summary': return [await summary.daily(owner, filters(url))];
    case 'POST daily-summary/send': return [await sendSummary(owner)];
    default: throw new AppError(404, 'route_not_found');
  }
}

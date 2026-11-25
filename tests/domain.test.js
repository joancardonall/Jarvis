import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, memoryRepository, ownerA, ownerB } from './helpers.js';
import { exerciseDomainStorage } from './domain-storage.js';
import { madridDate, addDays } from '../src/validation.js';
import { madridHour, runScheduledSummary } from '../src/telegram.js';
import { createServices } from '../src/services.js';

// In-memory storage and simulated Telegram: these tests prove Jarvis' rules, not the providers.
const json = async response => ({ status: response.status, body: await response.json() });
const call = async (client, name, args = {}) => {
  const result = await client.callTool({ name: `jarvis.${name}`, arguments: args });
  return result.isError ? { error: result.content[0].text } : result.structuredContent;
};
const patch = (api, path, body) => api.request(path, { method: 'PATCH', body });

test('in-memory storage simulator follows the shared domain scenario', async () => {
  const repository = memoryRepository();
  const createProject = (owner, name, description) => repository.create({ id: crypto.randomUUID(), owner_id: owner,
    name, description, idempotency_key: null, request_hash: 'a'.repeat(64) });
  await exerciseDomainStorage(repository, createProject, ownerA, ownerB);
});

test('a new conversation can find, resume and change a project without knowing any id', async () => {
  const repository = memoryRepository();
  const api = await setup(repository);
  const first = await api.connect();
  let bikeId;
  try {
    assert.equal((await first.listTools()).tools.length, 13);
    const bike = await call(first, 'create_project', { name: 'Muntar la bici', description: 'Comparar rodes i transmissió' });
    bikeId = bike.id;
    assert.equal(bike.priority, 'normal');
    await call(first, 'create_project', { name: 'Candidatures' });
    const task = await call(first, 'create_task', { title: 'Comparar rodes', project_id: bike.id, due_date: '2030-03-20', priority: 'high' });
    assert.equal(task.status, 'open');
    assert.equal(task.due_date, '2030-03-20');
    await call(first, 'save_note', { kind: 'decision', content: 'Transmissió de 11 velocitats', project_id: bike.id, source: 'xat 2030-03-01' });
    await call(first, 'save_note', { kind: 'open_question', content: 'Frens de disc o de llanda?', project_id: bike.id });
  } finally { await first.close(); }

  // Second conversation: nothing is remembered by the model, everything comes from Jarvis.
  const second = await (await setup(repository)).connect();
  try {
    const found = await call(second, 'list_projects', { query: 'bici' });
    assert.equal(found.projects.length, 1);
    assert.equal(found.projects[0].id, bikeId);
    assert.equal(found.truncated, false);
    const overview = await call(second, 'get_project_overview', { project_id: bikeId });
    assert.equal(overview.project.name, 'Muntar la bici');
    assert.deepEqual(overview.open_tasks.map(task => task.title), ['Comparar rodes']);
    assert.deepEqual(overview.notes.map(note => note.kind).sort(), ['decision', 'open_question']);
    assert.equal(overview.notes.find(note => note.kind === 'decision').source, 'xat 2030-03-01');
    const decisions = await call(second, 'search_notes', { query: 'transmissió', kind: 'decision' });
    assert.equal(decisions.notes.length, 1);

    // "Park the bike until January and prioritise applications" (UC-09).
    const paused = await call(second, 'update_project', { project_id: bikeId, status: 'paused', review_at: '2031-01-10' });
    assert.equal(paused.status, 'paused');
    assert.equal(paused.review_at, '2031-01-10');
    const resumed = await call(second, 'update_project', { project_id: bikeId, status: 'active' });
    assert.equal(resumed.review_at, null); // a review date only applies while paused
    const done = await call(second, 'update_task', { task_id: overview.open_tasks[0].id, status: 'done' });
    assert.ok(done.completed_at);
    assert.deepEqual((await call(second, 'list_tasks')).tasks, []);
    assert.equal((await call(second, 'list_tasks', { status: 'all' })).tasks.length, 1);
    // "Forget X" (UC-10): hidden, not deleted.
    const noteId = decisions.notes[0].id;
    assert.equal((await call(second, 'update_note', { note_id: noteId, status: 'inactive' })).status, 'inactive');
    assert.equal((await call(second, 'search_notes', { query: 'transmissió' })).notes.length, 0);
    assert.equal((await call(second, 'search_notes', { query: 'transmissió', include_inactive: true })).notes.length, 1);
  } finally { await second.close(); }

  // The HTTP API sees the same data and never exposes owner or idempotency internals.
  const listed = await json(await api.request('/api/v1/projects?query=bici&limit=5'));
  assert.equal(listed.status, 200);
  assert.equal(listed.body.projects[0].id, bikeId);
  assert.equal('owner_id' in listed.body.projects[0], false);
  assert.equal('request_hash' in listed.body.projects[0], false);
  const overview = await json(await api.request(`/api/v1/projects/${bikeId}/overview`));
  assert.equal(overview.body.notes.length, 1);
  assert.equal('owner_id' in overview.body.notes[0], false);
  const tasks = await json(await api.request('/api/v1/tasks?status=all'));
  assert.equal(tasks.body.tasks[0].status, 'done');
  assert.equal('request_hash' in tasks.body.tasks[0], false);
  assert.equal((await json(await api.request('/api/v1/notes?include_inactive=true'))).body.notes.length, 2);
});

test('HTTP API: creation with idempotency header, partial updates and status codes', async () => {
  const api = await setup(memoryRepository());
  const project = (await json(await api.request('/api/v1/projects', { body: { name: 'Synthetic' } }))).body;
  const headers = { 'Idempotency-Key': 'task-1' };
  const body = { title: 'Synthetic task', project_id: project.id, due_date: '2030-05-01' };
  const created = await json(await api.request('/api/v1/tasks', { body, headers }));
  assert.equal(created.status, 201);
  assert.equal((await json(await api.request('/api/v1/tasks', { body, headers }))).body.id, created.body.id);
  assert.equal((await api.request('/api/v1/tasks', { body: { ...body, title: 'Changed' }, headers })).status, 409);
  assert.equal((await api.request('/api/v1/tasks', { body: { ...body, idempotency_key: 'in-body' } })).status, 422);
  const cleared = await json(await patch(api, `/api/v1/tasks/${created.body.id}`, { due_date: null, priority: 'low' }));
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.due_date, null);
  assert.equal(cleared.body.title, 'Synthetic task');
  assert.equal(cleared.body.project_id, project.id);

  const note = await json(await api.request('/api/v1/notes', { body: { kind: 'fact', content: 'Synthetic fact' }, headers: { 'Idempotency-Key': 'note-1' } }));
  assert.equal(note.status, 201);
  assert.equal((await api.request('/api/v1/notes', { body: { kind: 'fact', content: 'Other' }, headers: { 'Idempotency-Key': 'note-1' } })).status, 409);
  assert.equal((await json(await patch(api, `/api/v1/notes/${note.body.id}`, { status: 'inactive' }))).body.status, 'inactive');
  assert.equal((await json(await patch(api, `/api/v1/projects/${project.id}`, { priority: 'high' }))).body.priority, 'high');
  assert.equal((await json(await api.request('/api/v1/daily-summary?date=2030-05-01'))).body.date, '2030-05-01');

  const missing = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  for (const [response, status, code] of [
    [await patch(api, `/api/v1/tasks/${missing}`, { title: 'x' }), 404, 'task_not_found'],
    [await patch(api, `/api/v1/notes/${missing}`, { content: 'x' }), 404, 'note_not_found'],
    [await patch(api, `/api/v1/projects/${missing}`, { name: 'x' }), 404, 'project_not_found'],
    [await api.request(`/api/v1/projects/${missing}/overview`), 404, 'project_not_found'],
    [await api.request('/api/v1/tasks', { body: { title: 'x', project_id: missing } }), 404, 'project_not_found'],
    [await patch(api, `/api/v1/tasks/${created.body.id}`, { project_id: missing }), 404, 'project_not_found'],
    [await patch(api, `/api/v1/tasks/${created.body.id}`, {}), 422, 'invalid_task_update'],
    [await patch(api, '/api/v1/tasks/not-a-uuid', { title: 'x' }), 422, 'invalid_task_update'],
    [await patch(api, `/api/v1/tasks/${created.body.id}`, { owner_id: ownerB }), 422, 'invalid_task_update'],
    [await patch(api, `/api/v1/projects/${project.id}`, { status: 'deleted' }), 422, 'invalid_project_update'],
    [await api.request('/api/v1/projects?limit=0'), 422, 'invalid_project_filter'],
    [await api.request('/api/v1/projects?limit=201'), 422, 'invalid_project_filter'],
    [await api.request('/api/v1/projects?owner_id=' + ownerB), 422, 'invalid_project_filter'],
    [await api.request('/api/v1/tasks?status=pending'), 422, 'invalid_task_filter'],
    [await api.request('/api/v1/notes?include_inactive=maybe'), 422, 'invalid_note_filter'],
    [await api.request('/api/v1/daily-summary?date=tomorrow'), 422, 'invalid_summary_date'],
    [await api.request('/api/v1/tasks/extra/path/segments'), 404, 'route_not_found'],
    [await api.request('/api/v1/unknown'), 404, 'route_not_found'],
    [await api.request(`/api/v1/tasks/${created.body.id}`, { method: 'DELETE' }), 404, 'route_not_found'],
    [await api.request('/api/v1/tasks', { body: [] }), 422, 'invalid_task'],
    [await api.request('/api/v1/daily-summary/send', { method: 'POST' }), 503, 'telegram_not_configured'],
  ]) {
    const result = await json(response);
    assert.deepEqual([result.status, result.body.error], [status, code]);
  }
  for (const path of ['/api/v1/projects', '/api/v1/tasks', '/api/v1/notes', '/api/v1/daily-summary']) {
    assert.equal((await api.request(path, { headers: { Authorization: '' } })).status, 401);
  }
});

test('dates are real calendar days; inputs are bounded and strict', async () => {
  const api = await setup(memoryRepository());
  const client = await api.connect();
  try {
    for (const due_date of ['2030-02-30', '2030-13-01', '2030-1-5', '20300105', '2030-01-05T10:00:00Z', 'demà', '']) {
      assert.ok((await client.callTool({ name: 'jarvis.create_task', arguments: { title: 'x', due_date } })).isError, due_date);
    }
    assert.equal((await call(client, 'create_task', { title: 'Leap day', due_date: '2032-02-29' })).due_date, '2032-02-29');
    for (const [name, args] of [
      ['create_task', { title: '   ' }], ['create_task', { title: 'x'.repeat(301) }], ['create_task', { title: 'x', priority: 'urgent' }],
      ['create_task', { title: 'x', status: 'done' }], ['create_task', { title: 'x', owner_id: ownerB }],
      ['save_note', { kind: 'secret', content: 'x' }], ['save_note', { kind: 'note', content: '' }],
      ['save_note', { kind: 'note', content: 'x'.repeat(4001) }], ['list_tasks', { limit: 1000 }],
      ['update_project', { project_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }],
      ['update_note', { note_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', status: 'deleted' }],
    ]) {
      assert.ok((await client.callTool({ name: `jarvis.${name}`, arguments: args })).isError, `${name} ${JSON.stringify(args).slice(0, 40)}`);
    }
    assert.equal(api.app && (await call(client, 'list_tasks', { status: 'all' })).tasks.length, 1);
  } finally { await client.close(); }
});

test('owners never see or change each other\'s projects, tasks or notes', async () => {
  const repository = memoryRepository();
  const a = await (await setup(repository)).connect();
  const b = await (await setup(repository, ownerB)).connect();
  try {
    const project = await call(a, 'create_project', { name: 'Private A' });
    const task = await call(a, 'create_task', { title: 'Private task', project_id: project.id, due_date: '2030-01-05' });
    const note = await call(a, 'save_note', { kind: 'fact', content: 'Private fact', project_id: project.id });
    assert.deepEqual((await call(b, 'list_projects')).projects, []);
    assert.deepEqual((await call(b, 'list_tasks', { status: 'all' })).tasks, []);
    assert.deepEqual((await call(b, 'search_notes', { query: 'Private' })).notes, []);
    assert.equal((await call(b, 'get_daily_summary', { date: '2030-01-05' })).is_empty, true);
    for (const [name, args, code] of [
      ['get_project_overview', { project_id: project.id }, 'project_not_found'],
      ['update_project', { project_id: project.id, name: 'Taken' }, 'project_not_found'],
      ['update_task', { task_id: task.id, status: 'done' }, 'task_not_found'],
      ['update_note', { note_id: note.id, status: 'inactive' }, 'note_not_found'],
      ['create_task', { title: 'Injected', project_id: project.id }, 'project_not_found'],
      ['save_note', { kind: 'note', content: 'Injected', project_id: project.id }, 'project_not_found'],
    ]) assert.deepEqual(await call(b, name, args), { error: code });
    // B's own task cannot be moved into A's project.
    const own = await call(b, 'create_task', { title: 'B task' });
    assert.deepEqual(await call(b, 'update_task', { task_id: own.id, project_id: project.id }), { error: 'project_not_found' });
    assert.equal((await call(a, 'get_project_overview', { project_id: project.id })).open_tasks.length, 1);
    assert.equal((await call(a, 'get_project', { project_id: project.id })).name, 'Private A');
  } finally { await a.close(); await b.close(); }
});

test('daily summary: Madrid calendar day, due buckets and transparent follow-up rules', async () => {
  // 23:30 UTC on 9 January is already 10 January in Madrid.
  let now = Date.parse('2030-01-09T23:30:00Z');
  assert.equal(madridDate(now), '2030-01-10');
  assert.equal(madridDate(Date.parse('2030-07-09T21:59:00Z')), '2030-07-09');
  assert.equal(madridDate(Date.parse('2030-07-09T22:00:00Z')), '2030-07-10'); // summer time: UTC+2
  assert.equal(addDays('2030-12-28', 7), '2031-01-04');
  const texts = await Promise.all(['2030-04-01', '2030-08-11', '2030-10-05'].map(async date =>
    (await createServices(memoryRepository(), () => now).summary.daily(ownerA, { date })).text.split('\n')[0]));
  assert.deepEqual(texts, ['Resum de Jarvis — dilluns, 1 d’abril', 'Resum de Jarvis — diumenge, 11 d’agost',
    'Resum de Jarvis — dissabte, 5 d’octubre']);
  const repository = memoryRepository();
  const services = createServices(repository, () => now);
  const project = async (name, changes, idleDays = 0) => {
    const created = await services.projects.create(ownerA, { name });
    const row = repository.rows.get(created.id);
    if (changes) Object.assign(row, changes);
    row.last_activity_at = new Date(now - idleDays * 86400000);
    return created;
  };
  const empty = await services.summary.daily(ownerA);
  assert.equal(empty.is_empty, true);
  assert.match(empty.text, /Res pendent per avui/);

  const bike = await project('Bici', null, 1);
  for (const [title, due_date, extra] of [['Vençuda', '2030-01-08', { project_id: bike.id }], ['Avui', '2030-01-10'],
    ['Setmana', '2030-01-17'], ['Massa lluny', '2030-01-18'], ['Sense data', undefined], ['Feta', '2030-01-09']]) {
    const created = await services.tasks.create(ownerA, { title, ...(due_date ? { due_date } : {}), ...extra });
    if (title === 'Feta') await services.tasks.update(ownerA, { task_id: created.id, status: 'done' });
  }
  repository.rows.get(bike.id).last_activity_at = new Date(now - 86400000);
  let summary = await services.summary.daily(ownerA);
  assert.equal(summary.date, '2030-01-10');
  assert.equal(summary.time_zone, 'Europe/Madrid');
  assert.deepEqual(summary.overdue.map(task => [task.title, task.project_name]), [['Vençuda', 'Bici']]);
  assert.deepEqual(summary.due_today.map(task => task.title), ['Avui']);
  assert.deepEqual(summary.due_this_week.map(task => task.title), ['Setmana']);
  assert.deepEqual(summary.follow_ups, []);
  assert.match(summary.text, /^Resum de Jarvis — dijous, 10 de gener\n\nVençudes\n• Vençuda \(Bici\) — 2030-01-08\n\nPer avui\n• Avui\n\nPropers 7 dies\n• Setmana — 2030-01-17$/);

  // Follow-ups: review due first, then pending decisions, then inactivity (threshold by priority).
  const waiting = await project('Pausat amb revisió', { status: 'paused', review_at: '2030-01-10' }, 40);
  await project('Pausat sense revisió', { status: 'paused' }, 400);
  await project('Pausat revisió futura', { status: 'paused', review_at: '2030-01-11' }, 400);
  await project('Completat', { status: 'completed' }, 400);
  await project('Arxivat', { status: 'archived' }, 400);
  await project('Posposat', { snoozed_until: '2030-01-11' }, 400);
  await project('Prioritat alta 3 dies', { priority: 'high' }, 3);
  await project('Normal 6 dies', null, 6);
  await project('Baixa 13 dies', { priority: 'low' }, 13);
  const question = await project('Amb decisió pendent', null, 0);
  await services.notes.create(ownerA, { kind: 'open_question', content: 'Quin proveïdor triem?', project_id: question.id });
  summary = await services.summary.daily(ownerA);
  assert.deepEqual(summary.follow_ups.map(item => [item.project_name, item.reason]), [
    ['Pausat amb revisió', 'review_due'], ['Amb decisió pendent', 'pending_decision'], ['Prioritat alta 3 dies', 'inactive']]);
  assert.equal(summary.follow_ups[1].detail, 'Quin proveïdor triem?');
  assert.equal(summary.follow_ups[0].project_id, waiting.id);
  assert.match(summary.text, /Seguiment de projectes\n• Pausat amb revisió: Revisió prevista el 2030-01-10\n• Amb decisió pendent: Quin proveïdor triem\?\n• Prioritat alta 3 dies: 3 dies sense activitat$/);

  // The next day the snooze ends and thresholds are reached; still three at most.
  now += 86400000;
  summary = await services.summary.daily(ownerA);
  assert.equal(summary.follow_ups.length, 3);
  assert.equal(summary.due_today.length, 0);
  assert.deepEqual(summary.overdue.map(task => task.title), ['Vençuda', 'Avui']);
  // "Don't remind me until..." through the service clears a follow-up.
  await services.projects.update(ownerA, { project_id: waiting.id, snoozed_until: '2030-02-01' });
  assert.equal((await services.summary.daily(ownerA)).follow_ups.some(item => item.project_id === waiting.id), false);
  // Resolving the question removes that reason; the edit itself counts as activity.
  const noteId = repository.notes[0].id;
  await services.notes.update(ownerA, { note_id: noteId, kind: 'decision' });
  assert.equal((await services.summary.daily(ownerA)).follow_ups.some(item => item.project_id === question.id), false);
});

test('long summaries stay short', async () => {
  const now = Date.parse('2030-01-10T08:00:00Z');
  const services = createServices(memoryRepository(), () => now);
  for (let index = 0; index < 14; index++) await services.tasks.create(ownerA, { title: `Tasca ${index}`, due_date: '2030-01-10' });
  const summary = await services.summary.daily(ownerA);
  assert.equal(summary.due_today.length, 14);
  assert.equal(summary.text.split('\n').filter(line => line.startsWith('• ')).length, 10);
  assert.match(summary.text, /… i 4 més/);
});

function telegram({ ok = true, fail = false } = {}) {
  const calls = [];
  return { calls, fetchUpstream: async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    if (fail) throw new Error('network detail with SECRET');
    return Response.json({ ok }, { status: ok ? 200 : 401 });
  } };
}
const telegramEnv = { TELEGRAM_BOT_TOKEN: '123456789:fictitious-telegram-token-for-tests-only', TELEGRAM_CHAT_ID: '987654321',
  DEV_OWNER_ID: ownerA };
// These tests run with a clock in 2030, so the fixed development token must not have expired by then.
const futureEnv = { ...telegramEnv, DEV_TOKEN_EXPIRES_AT: '2040-01-01T00:00:00Z' };

test('scheduled summary: one Telegram message per day at most, retries only after failure', async () => {
  assert.equal(madridHour(Date.parse('2030-01-10T06:30:00Z')), 7); // winter: UTC+1
  assert.equal(madridHour(Date.parse('2030-07-10T05:30:00Z')), 7); // summer: UTC+2
  let now = Date.parse('2030-01-10T05:30:00Z');
  const repository = memoryRepository();
  const services = createServices(repository, () => now);
  const run = (bot, env = telegramEnv) => runScheduledSummary(env, repository, services.summary, { fetchUpstream: bot.fetchUpstream, now });
  await services.tasks.create(ownerA, { title: 'Lliurar pràctica <b>SO</b>', due_date: '2030-01-10' });

  let bot = telegram();
  for (const env of [{ ...telegramEnv, TELEGRAM_BOT_TOKEN: undefined }, { ...telegramEnv, TELEGRAM_CHAT_ID: 'not-a-number' },
    { ...telegramEnv, TELEGRAM_BOT_TOKEN: 'short' }, { ...telegramEnv, DEV_OWNER_ID: undefined }]) {
    assert.equal(await run(bot, env), 'not_configured');
  }
  assert.equal(await run(bot), 'too_early'); // 06:30 in Madrid
  assert.equal(bot.calls.length, 0);
  assert.equal(repository.summaries.size, 0);

  now = Date.parse('2030-01-10T06:30:00Z'); // 07:30 in Madrid
  const down = telegram({ fail: true });
  assert.equal(await run(down), 'failed');
  const refused = telegram({ ok: false });
  now += 3600000;
  assert.equal(await run(refused), 'failed');
  now += 3600000;
  assert.equal(await run(bot), 'sent'); // third and last attempt
  assert.equal(await run(bot), 'already_handled');
  assert.equal(bot.calls.length, 1);
  assert.equal(bot.calls[0].url, `https://api.telegram.org/bot${telegramEnv.TELEGRAM_BOT_TOKEN}/sendMessage`);
  // Plain text: stored content can never become formatting, links or commands.
  assert.deepEqual(Object.keys(bot.calls[0].body).sort(), ['chat_id', 'disable_web_page_preview', 'text']);
  assert.equal(bot.calls[0].body.chat_id, '987654321');
  assert.match(bot.calls[0].body.text, /Per avui\n• Lliurar pràctica <b>SO<\/b>/);
  assert.equal(bot.calls[0].body.text.includes(telegramEnv.TELEGRAM_BOT_TOKEN), false);

  // Custom hour, and three failures in one morning stop further attempts.
  now = Date.parse('2030-01-11T08:30:00Z');
  bot = telegram();
  assert.equal(await run(bot, { ...telegramEnv, SUMMARY_HOUR: '10' }), 'too_early');
  for (let attempt = 0; attempt < 3; attempt++) assert.equal(await run(down), 'failed');
  assert.equal(await run(bot), 'already_handled');
  assert.equal(bot.calls.length, 0);

  // A day with nothing to report sends nothing and is recorded as skipped.
  const quiet = memoryRepository();
  const quietServices = createServices(quiet, () => now);
  assert.equal(await runScheduledSummary(telegramEnv, quiet, quietServices.summary, { fetchUpstream: bot.fetchUpstream, now }), 'skipped');
  assert.equal(await runScheduledSummary(telegramEnv, quiet, quietServices.summary, { fetchUpstream: bot.fetchUpstream, now }), 'already_handled');
  assert.equal(bot.calls.length, 0);

  // A storage failure while building the summary is recorded as failed, not left half-claimed.
  const broken = memoryRepository();
  broken.listTasks = async () => { throw new Error('SECRET_DSN'); };
  await assert.rejects(runScheduledSummary(telegramEnv, broken, createServices(broken, () => now).summary, { fetchUpstream: bot.fetchUpstream, now }));
  assert.equal([...broken.summaries.values()][0].status, 'failed');
});

test('worker cron entry point and on-demand sending', async () => {
  const now = Date.parse('2030-01-10T08:00:00Z');
  const bot = telegram();
  const repository = memoryRepository();
  const api = await setup(repository, ownerA, { github: bot, clock: () => now });
  Object.assign(api.env, futureEnv);
  assert.equal((await api.request('/api/v1/tasks', { body: { title: 'Synthetic task', due_date: '2030-01-10' } })).status, 201);
  assert.equal(await api.app.scheduled({}, api.env), 'sent');
  assert.equal(await api.app.scheduled({}, api.env), 'already_handled');
  assert.equal(await api.app.scheduled({}, {}), 'not_configured');
  // On demand (tool or API): sends now, independent of the daily ledger, even when empty.
  const sent = await json(await api.request('/api/v1/daily-summary/send', { method: 'POST' }));
  assert.deepEqual(sent, { status: 200, body: { sent: true, date: '2030-01-10' } });
  const client = await api.connect();
  try {
    assert.deepEqual(await call(client, 'send_daily_summary'), { sent: true, date: '2030-01-10' });
    assert.equal(bot.calls.length, 3);
    api.env.TELEGRAM_CHAT_ID = '';
    assert.deepEqual(await call(client, 'send_daily_summary'), { error: 'telegram_not_configured' });
  } finally { await client.close(); }
  // Telegram refusing or failing never leaks details and is reported as an upstream error.
  const failing = await setup(memoryRepository(), ownerA, { github: telegram({ fail: true }), clock: () => now });
  Object.assign(failing.env, futureEnv);
  const failed = await failing.request('/api/v1/daily-summary/send', { method: 'POST' });
  assert.equal(failed.status, 502);
  assert.equal(await failed.text(), '{"error":"telegram_failed"}');
  // A database failure inside the cron is contained.
  const broken = await setup({ claimSummary() { throw new Error('SECRET_DSN'); } }, ownerA, { github: bot, clock: () => now });
  Object.assign(broken.env, futureEnv);
  assert.equal(await broken.app.scheduled({}, broken.env), 'failed');
});

test('very long messages are cut to fit Telegram', async () => {
  const { sendTelegram, telegramSettings } = await import('../src/telegram.js');
  const bot = telegram();
  assert.equal(await sendTelegram(telegramSettings(telegramEnv), 'x'.repeat(5000), bot.fetchUpstream), true);
  assert.ok(bot.calls[0].body.text.length <= 3902);
});

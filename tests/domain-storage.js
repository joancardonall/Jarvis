import assert from 'node:assert/strict';

const at = (day, hour = 12) => new Date(Date.UTC(2030, 0, day, hour));
const hash = letter => letter.repeat(64);
const time = value => new Date(value).getTime();
const day = value => (value instanceof Date
  ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  : value && String(value).slice(0, 10));

// One storage scenario for projects, tasks, notes and the summary ledger, executed against the
// in-memory simulator and against real PostgreSQL so that the two cannot drift apart.
// `createProject(owner, name, description)` hides how each storage inserts a project.
export async function exerciseDomainStorage(storage, createProject, owner, stranger) {
  const bike = await createProject(owner, 'Bike build', 'Compare wheels 100%');
  const jobs = await createProject(owner, 'Job search', '');
  const foreign = await createProject(stranger, 'Foreign project', '');

  // Listing: owner isolation, literal search (wildcards are plain text), archived hidden by default.
  const all = await storage.listProjects(owner, { status: null, query: null, limit: 10 });
  assert.deepEqual(all.map(row => row.name).sort(), ['Bike build', 'Job search']);
  assert.equal(all[0].priority, 'normal');
  assert.equal((await storage.listProjects(owner, { status: null, query: 'WHEELS', limit: 10 })).length, 1);
  assert.equal((await storage.listProjects(owner, { status: null, query: '100%', limit: 10 })).length, 1);
  assert.equal((await storage.listProjects(owner, { status: null, query: '%', limit: 10 })).length, 1);
  assert.equal((await storage.listProjects(owner, { status: null, query: '_', limit: 10 })).length, 0);
  assert.equal((await storage.listProjects(owner, { status: null, query: null, limit: 1 })).length, 1);

  // Updating: only given fields change; dates can be set and cleared; foreign projects untouched.
  let updated = await storage.updateProject(owner, bike.id, { status: 'paused', priority: 'high', review_at: '2030-02-01' }, at(2));
  assert.equal(updated.status, 'paused');
  assert.equal(updated.name, 'Bike build');
  assert.equal(day(updated.review_at), '2030-02-01');
  assert.equal(time(updated.last_activity_at), time(at(2)));
  updated = await storage.updateProject(owner, bike.id, { name: 'Bike', review_at: null, snoozed_until: '2030-01-20' }, at(3));
  assert.equal(updated.review_at, null);
  assert.equal(day(updated.snoozed_until), '2030-01-20');
  assert.equal(updated.priority, 'high');
  assert.equal(await storage.updateProject(owner, foreign.id, { name: 'Stolen' }, at(3)), undefined);
  assert.equal(await storage.updateProject(stranger, bike.id, { name: 'Stolen' }, at(3)), undefined);
  await storage.updateProject(owner, jobs.id, { status: 'archived' }, at(3));
  assert.deepEqual((await storage.listProjects(owner, { status: null, query: null, limit: 10 })).map(row => row.name), ['Bike']);
  assert.deepEqual((await storage.listProjects(owner, { status: 'archived', query: null, limit: 10 })).map(row => row.name), ['Job search']);
  // Most recently active first.
  await storage.updateProject(owner, jobs.id, { status: 'active' }, at(4));
  assert.deepEqual((await storage.listProjects(owner, { status: null, query: null, limit: 10 })).map(row => row.name), ['Job search', 'Bike']);

  // Tasks: project ownership, idempotent replay, activity on the project.
  const task = (fields, key = null) => ({ id: crypto.randomUUID(), owner_id: owner, project_id: null, title: 'Task',
    notes: '', priority: 'normal', due_date: null, idempotency_key: key, request_hash: hash('a'), ...fields });
  assert.equal(await storage.createTask(task({ project_id: foreign.id }), at(5)), undefined);
  assert.equal(await storage.createTask(task({ project_id: crypto.randomUUID() }), at(5)), undefined);
  const wheels = await storage.createTask(task({ project_id: bike.id, title: 'Choose wheels', due_date: '2030-01-10', priority: 'high' }, 'k1'), at(5));
  assert.equal(wheels.status, 'open');
  assert.equal(wheels.completed_at, null);
  assert.equal(day(wheels.due_date), '2030-01-10');
  assert.equal(time((await storage.get(owner, bike.id)).last_activity_at), time(at(5)));
  const replay = await storage.createTask(task({ project_id: bike.id, title: 'Different', request_hash: hash('b') }, 'k1'), at(6));
  assert.equal(replay.id, wheels.id);
  assert.equal(replay.title, 'Choose wheels');
  assert.equal(replay.request_hash, hash('a'));
  // A replay records no activity, neither on the original project nor on the one it now names,
  // and still returns the original row when that project is missing or foreign.
  assert.equal(time((await storage.get(owner, bike.id)).last_activity_at), time(at(5)));
  const jobsBefore = time((await storage.get(owner, jobs.id)).last_activity_at);
  assert.equal((await storage.createTask(task({ project_id: jobs.id }, 'k1'), at(6))).id, wheels.id);
  assert.equal(time((await storage.get(owner, jobs.id)).last_activity_at), jobsBefore);
  const foreignBefore = time((await storage.get(stranger, foreign.id)).last_activity_at);
  assert.equal((await storage.createTask(task({ project_id: foreign.id }, 'k1'), at(6))).id, wheels.id);
  assert.equal(time((await storage.get(stranger, foreign.id)).last_activity_at), foreignBefore);
  const loose = await storage.createTask(task({ title: 'Loose task', due_date: '2030-01-08' }), at(6));
  const undated = await storage.createTask(task({ title: 'Undated' }), at(6));
  const low = await storage.createTask(task({ title: 'Low same day', due_date: '2030-01-10', priority: 'low' }), at(6));
  // A different owner may reuse the same idempotency key.
  const other = await storage.createTask(task({ owner_id: stranger, title: 'Stranger task' }, 'k1'), at(6));
  assert.notEqual(other.id, wheels.id);

  // Ordering: due date first (undated last), then priority. Filters and limit.
  const list = filters => storage.listTasks(owner, { project_id: null, status: 'open', due_before: null, limit: 10, ...filters });
  assert.deepEqual((await list({})).map(row => row.title), ['Loose task', 'Choose wheels', 'Low same day', 'Undated']);
  assert.deepEqual((await list({ due_before: '2030-01-08' })).map(row => row.title), ['Loose task']);
  assert.deepEqual((await list({ project_id: bike.id })).map(row => row.title), ['Choose wheels']);
  assert.equal((await list({ limit: 2 })).length, 2);

  // Updating tasks: completion timestamp follows status; dates and project can be cleared.
  let changed = await storage.updateTask(owner, wheels.id, { status: 'done' }, at(7));
  assert.equal(changed.status, 'done');
  assert.equal(time(changed.completed_at), time(at(7)));
  assert.equal(time((await storage.get(owner, bike.id)).last_activity_at), time(at(7)));
  changed = await storage.updateTask(owner, wheels.id, { title: 'Wheels chosen' }, at(8));
  assert.equal(time(changed.completed_at), time(at(7))); // unchanged while it stays done
  assert.equal((await list({})).length, 3);
  assert.equal((await list({ status: 'done' })).length, 1);
  assert.equal((await list({ status: 'all' })).length, 4);
  changed = await storage.updateTask(owner, wheels.id, { status: 'open', due_date: null, project_id: null }, at(9));
  assert.equal(changed.completed_at, null);
  assert.equal(changed.due_date, null);
  assert.equal(changed.project_id, null);
  changed = await storage.updateTask(owner, loose.id, { project_id: jobs.id, status: 'cancelled' }, at(9));
  assert.equal(changed.project_id, jobs.id);
  assert.equal(changed.completed_at, null);
  // Moving a task between projects counts as activity on both.
  await storage.updateTask(owner, loose.id, { project_id: bike.id }, at(9, 13));
  assert.equal(time((await storage.get(owner, jobs.id)).last_activity_at), time(at(9, 13)));
  assert.equal(time((await storage.get(owner, bike.id)).last_activity_at), time(at(9, 13)));
  await storage.updateTask(owner, loose.id, { project_id: jobs.id }, at(9, 14));
  // A refused update (foreign target) records nothing anywhere.
  assert.equal(await storage.updateTask(owner, loose.id, { project_id: foreign.id }, at(9, 15)), undefined);
  assert.equal(time((await storage.get(owner, jobs.id)).last_activity_at), time(at(9, 14)));
  assert.equal(await storage.updateTask(owner, loose.id, { project_id: foreign.id }, at(9)), undefined);
  assert.equal(await storage.updateTask(stranger, loose.id, { title: 'Stolen' }, at(9)), undefined);
  assert.equal(await storage.updateTask(owner, other.id, { title: 'Stolen' }, at(9)), undefined);
  assert.equal((await storage.listTasks(stranger, { project_id: null, status: 'all', due_before: null, limit: 10 })).length, 1);
  assert.ok(undated.id && low.id);

  // Notes: same ownership and idempotency rules; "forget" hides without deleting.
  const note = (fields, key = null) => ({ id: crypto.randomUUID(), owner_id: owner, project_id: null, kind: 'note',
    content: 'Note', source: '', idempotency_key: key, request_hash: hash('c'), ...fields });
  assert.equal(await storage.createNote(note({ project_id: foreign.id }), at(10)), undefined);
  const decision = await storage.createNote(note({ project_id: bike.id, kind: 'decision', content: 'Use 28mm tyres', source: 'chat' }, 'n1'), at(10));
  assert.equal(decision.status, 'active');
  assert.equal((await storage.createNote(note({ content: 'Other', request_hash: hash('d') }, 'n1'), at(11))).id, decision.id);
  assert.equal(time((await storage.get(owner, bike.id)).last_activity_at), time(at(10))); // replay: no activity
  const question = await storage.createNote(note({ project_id: bike.id, kind: 'open_question', content: 'Disc or rim brakes?' }), at(11));
  await storage.createNote(note({ kind: 'preference', content: 'Prefers morning training' }), at(12));
  await storage.createNote(note({ owner_id: stranger, content: 'Stranger tyres note' }), at(12));
  const search = filters => storage.searchNotes(owner, { query: null, kind: null, project_id: null, include_inactive: false, limit: 10, ...filters });
  assert.deepEqual((await search({})).map(row => row.content), ['Prefers morning training', 'Disc or rim brakes?', 'Use 28mm tyres']);
  assert.deepEqual((await search({ query: 'TYRES' })).map(row => row.content), ['Use 28mm tyres']);
  assert.equal((await search({ kind: 'open_question' })).length, 1);
  assert.equal((await search({ project_id: bike.id })).length, 2);
  assert.equal((await search({ limit: 1 })).length, 1);
  let edited = await storage.updateNote(owner, question.id, { kind: 'decision', content: 'Disc brakes' }, at(13));
  assert.equal(edited.kind, 'decision');
  assert.equal(time((await storage.get(owner, bike.id)).last_activity_at), time(at(13)));
  edited = await storage.updateNote(owner, decision.id, { status: 'inactive' }, at(14));
  assert.equal(edited.status, 'inactive');
  assert.equal((await search({})).length, 2);
  assert.equal((await search({ include_inactive: true })).length, 3);
  assert.equal(await storage.updateNote(stranger, decision.id, { content: 'Stolen' }, at(14)), undefined);

  // Summary ledger: one claim per owner and day; only failures can be claimed again, three times at most.
  assert.equal(await storage.claimSummary(owner, '2030-01-15', at(15)), true);
  assert.equal(await storage.claimSummary(owner, '2030-01-15', at(15)), false);
  await storage.finishSummary(owner, '2030-01-15', 'sent', at(15));
  assert.equal(await storage.claimSummary(owner, '2030-01-15', at(15)), false);
  assert.equal(await storage.claimSummary(stranger, '2030-01-15', at(15)), true);
  assert.equal(await storage.claimSummary(owner, '2030-01-16', at(16)), true);
  await storage.finishSummary(owner, '2030-01-16', 'failed', at(16));
  assert.equal(await storage.claimSummary(owner, '2030-01-16', at(16)), true);
  await storage.finishSummary(owner, '2030-01-16', 'failed', at(16));
  assert.equal(await storage.claimSummary(owner, '2030-01-16', at(16)), true);
  await storage.finishSummary(owner, '2030-01-16', 'failed', at(16));
  assert.equal(await storage.claimSummary(owner, '2030-01-16', at(16)), false);
  assert.equal(await storage.claimSummary(owner, '2030-01-17', at(17)), true);
  await storage.finishSummary(owner, '2030-01-17', 'skipped', at(17));
  assert.equal(await storage.claimSummary(owner, '2030-01-17', at(17)), false);

  // Courses: owner isolation, idempotent creation, literal search, archive hides.
  const course = (fields, key = null) => ({ id: crypto.randomUUID(), owner_id: owner, name: 'Course', code: '', term: '',
    notes: '', idempotency_key: key, request_hash: hash('a'), ...fields });
  const systems = await storage.createCourse(course({ name: 'Operating Systems', code: 'OS_1' }, 'c1'), at(20));
  assert.equal(systems.status, 'active');
  assert.equal((await storage.createCourse(course({ name: 'Other', request_hash: hash('b') }, 'c1'), at(20))).id, systems.id);
  const algebra = await storage.createCourse(course({ name: 'Algebra' }), at(20));
  const theirs = await storage.createCourse(course({ owner_id: stranger, name: 'Stranger course' }, 'c1'), at(20));
  assert.notEqual(theirs.id, systems.id);
  assert.equal((await storage.getCourse(owner, systems.id)).name, 'Operating Systems');
  assert.equal(await storage.getCourse(owner, theirs.id), undefined);
  const listCourses = filters => storage.listCourses(owner, { status: 'active', query: null, limit: 10, ...filters });
  assert.deepEqual((await listCourses({})).map(row => row.name), ['Algebra', 'Operating Systems']);
  assert.deepEqual((await listCourses({ query: 'os_1' })).map(row => row.name), ['Operating Systems']);
  assert.equal((await listCourses({ query: 'OS%1' })).length, 0);
  assert.equal((await listCourses({ limit: 1 })).length, 1);
  assert.equal((await storage.updateCourse(owner, algebra.id, { term: '2030 T1', status: 'archived' }, at(21))).term, '2030 T1');
  assert.equal(await storage.updateCourse(stranger, algebra.id, { name: 'Stolen' }, at(21)), undefined);
  assert.deepEqual((await listCourses({})).map(row => row.name), ['Operating Systems']);
  assert.deepEqual((await listCourses({ status: 'archived' })).map(row => row.name), ['Algebra']);

  // Groups: upsert by (course, kind, label); omitted fields are kept; foreign course refused.
  const group = fields => ({ id: crypto.randomUUID(), owner_id: owner, course_id: systems.id, kind: 'seminar', label: 'S1', ...fields });
  const seminar = await storage.saveCourseGroup(group({ teacher: 'Dr. Synthetic' }), at(22));
  assert.deepEqual([seminar.teacher, seminar.schedule, seminar.location, seminar.status], ['Dr. Synthetic', '', '', 'active']);
  const again = await storage.saveCourseGroup(group({ location: 'Room 5' }), at(23));
  assert.equal(again.id, seminar.id);
  assert.deepEqual([again.teacher, again.location], ['Dr. Synthetic', 'Room 5']);
  await storage.saveCourseGroup(group({ kind: 'theory', label: '', teacher: 'Dr. Theory' }), at(23));
  await storage.saveCourseGroup(group({ kind: 'lab', label: 'L2' }), at(23));
  await storage.saveCourseGroup(group({ kind: 'lab', label: 'L1' }), at(23));
  assert.equal(await storage.saveCourseGroup(group({ course_id: theirs.id }), at(23)), undefined);
  assert.equal(await storage.saveCourseGroup(group({ owner_id: stranger }), at(23)), undefined);
  assert.deepEqual((await storage.listCourseGroups(owner, [systems.id, algebra.id])).map(row => `${row.kind}:${row.label}`),
    ['theory:', 'seminar:S1', 'lab:L1', 'lab:L2']);
  await storage.saveCourseGroup(group({ kind: 'lab', label: 'L2', status: 'inactive' }), at(24));
  assert.equal((await storage.listCourseGroups(owner, [systems.id])).length, 3);
  assert.deepEqual(await storage.listCourseGroups(stranger, [systems.id]), []);
  assert.deepEqual(await storage.listCourseGroups(owner, []), []);

  // Tasks and notes linked to a course: ownership enforced, filters, linking and unlinking.
  assert.equal(await storage.createTask(task({ course_id: theirs.id }), at(25)), undefined);
  assert.equal(await storage.createTask(task({ course_id: crypto.randomUUID() }), at(25)), undefined);
  // A valid project with a foreign course inserts nothing and records no activity on the project.
  const bikeActivity = time((await storage.get(owner, bike.id)).last_activity_at);
  assert.equal(await storage.createTask(task({ project_id: bike.id, course_id: theirs.id }), at(25)), undefined);
  assert.equal(time((await storage.get(owner, bike.id)).last_activity_at), bikeActivity);
  const lab = await storage.createTask(task({ title: 'Lab 2', course_id: systems.id, due_date: '2030-01-28' }), at(25));
  assert.equal(lab.course_id, systems.id);
  assert.equal(lab.project_id, null);
  assert.deepEqual((await list({ course_id: systems.id })).map(row => row.title), ['Lab 2']);
  assert.equal(await storage.updateTask(owner, lab.id, { course_id: theirs.id }, at(26)), undefined);
  assert.equal((await storage.updateTask(owner, lab.id, { course_id: null }, at(26))).course_id, null);
  assert.equal((await storage.updateTask(owner, lab.id, { course_id: systems.id, title: 'Lab 2b' }, at(26))).course_id, systems.id);
  assert.equal((await storage.updateTask(owner, lab.id, { priority: 'high' }, at(26))).course_id, systems.id);
  assert.equal(await storage.createNote(note({ course_id: theirs.id }), at(27)), undefined);
  const exam = await storage.createNote(note({ kind: 'fact', content: 'Exam is 40%', course_id: systems.id }), at(27));
  assert.equal(exam.course_id, systems.id);
  assert.deepEqual((await search({ course_id: systems.id })).map(row => row.content), ['Exam is 40%']);

  // Export: every row of one owner per table, oldest first, never another owner's.
  const exported = await storage.exportTable(owner, 'courses', 10);
  assert.deepEqual(exported.map(row => row.name).sort(), ['Algebra', 'Operating Systems']);
  assert.equal((await storage.exportTable(owner, 'course_groups', 10)).length, 4);
  assert.equal((await storage.exportTable(owner, 'notes', 100)).every(row => row.owner_id === owner), true);
  assert.equal((await storage.exportTable(owner, 'notes', 100)).some(row => row.status === 'inactive'), true);
  assert.equal((await storage.exportTable(owner, 'tasks', 2)).length, 2);
  assert.deepEqual((await storage.exportTable(stranger, 'projects', 10)).map(row => row.name), ['Foreign project']);
}

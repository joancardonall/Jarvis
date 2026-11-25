// SQL for projects (listing and editing), tasks, notes, courses and the daily-summary ledger.
// Every statement filters by owner_id, takes the current time as a parameter (testable) and is a
// single statement, so it is atomic without interactive transactions (the Neon HTTP driver has none).

export const LIST_PROJECTS = `
  SELECT * FROM projects
  WHERE owner_id = $1
    AND (CASE WHEN $2::text IS NULL THEN status <> 'archived' ELSE status = $2::text END)
    AND ($3::text IS NULL OR name ILIKE $3::text OR description ILIKE $3::text)
  ORDER BY last_activity_at DESC, id
  LIMIT $4`;

// NULL means "leave unchanged". Dates that can be cleared carry an explicit "set" flag.
export const UPDATE_PROJECT = `
  UPDATE projects
  SET name = COALESCE($3::text, name), description = COALESCE($4::text, description),
      status = COALESCE($5::text, status), priority = COALESCE($6::text, priority),
      review_at = CASE WHEN $7::boolean THEN $8::date ELSE review_at END,
      snoozed_until = CASE WHEN $9::boolean THEN $10::date ELSE snoozed_until END,
      updated_at = $11::timestamptz, last_activity_at = $11::timestamptz
  WHERE owner_id = $1 AND id = $2
  RETURNING *`;

// The project and the course (if any) must belong to the same owner; touching the project records
// activity. When either is missing or foreign, nothing is inserted and no row is returned. A replay
// of an idempotency key changes nothing at all: it only returns the row created the first time.
export const CREATE_TASK = `
  WITH replayed AS (
    SELECT 1 FROM tasks WHERE owner_id = $2::uuid AND idempotency_key = $8::text),
  course AS (
    SELECT 1 FROM courses WHERE id = $11::uuid AND owner_id = $2::uuid),
  touched AS (
    UPDATE projects SET last_activity_at = $10::timestamptz
    WHERE id = $3::uuid AND owner_id = $2::uuid AND NOT EXISTS (SELECT 1 FROM replayed)
      AND ($11::uuid IS NULL OR EXISTS (SELECT 1 FROM course)) RETURNING id)
  INSERT INTO tasks (id, owner_id, project_id, title, notes, priority, due_date,
                     idempotency_key, request_hash, created_at, updated_at, course_id)
  SELECT $1::uuid, $2::uuid, $3::uuid, $4::text, $5::text, $6::text, $7::date,
         $8::text, $9::text, $10::timestamptz, $10::timestamptz, $11::uuid
  WHERE EXISTS (SELECT 1 FROM replayed)
     OR (($3::uuid IS NULL OR EXISTS (SELECT 1 FROM touched))
         AND ($11::uuid IS NULL OR EXISTS (SELECT 1 FROM course)))
  ON CONFLICT (owner_id, idempotency_key) DO UPDATE SET idempotency_key = tasks.idempotency_key
  RETURNING *`;

export const LIST_TASKS = `
  SELECT * FROM tasks
  WHERE owner_id = $1
    AND ($2::uuid IS NULL OR project_id = $2::uuid)
    AND ($3::text = 'all' OR status = $3::text)
    AND ($4::date IS NULL OR due_date <= $4::date)
    AND ($6::uuid IS NULL OR course_id = $6::uuid)
  ORDER BY due_date ASC NULLS LAST,
           CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, created_at, id
  LIMIT $5`;

// completed_at follows the status: set when a task becomes done, cleared when it is reopened.
// "previous" reads the row as it was before this statement, so a task moved between projects
// records activity on both the old and the new project.
export const UPDATE_TASK = `
  WITH previous AS (SELECT project_id FROM tasks WHERE owner_id = $1 AND id = $2),
  updated AS (
    UPDATE tasks
    SET title = COALESCE($3::text, title), notes = COALESCE($4::text, notes),
        status = COALESCE($5::text, status), priority = COALESCE($6::text, priority),
        due_date = CASE WHEN $7::boolean THEN $8::date ELSE due_date END,
        project_id = CASE WHEN $9::boolean THEN $10::uuid ELSE project_id END,
        course_id = CASE WHEN $12::boolean THEN $13::uuid ELSE course_id END,
        completed_at = CASE WHEN COALESCE($5::text, status) = 'done'
                            THEN COALESCE(completed_at, $11::timestamptz) ELSE NULL END,
        updated_at = $11::timestamptz
    WHERE owner_id = $1 AND id = $2
      AND (NOT $9::boolean OR $10::uuid IS NULL
           OR EXISTS (SELECT 1 FROM projects WHERE id = $10::uuid AND owner_id = $1))
      AND (NOT $12::boolean OR $13::uuid IS NULL
           OR EXISTS (SELECT 1 FROM courses WHERE id = $13::uuid AND owner_id = $1))
    RETURNING *),
  touched AS (
    UPDATE projects SET last_activity_at = $11::timestamptz
    WHERE owner_id = $1 AND EXISTS (SELECT 1 FROM updated)
      AND id IN (SELECT project_id FROM updated UNION SELECT project_id FROM previous))
  SELECT * FROM updated`;

export const CREATE_NOTE = `
  WITH replayed AS (
    SELECT 1 FROM notes WHERE owner_id = $2::uuid AND idempotency_key = $7::text),
  course AS (
    SELECT 1 FROM courses WHERE id = $10::uuid AND owner_id = $2::uuid),
  touched AS (
    UPDATE projects SET last_activity_at = $9::timestamptz
    WHERE id = $3::uuid AND owner_id = $2::uuid AND NOT EXISTS (SELECT 1 FROM replayed)
      AND ($10::uuid IS NULL OR EXISTS (SELECT 1 FROM course)) RETURNING id)
  INSERT INTO notes (id, owner_id, project_id, kind, content, source,
                     idempotency_key, request_hash, created_at, updated_at, course_id)
  SELECT $1::uuid, $2::uuid, $3::uuid, $4::text, $5::text, $6::text,
         $7::text, $8::text, $9::timestamptz, $9::timestamptz, $10::uuid
  WHERE EXISTS (SELECT 1 FROM replayed)
     OR (($3::uuid IS NULL OR EXISTS (SELECT 1 FROM touched))
         AND ($10::uuid IS NULL OR EXISTS (SELECT 1 FROM course)))
  ON CONFLICT (owner_id, idempotency_key) DO UPDATE SET idempotency_key = notes.idempotency_key
  RETURNING *`;

export const SEARCH_NOTES = `
  SELECT * FROM notes
  WHERE owner_id = $1
    AND ($2::text IS NULL OR content ILIKE $2::text)
    AND ($3::text IS NULL OR kind = $3::text)
    AND ($4::uuid IS NULL OR project_id = $4::uuid)
    AND ($5::boolean OR status = 'active')
    AND ($7::uuid IS NULL OR course_id = $7::uuid)
  ORDER BY created_at DESC, id
  LIMIT $6`;

export const UPDATE_NOTE = `
  WITH updated AS (
    UPDATE notes
    SET content = COALESCE($3::text, content), kind = COALESCE($4::text, kind),
        status = COALESCE($5::text, status), updated_at = $6::timestamptz
    WHERE owner_id = $1 AND id = $2
    RETURNING *),
  touched AS (
    UPDATE projects SET last_activity_at = $6::timestamptz
    WHERE owner_id = $1 AND id IN (SELECT project_id FROM updated))
  SELECT * FROM updated`;

// Courses (university).
export const CREATE_COURSE = `
  INSERT INTO courses (id, owner_id, name, code, term, notes, idempotency_key, request_hash, created_at, updated_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $9::timestamptz)
  ON CONFLICT (owner_id, idempotency_key) DO UPDATE SET idempotency_key = courses.idempotency_key
  RETURNING *`;
export const GET_COURSE = 'SELECT * FROM courses WHERE owner_id = $1 AND id = $2';
export const LIST_COURSES = `
  SELECT * FROM courses
  WHERE owner_id = $1 AND status = $2::text
    AND ($3::text IS NULL OR name ILIKE $3::text OR code ILIKE $3::text)
  ORDER BY name, id
  LIMIT $4`;
export const UPDATE_COURSE = `
  UPDATE courses
  SET name = COALESCE($3::text, name), code = COALESCE($4::text, code), term = COALESCE($5::text, term),
      notes = COALESCE($6::text, notes), status = COALESCE($7::text, status), updated_at = $8::timestamptz
  WHERE owner_id = $1 AND id = $2
  RETURNING *`;
// Insert or update the group identified by (course, kind, label). Fields not given keep their
// stored value on update and start empty on insert. No row when the course is missing or foreign.
export const SAVE_COURSE_GROUP = `
  INSERT INTO course_groups (id, owner_id, course_id, kind, label, teacher, schedule, location, status, created_at, updated_at)
  SELECT $1::uuid, $2::uuid, $3::uuid, $4::text, $5::text, COALESCE($6::text, ''), COALESCE($7::text, ''),
         COALESCE($8::text, ''), COALESCE($9::text, 'active'), $10::timestamptz, $10::timestamptz
  WHERE EXISTS (SELECT 1 FROM courses WHERE id = $3::uuid AND owner_id = $2::uuid)
  ON CONFLICT (course_id, kind, label) DO UPDATE
  SET teacher = COALESCE($6::text, course_groups.teacher), schedule = COALESCE($7::text, course_groups.schedule),
      location = COALESCE($8::text, course_groups.location), status = COALESCE($9::text, course_groups.status),
      updated_at = $10::timestamptz
  RETURNING *`;
export const LIST_COURSE_GROUPS = `
  SELECT * FROM course_groups
  WHERE owner_id = $1 AND course_id = ANY($2::uuid[]) AND status = 'active'
  ORDER BY CASE kind WHEN 'theory' THEN 0 WHEN 'seminar' THEN 1 WHEN 'lab' THEN 2 ELSE 3 END, label, id`;

// Export: every row of the owner in one table, oldest first. Table names are fixed constants.
export const EXPORT_TABLES = ['projects', 'tasks', 'notes', 'courses', 'course_groups'];
export const exportQuery = table => `SELECT * FROM ${table} WHERE owner_id = $1 ORDER BY created_at, id LIMIT $2`;

// Claims today's summary. A row is returned only to the caller allowed to send: the first one,
// or a retry after a recorded failure (three attempts at most). Everyone else gets nothing.
export const CLAIM_SUMMARY = `
  INSERT INTO summary_runs (owner_id, summary_date, status, updated_at)
  VALUES ($1, $2::date, 'sending', $3::timestamptz)
  ON CONFLICT (owner_id, summary_date) DO UPDATE
  SET status = 'sending', attempts = summary_runs.attempts + 1, updated_at = $3::timestamptz
  WHERE summary_runs.status = 'failed' AND summary_runs.attempts < 3
  RETURNING attempts`;
export const FINISH_SUMMARY = `
  UPDATE summary_runs SET status = $3, updated_at = $4::timestamptz
  WHERE owner_id = $1 AND summary_date = $2::date AND status = 'sending'`;

// Treats the user's search text literally: % and _ are not wildcards.
const containing = query => (query === null || query === undefined
  ? null : `%${query.replace(/[\\%_]/g, character => `\\${character}`)}%`);
const has = (changes, field) => Object.hasOwn(changes, field);

export function domainOperations(run) {
  // Timestamps travel as ISO 8601 text, which PostgreSQL reads without timezone ambiguity.
  const query = (text, values) => run(text, values.map(value => value instanceof Date ? value.toISOString() : value));
  return {
    listProjects(owner, { status, query: search, limit }) {
      return query(LIST_PROJECTS, [owner, status, containing(search), limit]);
    },
    async updateProject(owner, id, changes, now) {
      return (await query(UPDATE_PROJECT, [owner, id, changes.name ?? null, changes.description ?? null,
        changes.status ?? null, changes.priority ?? null, has(changes, 'review_at'), changes.review_at ?? null,
        has(changes, 'snoozed_until'), changes.snoozed_until ?? null, now]))[0];
    },
    async createTask(task, now) {
      return (await query(CREATE_TASK, [task.id, task.owner_id, task.project_id, task.title, task.notes,
        task.priority, task.due_date, task.idempotency_key, task.request_hash, now, task.course_id ?? null]))[0];
    },
    listTasks(owner, { project_id, status, due_before, limit, course_id = null }) {
      return query(LIST_TASKS, [owner, project_id, status, due_before, limit, course_id]);
    },
    async updateTask(owner, id, changes, now) {
      return (await query(UPDATE_TASK, [owner, id, changes.title ?? null, changes.notes ?? null,
        changes.status ?? null, changes.priority ?? null, has(changes, 'due_date'), changes.due_date ?? null,
        has(changes, 'project_id'), changes.project_id ?? null, now,
        has(changes, 'course_id'), changes.course_id ?? null]))[0];
    },
    async createNote(note, now) {
      return (await query(CREATE_NOTE, [note.id, note.owner_id, note.project_id, note.kind, note.content,
        note.source, note.idempotency_key, note.request_hash, now, note.course_id ?? null]))[0];
    },
    searchNotes(owner, { query: search, kind, project_id, include_inactive, limit, course_id = null }) {
      return query(SEARCH_NOTES, [owner, containing(search), kind, project_id, include_inactive, limit, course_id]);
    },
    async updateNote(owner, id, changes, now) {
      return (await query(UPDATE_NOTE, [owner, id, changes.content ?? null, changes.kind ?? null,
        changes.status ?? null, now]))[0];
    },
    async createCourse(course, now) {
      return (await query(CREATE_COURSE, [course.id, course.owner_id, course.name, course.code, course.term,
        course.notes, course.idempotency_key, course.request_hash, now]))[0];
    },
    async getCourse(owner, id) { return (await query(GET_COURSE, [owner, id]))[0]; },
    listCourses(owner, { status, query: search, limit }) {
      return query(LIST_COURSES, [owner, status, containing(search), limit]);
    },
    async updateCourse(owner, id, changes, now) {
      return (await query(UPDATE_COURSE, [owner, id, changes.name ?? null, changes.code ?? null,
        changes.term ?? null, changes.notes ?? null, changes.status ?? null, now]))[0];
    },
    async saveCourseGroup(group, now) {
      return (await query(SAVE_COURSE_GROUP, [group.id, group.owner_id, group.course_id, group.kind, group.label,
        group.teacher ?? null, group.schedule ?? null, group.location ?? null, group.status ?? null, now]))[0];
    },
    listCourseGroups(owner, courseIds) { return query(LIST_COURSE_GROUPS, [owner, courseIds]); },
    exportTable(owner, table, limit) {
      if (!EXPORT_TABLES.includes(table)) throw new Error('unknown_table');
      return query(exportQuery(table), [owner, limit]);
    },
    async claimSummary(owner, date, now) { return (await query(CLAIM_SUMMARY, [owner, date, now])).length === 1; },
    async finishSummary(owner, date, status, now) { await query(FINISH_SUMMARY, [owner, date, status, now]); },
  };
}

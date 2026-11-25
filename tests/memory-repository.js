// Deterministic storage simulator; never presented as PostgreSQL validation.
export function memoryRepository() {
  const rows = new Map();
  const grants = [];
  const tasks = [];
  const notes = [];
  const courses = [];
  const groups = [];
  const summaries = new Map();
  const contains = (value, query) => value.toLowerCase().includes(query.toLowerCase());
  const touch = (owner, projectId, now) => {
    const project = projectId && rows.get(projectId);
    if (project?.owner_id === owner) project.last_activity_at = now;
  };
  const ownCourse = (owner, id) => courses.find(course => course.id === id && course.owner_id === owner);
  // Shared by tasks and notes: owner-checked project and course, idempotent replay, then insert.
  const insertItem = (list, item, defaults, now) => {
    const existing = item.idempotency_key && list.find(candidate =>
      candidate.owner_id === item.owner_id && candidate.idempotency_key === item.idempotency_key);
    if (existing) return existing; // a replay changes nothing, not even project activity
    if (item.project_id && rows.get(item.project_id)?.owner_id !== item.owner_id) return undefined;
    if (item.course_id && !ownCourse(item.owner_id, item.course_id)) return undefined;
    touch(item.owner_id, item.project_id, now);
    const row = { ...item, course_id: item.course_id ?? null, ...defaults, created_at: now, updated_at: now };
    list.push(row);
    return row;
  };
  const time = value => new Date(value).getTime();
  const store = (grant, tokens) => Object.assign(grant, {
    access_hash: tokens.access_hash, access_expires_at: tokens.access_expires_at,
    refresh_hash: tokens.refresh_hash, refresh_expires_at: tokens.refresh_expires_at });
  return {
    rows, grants, tasks, notes, summaries, courses, groups,
    // Mirrors the conditions of the SQL statements in src/repository.js.
    async createGrant(grant) {
      if (grants.some(existing => existing.code_hash === grant.code_hash)) throw new Error('duplicate');
      grants.push({ ...grant, code_used_at: null, access_hash: null, refresh_hash: null,
        previous_refresh_hash: null, superseded_refresh_hash: null, refresh_rotated_at: null, revoked_at: null });
    },
    async findGrantByCode(codeHash) { return grants.find(grant => grant.code_hash === codeHash); },
    async redeemCode(codeHash, tokens, now) {
      const grant = grants.find(candidate => candidate.code_hash === codeHash && !candidate.code_used_at &&
        !candidate.revoked_at && time(candidate.code_expires_at) > time(now));
      if (!grant) return false;
      store(grant, tokens).code_used_at = now;
      return true;
    },
    async findGrantByAccess(accessHash, now) {
      return grants.find(grant => grant.access_hash === accessHash && !grant.revoked_at &&
        time(grant.access_expires_at) > time(now));
    },
    async rotateRefresh(refreshHash, clientHash, tokens, now, retryLimit) {
      const usable = grant => grant.client_hash === clientHash && !grant.revoked_at &&
        time(grant.refresh_expires_at) > time(now);
      const current = grants.find(grant => grant.refresh_hash === refreshHash && usable(grant));
      if (current) {
        current.previous_refresh_hash = current.refresh_hash;
        current.superseded_refresh_hash = null;
        current.refresh_rotated_at = now;
        store(current, tokens);
        return true;
      }
      const retried = grants.find(grant => grant.previous_refresh_hash === refreshHash && usable(grant) &&
        !grant.superseded_refresh_hash && time(grant.refresh_rotated_at) > time(retryLimit));
      if (retried) {
        retried.superseded_refresh_hash = retried.refresh_hash;
        store(retried, tokens);
        return true;
      }
      for (const grant of grants) {
        if ([grant.previous_refresh_hash, grant.superseded_refresh_hash].includes(refreshHash) && !grant.revoked_at) {
          grant.revoked_at = now;
        }
      }
      return false;
    },
    async revokeGrant(id, now) {
      const grant = grants.find(candidate => candidate.id === id);
      if (grant && !grant.revoked_at) grant.revoked_at = now;
    },
    async create(data) {
      const existing = data.idempotency_key && [...rows.values()].find(row =>
        row.owner_id === data.owner_id && row.idempotency_key === data.idempotency_key);
      if (existing) return existing;
      const row = { ...data, status: 'active', priority: 'normal', review_at: null, snoozed_until: null,
        created_at: new Date(), updated_at: new Date(), last_activity_at: new Date() };
      rows.set(row.id, row);
      return row;
    },
    async get(owner, id) { const row = rows.get(id); return row?.owner_id === owner ? row : undefined; },

    // Projects, tasks, notes and summary ledger: mirrors src/domain-repository.js.
    async listProjects(owner, { status, query, limit }) {
      return [...rows.values()]
        .filter(row => row.owner_id === owner && (status === null ? row.status !== 'archived' : row.status === status) &&
          (query === null || contains(row.name, query) || contains(row.description, query)))
        .sort((a, b) => time(b.last_activity_at) - time(a.last_activity_at) || a.id.localeCompare(b.id))
        .slice(0, limit);
    },
    async updateProject(owner, id, changes, now) {
      const row = rows.get(id);
      if (row?.owner_id !== owner) return undefined;
      for (const field of ['name', 'description', 'status', 'priority']) if (changes[field] != null) row[field] = changes[field];
      for (const field of ['review_at', 'snoozed_until']) if (Object.hasOwn(changes, field)) row[field] = changes[field];
      row.updated_at = now;
      row.last_activity_at = now;
      return row;
    },
    async createTask(task, now) { return insertItem(tasks, task, { status: 'open', completed_at: null }, now); },
    async listTasks(owner, { project_id, status, due_before, limit, course_id = null }) {
      const rank = { high: 0, normal: 1, low: 2 };
      return tasks
        .filter(task => task.owner_id === owner && (project_id === null || task.project_id === project_id) &&
          (course_id === null || task.course_id === course_id) && (status === 'all' || task.status === status) &&
          (due_before === null || (task.due_date !== null && task.due_date <= due_before)))
        .sort((a, b) => (a.due_date ?? '9999') .localeCompare(b.due_date ?? '9999') || rank[a.priority] - rank[b.priority] ||
          time(a.created_at) - time(b.created_at) || a.id.localeCompare(b.id))
        .slice(0, limit);
    },
    async updateTask(owner, id, changes, now) {
      const task = tasks.find(candidate => candidate.id === id && candidate.owner_id === owner);
      if (!task) return undefined;
      if (changes.project_id && rows.get(changes.project_id)?.owner_id !== owner) return undefined;
      if (changes.course_id && !ownCourse(owner, changes.course_id)) return undefined;
      touch(owner, task.project_id, now); // the project it is leaving, if it moves
      for (const field of ['title', 'notes', 'status', 'priority']) if (changes[field] != null) task[field] = changes[field];
      for (const field of ['due_date', 'project_id', 'course_id']) if (Object.hasOwn(changes, field)) task[field] = changes[field];
      task.completed_at = task.status === 'done' ? task.completed_at ?? now : null;
      task.updated_at = now;
      touch(owner, task.project_id, now);
      return task;
    },
    async createNote(note, now) { return insertItem(notes, note, { status: 'active' }, now); },
    async searchNotes(owner, { query, kind, project_id, include_inactive, limit, course_id = null }) {
      return notes
        .filter(note => note.owner_id === owner && (query === null || contains(note.content, query)) &&
          (kind === null || note.kind === kind) && (project_id === null || note.project_id === project_id) &&
          (course_id === null || note.course_id === course_id) &&
          (include_inactive || note.status === 'active'))
        .sort((a, b) => time(b.created_at) - time(a.created_at) || a.id.localeCompare(b.id))
        .slice(0, limit);
    },
    async updateNote(owner, id, changes, now) {
      const note = notes.find(candidate => candidate.id === id && candidate.owner_id === owner);
      if (!note) return undefined;
      for (const field of ['content', 'kind', 'status']) if (changes[field] != null) note[field] = changes[field];
      note.updated_at = now;
      touch(owner, note.project_id, now);
      return note;
    },
    async createCourse(course, now) {
      const existing = course.idempotency_key && courses.find(candidate =>
        candidate.owner_id === course.owner_id && candidate.idempotency_key === course.idempotency_key);
      if (existing) return existing;
      const row = { ...course, status: 'active', created_at: now, updated_at: now };
      courses.push(row);
      return row;
    },
    async getCourse(owner, id) { return ownCourse(owner, id); },
    async listCourses(owner, { status, query, limit }) {
      return courses
        .filter(course => course.owner_id === owner && course.status === status &&
          (query === null || contains(course.name, query) || contains(course.code, query)))
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
        .slice(0, limit);
    },
    async updateCourse(owner, id, changes, now) {
      const course = ownCourse(owner, id);
      if (!course) return undefined;
      for (const field of ['name', 'code', 'term', 'notes', 'status']) if (changes[field] != null) course[field] = changes[field];
      course.updated_at = now;
      return course;
    },
    async saveCourseGroup(group, now) {
      if (!ownCourse(group.owner_id, group.course_id)) return undefined;
      const existing = groups.find(candidate => candidate.course_id === group.course_id &&
        candidate.kind === group.kind && candidate.label === group.label);
      if (existing) {
        for (const field of ['teacher', 'schedule', 'location']) if (group[field] != null) existing[field] = group[field];
        existing.status = group.status ?? 'active';
        existing.updated_at = now;
        return existing;
      }
      const row = { id: group.id, owner_id: group.owner_id, course_id: group.course_id, kind: group.kind,
        label: group.label, teacher: group.teacher ?? '', schedule: group.schedule ?? '',
        location: group.location ?? '', status: group.status ?? 'active', created_at: now, updated_at: now };
      groups.push(row);
      return row;
    },
    async listCourseGroups(owner, courseIds) {
      const rank = { theory: 0, seminar: 1, lab: 2, other: 3 };
      return groups
        .filter(group => group.owner_id === owner && courseIds.includes(group.course_id) && group.status === 'active')
        .sort((a, b) => rank[a.kind] - rank[b.kind] || a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
    },
    async exportTable(owner, table, limit) {
      const source = { projects: [...rows.values()], tasks, notes, courses, course_groups: groups }[table];
      return source.filter(row => row.owner_id === owner)
        .sort((a, b) => time(a.created_at) - time(b.created_at) || a.id.localeCompare(b.id)).slice(0, limit);
    },
    async claimSummary(owner, date, now) {
      const key = `${owner} ${date}`;
      const run = summaries.get(key);
      if (!run) { summaries.set(key, { status: 'sending', attempts: 1, updated_at: now }); return true; }
      if (run.status !== 'failed' || run.attempts >= 3) return false;
      Object.assign(run, { status: 'sending', attempts: run.attempts + 1, updated_at: now });
      return true;
    },
    async finishSummary(owner, date, status, now) {
      const run = summaries.get(`${owner} ${date}`);
      if (run?.status === 'sending') Object.assign(run, { status, updated_at: now });
    },
  };
}

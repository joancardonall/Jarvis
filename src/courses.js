import { z } from 'zod';
import { AppError } from './errors.js';
import { digest } from './projects.js';
import { taskView } from './tasks.js';
import { noteView } from './notes.js';
import { idempotencyKey, instantView, limit, parse, requiredText, searchText, text, uuid } from './validation.js';

// University model: a course (assignatura) and its groups. Deliverables are tasks with a
// course_id; academic context is notes with a course_id.
export const GROUP_KINDS = ['theory', 'seminar', 'lab', 'other'];

export const courseInput = z.object({
  name: requiredText(200),
  code: text(40).optional(),
  term: text(60).optional(),
  notes: text(4000).optional(),
  idempotency_key: idempotencyKey.optional(),
}).strict();
export const courseLookup = z.object({ course_id: uuid }).strict();
export const courseListInput = z.object({
  status: z.enum(['active', 'archived']).optional(),
  query: searchText.optional(),
  limit: limit.optional(),
}).strict();
export const courseUpdateInput = z.object({
  course_id: uuid,
  name: requiredText(200).optional(),
  code: text(40).optional(),
  term: text(60).optional(),
  notes: text(4000).optional(),
  status: z.enum(['active', 'archived']).optional(),
}).strict().refine(input => Object.keys(input).length > 1, 'nothing_to_update');

// Saving a group that already exists (same course, kind and label) updates the given fields.
export const courseGroupInput = z.object({
  course_id: uuid,
  kind: z.enum(GROUP_KINDS),
  label: text(60).optional(),
  teacher: text(200).optional(),
  schedule: text(300).optional(),
  location: text(200).optional(),
  status: z.enum(['active', 'inactive']).optional(),
}).strict();

export function courseView(row) {
  return { id: row.id, name: row.name, code: row.code, term: row.term, notes: row.notes, status: row.status,
    created_at: instantView(row.created_at), updated_at: instantView(row.updated_at) };
}
export function groupView(row) {
  return { id: row.id, course_id: row.course_id, kind: row.kind, label: row.label, teacher: row.teacher,
    schedule: row.schedule, location: row.location, status: row.status, updated_at: instantView(row.updated_at) };
}

export function createCourseService(repository, clock = Date.now) {
  const withGroups = async (owner, courses) => {
    const groups = courses.length ? await repository.listCourseGroups(owner, courses.map(course => course.id)) : [];
    return courses.map(course => ({ ...courseView(course),
      groups: groups.filter(group => group.course_id === course.id).map(groupView) }));
  };
  const find = async (owner, input) => {
    const { course_id } = parse(courseLookup, input, 'invalid_course_id');
    const row = await repository.getCourse(owner, course_id);
    if (!row) throw new AppError(404, 'course_not_found');
    return row;
  };
  return {
    async create(owner, input) {
      const data = parse(courseInput, input, 'invalid_course');
      const fields = { name: data.name, code: data.code ?? '', term: data.term ?? '', notes: data.notes ?? '' };
      const requestHash = await digest(JSON.stringify(fields));
      const row = await repository.createCourse({ id: crypto.randomUUID(), owner_id: owner, ...fields,
        idempotency_key: data.idempotency_key ?? null, request_hash: requestHash }, new Date(clock()));
      if (row.request_hash !== requestHash) throw new AppError(409, 'idempotency_conflict');
      return courseView(row);
    },
    // Each course comes with its active groups, so "who teaches the seminar of X?" is one call.
    async list(owner, input = {}) {
      const { status = 'active', query = null, limit: max = 50 } = parse(courseListInput, input, 'invalid_course_filter');
      const rows = await repository.listCourses(owner, { status, query, limit: max + 1 });
      return { courses: await withGroups(owner, rows.slice(0, max)), truncated: rows.length > max };
    },
    async update(owner, input) {
      const { course_id, ...changes } = parse(courseUpdateInput, input, 'invalid_course_update');
      const row = await repository.updateCourse(owner, course_id, changes, new Date(clock()));
      if (!row) throw new AppError(404, 'course_not_found');
      return courseView(row);
    },
    async saveGroup(owner, input) {
      const data = parse(courseGroupInput, input, 'invalid_course_group');
      const row = await repository.saveCourseGroup({ id: crypto.randomUUID(), owner_id: owner, ...data,
        label: data.label ?? '' }, new Date(clock()));
      if (!row) throw new AppError(404, 'course_not_found');
      return groupView(row);
    },
    // Everything about one course: groups and teachers, open deliverables and notes.
    async overview(owner, input) {
      const row = await find(owner, input);
      const [[course], tasks, notes] = await Promise.all([
        withGroups(owner, [row]),
        repository.listTasks(owner, { project_id: null, course_id: row.id, status: 'open', due_before: null, limit: 101 }),
        repository.searchNotes(owner, { query: null, kind: null, project_id: null, course_id: row.id, include_inactive: false, limit: 101 }),
      ]);
      return { course, open_tasks: tasks.slice(0, 100).map(taskView), notes: notes.slice(0, 100).map(noteView),
        truncated: tasks.length > 100 || notes.length > 100 };
    },
  };
}

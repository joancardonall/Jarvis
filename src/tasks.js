import { z } from 'zod';
import { AppError } from './errors.js';
import { digest } from './projects.js';
import { calendarDate, dateView, idempotencyKey, instantView, limit, parse, priority, requiredText, text, uuid }
  from './validation.js';

export const TASK_STATUSES = ['open', 'done', 'cancelled'];

export const taskInput = z.object({
  title: requiredText(300),
  notes: text(4000).optional(),
  project_id: uuid.optional(),
  course_id: uuid.optional(),
  due_date: calendarDate.optional(),
  priority: priority.optional(),
  idempotency_key: idempotencyKey.optional(),
}).strict();

// Default view: open tasks. `all` includes done and cancelled ones.
export const taskListInput = z.object({
  project_id: uuid.optional(),
  course_id: uuid.optional(),
  status: z.enum([...TASK_STATUSES, 'all']).optional(),
  due_before: calendarDate.optional(),
  limit: limit.optional(),
}).strict();

export const taskUpdateInput = z.object({
  task_id: uuid,
  title: requiredText(300).optional(),
  notes: text(4000).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: priority.optional(),
  due_date: calendarDate.nullable().optional(),
  project_id: uuid.nullable().optional(),
  course_id: uuid.nullable().optional(),
}).strict().refine(input => Object.keys(input).length > 1, 'nothing_to_update');

export function taskView(row) {
  return {
    id: row.id, project_id: row.project_id ?? null, course_id: row.course_id ?? null, title: row.title, notes: row.notes,
    status: row.status, priority: row.priority, due_date: dateView(row.due_date),
    created_at: instantView(row.created_at), updated_at: instantView(row.updated_at),
    completed_at: instantView(row.completed_at),
  };
}

export function createTaskService(repository, clock = Date.now) {
  // Tells which linked item could not be used. Missing and foreign look exactly the same.
  const missingLink = async (owner, { project_id, course_id }) => {
    if (course_id && !await repository.getCourse(owner, course_id)) return new AppError(404, 'course_not_found');
    return new AppError(404, 'project_not_found');
  };
  return {
    async create(owner, input) {
      const data = parse(taskInput, input, 'invalid_task');
      const fields = { title: data.title, notes: data.notes ?? '', project_id: data.project_id ?? null,
        due_date: data.due_date ?? null, priority: data.priority ?? 'normal' };
      // Added to the fingerprint only when present, so requests made before courses existed still replay.
      if (data.course_id) fields.course_id = data.course_id;
      const requestHash = await digest(JSON.stringify(fields));
      const row = await repository.createTask({ id: crypto.randomUUID(), owner_id: owner, ...fields,
        idempotency_key: data.idempotency_key ?? null, request_hash: requestHash }, new Date(clock()));
      // No row: the project or the course does not exist or belongs to someone else.
      if (!row) throw await missingLink(owner, data);
      if (row.request_hash !== requestHash) throw new AppError(409, 'idempotency_conflict');
      return taskView(row);
    },
    async list(owner, input = {}) {
      const { project_id = null, course_id = null, status = 'open', due_before = null, limit: max = 50 } =
        parse(taskListInput, input, 'invalid_task_filter');
      const rows = await repository.listTasks(owner, { project_id, course_id, status, due_before, limit: max + 1 });
      return { tasks: rows.slice(0, max).map(taskView), truncated: rows.length > max };
    },
    async update(owner, input) {
      const { task_id, ...changes } = parse(taskUpdateInput, input, 'invalid_task_update');
      const row = await repository.updateTask(owner, task_id, changes, new Date(clock()));
      if (row) return taskView(row);
      // Nothing changed: the task, the new project or the new course is missing or belongs to someone else.
      const missing = await missingLink(owner, changes);
      throw missing.code === 'project_not_found' && !changes.project_id ? new AppError(404, 'task_not_found') : missing;
    },
  };
}

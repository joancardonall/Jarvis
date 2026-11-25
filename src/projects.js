import { z } from 'zod';
import { AppError } from './errors.js';
import { calendarDate, dateView, idempotencyKey, instantView, limit, parse, priority, requiredText, text, uuid }
  from './validation.js';

export const PROJECT_STATUSES = ['active', 'paused', 'completed', 'archived'];

export const projectInput = z.object({
  name: requiredText(200),
  description: text(2000).optional(),
  idempotency_key: idempotencyKey.optional(),
}).strict();
export const projectLookup = z.object({ project_id: uuid }).strict();

// Without a status filter, archived projects are hidden: they are kept but no longer relevant.
export const projectListInput = z.object({
  status: z.enum(PROJECT_STATUSES).optional(),
  query: z.string().min(1).max(100).optional(),
  limit: limit.optional(),
}).strict();

export const projectUpdateInput = z.object({
  project_id: uuid,
  name: requiredText(200).optional(),
  description: text(2000).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  priority: priority.optional(),
  review_at: calendarDate.nullable().optional(),
  snoozed_until: calendarDate.nullable().optional(),
}).strict().refine(input => Object.keys(input).length > 1, 'nothing_to_update');

export async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

// Public representation: never exposes owner, idempotency key or request fingerprint.
export function projectView(row) {
  return {
    id: row.id, name: row.name, description: row.description, status: row.status,
    priority: row.priority ?? 'normal', review_at: dateView(row.review_at),
    snoozed_until: dateView(row.snoozed_until),
    created_at: instantView(row.created_at), updated_at: instantView(row.updated_at),
    last_activity_at: instantView(row.last_activity_at ?? row.updated_at),
  };
}

export function createProjectService(repository, clock = Date.now) {
  return {
    async create(owner, input) {
      const { name, description = '', idempotency_key = null } = parse(projectInput, input, 'invalid_project');
      const requestHash = await digest(JSON.stringify({ name, description }));
      const row = await repository.create({
        id: crypto.randomUUID(), owner_id: owner, name, description,
        idempotency_key, request_hash: requestHash,
      });
      if (row.request_hash !== requestHash) throw new AppError(409, 'idempotency_conflict');
      return projectView(row);
    },
    async get(owner, input) {
      const { project_id } = parse(projectLookup, input, 'invalid_project_id');
      const row = await repository.get(owner, project_id);
      if (!row) throw new AppError(404, 'project_not_found');
      return projectView(row);
    },
    // Asks for one row more than the limit to report `truncated` without a second count query.
    async list(owner, input = {}) {
      const { status = null, query = null, limit: max = 50 } = parse(projectListInput, input, 'invalid_project_filter');
      const rows = await repository.listProjects(owner, { status, query, limit: max + 1 });
      return { projects: rows.slice(0, max).map(projectView), truncated: rows.length > max };
    },
    async update(owner, input) {
      const { project_id, ...changes } = parse(projectUpdateInput, input, 'invalid_project_update');
      // A review date only makes sense while a project is paused; any other status clears it.
      if (changes.status && changes.status !== 'paused' && changes.review_at === undefined) changes.review_at = null;
      const row = await repository.updateProject(owner, project_id, changes, new Date(clock()));
      if (!row) throw new AppError(404, 'project_not_found');
      return projectView(row);
    },
  };
}

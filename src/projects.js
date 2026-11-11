import { z } from 'zod';
import { AppError } from './errors.js';

export const projectInput = z.object({
  name: z.string().min(1).max(200).refine(value => value.trim().length > 0),
  description: z.string().max(2000).optional(),
  idempotency_key: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/).optional(),
}).strict();
export const projectLookup = z.object({ project_id: z.string().uuid() }).strict();

export async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function projectView(row) {
  return {
    id: row.id, name: row.name, description: row.description, status: row.status,
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
  };
}

export function createProjectService(repository) {
  return {
    async create(owner, input) {
      const parsed = projectInput.safeParse(input);
      if (!parsed.success) throw new AppError(422, 'invalid_project');
      const { name, description = '', idempotency_key = null } = parsed.data;
      const requestHash = await digest(JSON.stringify({ name, description }));
      const row = await repository.create({
        id: crypto.randomUUID(), owner_id: owner, name, description,
        idempotency_key, request_hash: requestHash,
      });
      if (row.request_hash !== requestHash) throw new AppError(409, 'idempotency_conflict');
      return projectView(row);
    },
    async get(owner, input) {
      const parsed = projectLookup.safeParse(input);
      if (!parsed.success) throw new AppError(422, 'invalid_project_id');
      const row = await repository.get(owner, parsed.data.project_id);
      if (!row) throw new AppError(404, 'project_not_found');
      return projectView(row);
    },
  };
}

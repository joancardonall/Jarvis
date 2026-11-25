import { z } from 'zod';
import { AppError } from './errors.js';
import { digest } from './projects.js';
import { idempotencyKey, instantView, limit, parse, requiredText, searchText, text, uuid } from './validation.js';

// decision = confirmed decision; open_question = decision still pending; fact, preference, note.
export const NOTE_KINDS = ['decision', 'open_question', 'fact', 'preference', 'note'];

export const noteInput = z.object({
  kind: z.enum(NOTE_KINDS),
  content: requiredText(4000),
  project_id: uuid.optional(),
  course_id: uuid.optional(),
  source: text(200).optional(),
  idempotency_key: idempotencyKey.optional(),
}).strict();

export const noteSearchInput = z.object({
  query: searchText.optional(),
  kind: z.enum(NOTE_KINDS).optional(),
  project_id: uuid.optional(),
  course_id: uuid.optional(),
  include_inactive: z.boolean().optional(),
  limit: limit.optional(),
}).strict();

// "Forget" is status = inactive: reversible, and nothing is physically deleted.
export const noteUpdateInput = z.object({
  note_id: uuid,
  content: requiredText(4000).optional(),
  kind: z.enum(NOTE_KINDS).optional(),
  status: z.enum(['active', 'inactive']).optional(),
}).strict().refine(input => Object.keys(input).length > 1, 'nothing_to_update');

export function noteView(row) {
  return {
    id: row.id, project_id: row.project_id ?? null, course_id: row.course_id ?? null, kind: row.kind, content: row.content,
    source: row.source, status: row.status,
    created_at: instantView(row.created_at), updated_at: instantView(row.updated_at),
  };
}

export function createNoteService(repository, clock = Date.now) {
  return {
    async create(owner, input) {
      const data = parse(noteInput, input, 'invalid_note');
      const fields = { kind: data.kind, content: data.content, project_id: data.project_id ?? null,
        source: data.source ?? '' };
      if (data.course_id) fields.course_id = data.course_id;
      const requestHash = await digest(JSON.stringify(fields));
      const row = await repository.createNote({ id: crypto.randomUUID(), owner_id: owner, ...fields,
        idempotency_key: data.idempotency_key ?? null, request_hash: requestHash }, new Date(clock()));
      if (!row) {
        const courseMissing = data.course_id && !await repository.getCourse(owner, data.course_id);
        throw new AppError(404, courseMissing ? 'course_not_found' : 'project_not_found');
      }
      if (row.request_hash !== requestHash) throw new AppError(409, 'idempotency_conflict');
      return noteView(row);
    },
    async search(owner, input = {}) {
      const { query = null, kind = null, project_id = null, course_id = null, include_inactive = false, limit: max = 50 } =
        parse(noteSearchInput, input, 'invalid_note_filter');
      const rows = await repository.searchNotes(owner, { query, kind, project_id, course_id, include_inactive, limit: max + 1 });
      return { notes: rows.slice(0, max).map(noteView), truncated: rows.length > max };
    },
    async update(owner, input) {
      const { note_id, ...changes } = parse(noteUpdateInput, input, 'invalid_note_update');
      const row = await repository.updateNote(owner, note_id, changes, new Date(clock()));
      if (!row) throw new AppError(404, 'note_not_found');
      return noteView(row);
    },
  };
}

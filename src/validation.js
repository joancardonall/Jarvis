import { z } from 'zod';
import { AppError } from './errors.js';

// Shared input rules. Every MCP tool and HTTP route validates with these schemas on the server,
// whatever the client (or the model) claims to have checked.
export const PRIORITIES = ['low', 'normal', 'high'];
export const TIME_ZONE = 'Europe/Madrid';

export const uuid = z.string().uuid();
export const idempotencyKey = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);
export const priority = z.enum(PRIORITIES);
export const limit = z.number().int().min(1).max(200);
// PostgreSQL text cannot contain the NUL character; reject it here instead of failing in the database.
const noNul = value => !value.includes('\u0000');
export const text = max => z.string().max(max).refine(noNul);
export const requiredText = max => z.string().min(1).max(max).refine(value => noNul(value) && value.trim().length > 0);
export const searchText = z.string().min(1).max(100).refine(noNul);

// Calendar date "YYYY-MM-DD" (no time, no time zone): a due date means "that day in Madrid".
// Impossible dates such as 2026-02-30 are rejected instead of silently rolling over.
// Years are limited to 1900-2999: enough for any real use and safe for date arithmetic and storage.
export const calendarDate = z.string().regex(/^(19|2\d)\d{2}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'invalid_date');

export function parse(schema, input, code) {
  const result = schema.safeParse(input);
  if (!result.success) throw new AppError(422, code);
  return result.data;
}

// Today's date in Madrid for a given instant. Daylight saving time is handled by Intl.
export function madridDate(now) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(now));
}

export function addDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

// PostgreSQL returns `date` columns as text through the Neon driver and as Date objects through pg.
export function dateView(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    return `${String(value.getFullYear()).padStart(4, '0')}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  return String(value).slice(0, 10);
}

export const instantView = value => (value === null || value === undefined ? null : new Date(value).toISOString());

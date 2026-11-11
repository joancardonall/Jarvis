import { neon } from '@neondatabase/serverless';

// Shared parameterized SQL is also exercised against real PostgreSQL in integration tests.
export const CREATE_PROJECT = `
  INSERT INTO projects (id, owner_id, name, description, idempotency_key, request_hash)
  VALUES ($1, $2, $3, $4, $5, $6)
  ON CONFLICT (owner_id, idempotency_key) DO UPDATE
  SET idempotency_key = projects.idempotency_key
  RETURNING *`;
export const GET_PROJECT = 'SELECT * FROM projects WHERE owner_id = $1 AND id = $2';
export const createValues = data => [data.id, data.owner_id, data.name, data.description,
  data.idempotency_key, data.request_hash];

export function neonRepository(url) {
  if (!url || !url.startsWith('postgres')) throw new Error('Database not configured');
  const sql = neon(url);
  return {
    async create(data) {
      // The conflict path locks the existing row and returns its original fingerprint.
      // All persisted creation state lives in this row: no partial second record is possible.
      const [rows] = await sql.transaction([sql.query(CREATE_PROJECT, createValues(data))], {
        fetchOptions: { signal: AbortSignal.timeout(10000) },
      });
      return rows[0];
    },
    async get(owner, id) {
      const rows = await sql.query(GET_PROJECT, [owner, id], { fetchOptions: { signal: AbortSignal.timeout(10000) } });
      return rows[0];
    },
  };
}

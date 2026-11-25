import { neon } from '@neondatabase/serverless';
import { domainOperations } from './domain-repository.js';

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


// OAuth grants: one row per authorized client connection. Only SHA-256 hashes of codes and
// tokens are stored. The current time is always a parameter so behaviour is testable.
export const CREATE_GRANT = `
  INSERT INTO oauth_grants (id, owner_id, client_hash, redirect_uri, code_hash, code_challenge, code_expires_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7)`;
export const FIND_GRANT_BY_CODE = 'SELECT * FROM oauth_grants WHERE code_hash = $1';
// Single use is enforced here: the row matches only while the code has never been used.
export const REDEEM_CODE = `
  UPDATE oauth_grants
  SET code_used_at = $2, access_hash = $3, access_expires_at = $4, refresh_hash = $5, refresh_expires_at = $6
  WHERE code_hash = $1 AND code_used_at IS NULL AND revoked_at IS NULL AND code_expires_at > $2
  RETURNING id`;
export const FIND_GRANT_BY_ACCESS = `
  SELECT id, owner_id FROM oauth_grants
  WHERE access_hash = $1 AND access_expires_at > $2 AND revoked_at IS NULL`;
// Normal renewal: the presented refresh token is the current one and becomes the previous one.
export const ROTATE_REFRESH = `
  UPDATE oauth_grants
  SET previous_refresh_hash = refresh_hash, superseded_refresh_hash = NULL, refresh_rotated_at = $2,
      refresh_hash = $3, refresh_expires_at = $4, access_hash = $5, access_expires_at = $6
  WHERE refresh_hash = $1 AND client_hash = $7 AND revoked_at IS NULL AND refresh_expires_at > $2
  RETURNING id`;
// Retry shortly after a renewal whose response was lost: the previous token is accepted exactly
// once more. The token it replaces is remembered as superseded, so that if both the retry and
// the original response end up being used (two holders), the next statement detects it.
export const ROTATE_REFRESH_RETRY = `
  UPDATE oauth_grants
  SET superseded_refresh_hash = refresh_hash, refresh_hash = $3, refresh_expires_at = $4,
      access_hash = $5, access_expires_at = $6
  WHERE previous_refresh_hash = $1 AND superseded_refresh_hash IS NULL AND client_hash = $7
    AND revoked_at IS NULL AND refresh_expires_at > $2 AND refresh_rotated_at > $8
  RETURNING id`;
// Any other use of an already replaced refresh token is treated as theft: revoke the connection.
export const REVOKE_REUSED_REFRESH = `
  UPDATE oauth_grants SET revoked_at = $2
  WHERE (previous_refresh_hash = $1 OR superseded_refresh_hash = $1) AND revoked_at IS NULL`;
export const REVOKE_GRANT = 'UPDATE oauth_grants SET revoked_at = $2 WHERE id = $1 AND revoked_at IS NULL';

export const grantValues = grant => [grant.id, grant.owner_id, grant.client_hash, grant.redirect_uri,
  grant.code_hash, grant.code_challenge, grant.code_expires_at];
export const redeemValues = (codeHash, tokens, now) => [codeHash, now, tokens.access_hash,
  tokens.access_expires_at, tokens.refresh_hash, tokens.refresh_expires_at];
export const rotateValues = (refreshHash, clientHash, tokens, now) => [refreshHash, now, tokens.refresh_hash,
  tokens.refresh_expires_at, tokens.access_hash, tokens.access_expires_at, clientHash];

// The OAuth storage operations, written once for any function that runs a parameterized query
// and returns rows. Production passes Neon; integration tests pass a real PostgreSQL pool.
export function grantOperations(run) {
  // Timestamps travel as ISO 8601 text, which PostgreSQL reads without timezone ambiguity.
  const query = (text, values) => run(text, values.map(value => value instanceof Date ? value.toISOString() : value));
  return {
    async createGrant(grant) { await query(CREATE_GRANT, grantValues(grant)); },
    async findGrantByCode(codeHash) { return (await query(FIND_GRANT_BY_CODE, [codeHash]))[0]; },
    async redeemCode(codeHash, tokens, now) {
      return (await query(REDEEM_CODE, redeemValues(codeHash, tokens, now))).length === 1;
    },
    async findGrantByAccess(accessHash, now) { return (await query(FIND_GRANT_BY_ACCESS, [accessHash, now]))[0]; },
    async rotateRefresh(refreshHash, clientHash, tokens, now, retryLimit) {
      const values = rotateValues(refreshHash, clientHash, tokens, now);
      if ((await query(ROTATE_REFRESH, values)).length === 1) return true;
      if ((await query(ROTATE_REFRESH_RETRY, [...values, retryLimit])).length === 1) return true;
      await query(REVOKE_REUSED_REFRESH, [refreshHash, now]);
      return false;
    },
    async revokeGrant(id, now) { await query(REVOKE_GRANT, [id, now]); },
  };
}

export function neonRepository(url) {
  if (!url || !url.startsWith('postgres')) throw new Error('Database not configured');
  const sql = neon(url);
  const query = (text, values) => sql.query(text, values, { fetchOptions: { signal: AbortSignal.timeout(10000) } });
  return {
    ...grantOperations(query),
    ...domainOperations(query),
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

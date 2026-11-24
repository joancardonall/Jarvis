BEGIN;

-- One row per authorized client connection (for example, Claude web connected to Jarvis).
-- Codes and tokens are never stored: only their SHA-256, so a database leak grants no access.
CREATE TABLE oauth_grants (
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL,
    client_hash char(64) NOT NULL CHECK (client_hash ~ '^[a-f0-9]{64}$'),
    redirect_uri varchar(300) NOT NULL,
    code_hash char(64) NOT NULL UNIQUE CHECK (code_hash ~ '^[a-f0-9]{64}$'),
    code_challenge char(43) NOT NULL CHECK (code_challenge ~ '^[A-Za-z0-9_-]{43}$'),
    code_expires_at timestamptz NOT NULL,
    code_used_at timestamptz,
    access_hash char(64) UNIQUE CHECK (access_hash ~ '^[a-f0-9]{64}$'),
    access_expires_at timestamptz,
    refresh_hash char(64) UNIQUE CHECK (refresh_hash ~ '^[a-f0-9]{64}$'),
    previous_refresh_hash char(64) UNIQUE CHECK (previous_refresh_hash ~ '^[a-f0-9]{64}$'),
    superseded_refresh_hash char(64) UNIQUE CHECK (superseded_refresh_hash ~ '^[a-f0-9]{64}$'),
    refresh_rotated_at timestamptz,
    refresh_expires_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- The runtime role needs SELECT, INSERT and UPDATE on this table; never DELETE or DDL.
COMMIT;

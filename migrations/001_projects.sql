BEGIN;

CREATE TABLE projects (
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL,
    name varchar(200) NOT NULL CHECK (char_length(btrim(name)) > 0),
    description varchar(2000) NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'active' CHECK (status = 'active'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    idempotency_key varchar(128) CHECK (idempotency_key ~ '^[A-Za-z0-9._:-]{1,128}$'),
    request_hash char(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
    UNIQUE (owner_id, idempotency_key)
);

-- PostgreSQL permits multiple NULL keys. Idempotency state is retained with the project.
-- Use a dedicated runtime role, never the migration/table owner.
COMMIT;

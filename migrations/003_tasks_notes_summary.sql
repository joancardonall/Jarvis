BEGIN;

-- Projects can now be paused, completed or archived, have a priority and a review date
-- ("park it until January"). last_activity_at feeds the follow-up rules of the daily summary.
ALTER TABLE projects DROP CONSTRAINT projects_status_check;
ALTER TABLE projects
    ADD CONSTRAINT projects_status_check CHECK (status IN ('active', 'paused', 'completed', 'archived')),
    ADD COLUMN priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
    ADD COLUMN review_at date,
    -- "Do not remind me about this until that day": hides the project from follow-ups.
    ADD COLUMN snoozed_until date,
    ADD COLUMN last_activity_at timestamptz NOT NULL DEFAULT now(),
    -- Lets tasks and notes reference (project, owner) so the database itself guarantees that
    -- nothing can be attached to another owner's project.
    ADD CONSTRAINT projects_id_owner_unique UNIQUE (id, owner_id);
UPDATE projects SET last_activity_at = updated_at;

CREATE TABLE tasks (
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL,
    project_id uuid,
    title varchar(300) NOT NULL CHECK (char_length(btrim(title)) > 0),
    notes varchar(4000) NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'cancelled')),
    priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
    due_date date,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    idempotency_key varchar(128) CHECK (idempotency_key ~ '^[A-Za-z0-9._:-]{1,128}$'),
    request_hash char(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
    UNIQUE (owner_id, idempotency_key),
    FOREIGN KEY (project_id, owner_id) REFERENCES projects (id, owner_id),
    CHECK ((status = 'done') = (completed_at IS NOT NULL))
);
CREATE INDEX tasks_owner_open_due ON tasks (owner_id, status, due_date);

-- Explicit memory: decisions, open questions, facts, preferences and notes, with provenance.
-- "Forget" deactivates (status = 'inactive'); rows are never deleted by the application.
CREATE TABLE notes (
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL,
    project_id uuid,
    kind text NOT NULL CHECK (kind IN ('decision', 'open_question', 'fact', 'preference', 'note')),
    content varchar(4000) NOT NULL CHECK (char_length(btrim(content)) > 0),
    source varchar(200) NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    idempotency_key varchar(128) CHECK (idempotency_key ~ '^[A-Za-z0-9._:-]{1,128}$'),
    request_hash char(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
    UNIQUE (owner_id, idempotency_key),
    FOREIGN KEY (project_id, owner_id) REFERENCES projects (id, owner_id)
);
CREATE INDEX notes_owner_status ON notes (owner_id, status, kind);

-- One row per owner and day: guarantees at most one daily summary sent, even if the
-- scheduler fires twice. A failed attempt can be claimed again.
CREATE TABLE summary_runs (
    owner_id uuid NOT NULL,
    summary_date date NOT NULL,
    status text NOT NULL CHECK (status IN ('sending', 'sent', 'skipped', 'failed')),
    attempts integer NOT NULL DEFAULT 1 CHECK (attempts > 0),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (owner_id, summary_date)
);

-- Runtime grants are applied by `npm run db:migrate` (scripts/db.js), never by the runtime role.
COMMIT;

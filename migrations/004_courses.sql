BEGIN;

-- University: a course (subject), its groups (theory, seminar, lab) with their teacher, schedule
-- and place. Deliverables are ordinary tasks linked to a course; academic context is ordinary
-- notes linked to a course. Nothing is deleted by the application: courses are archived.
CREATE TABLE courses (
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL,
    name varchar(200) NOT NULL CHECK (char_length(btrim(name)) > 0),
    code varchar(40) NOT NULL DEFAULT '',
    term varchar(60) NOT NULL DEFAULT '',
    notes varchar(4000) NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    idempotency_key varchar(128) CHECK (idempotency_key ~ '^[A-Za-z0-9._:-]{1,128}$'),
    request_hash char(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
    UNIQUE (owner_id, idempotency_key),
    UNIQUE (id, owner_id)
);

-- One row per (course, kind, label): saving the same group again updates it instead of
-- duplicating it, so a retried request is harmless without an idempotency key.
CREATE TABLE course_groups (
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL,
    course_id uuid NOT NULL,
    kind text NOT NULL CHECK (kind IN ('theory', 'seminar', 'lab', 'other')),
    label varchar(60) NOT NULL DEFAULT '',
    teacher varchar(200) NOT NULL DEFAULT '',
    schedule varchar(300) NOT NULL DEFAULT '',
    location varchar(200) NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (course_id, kind, label),
    FOREIGN KEY (course_id, owner_id) REFERENCES courses (id, owner_id)
);

-- Same double lock as projects: a task or note can only point to a course of its own owner.
ALTER TABLE tasks ADD COLUMN course_id uuid,
    ADD FOREIGN KEY (course_id, owner_id) REFERENCES courses (id, owner_id);
ALTER TABLE notes ADD COLUMN course_id uuid,
    ADD FOREIGN KEY (course_id, owner_id) REFERENCES courses (id, owner_id);
CREATE INDEX tasks_owner_course ON tasks (owner_id, course_id);

-- Runtime grants are applied by `npm run db:migrate` (scripts/db.js), never by the runtime role.
COMMIT;

# Model de dades

## Esquema del primer increment

Definit a `migrations/001_projects.sql`; aplicació i verificació real a
[CURRENT_STATE](CURRENT_STATE.md). Una taula `projects`:

| Camp | Tipus i regla |
| --- | --- |
| id | UUID, PK generada al servei |
| owner_id | UUID NOT NULL, derivat del token; sense taula d'usuaris |
| name | varchar(200), NOT NULL, no buit |
| description | varchar(2000), NOT NULL, per defecte buit |
| status | text, només `active` en aquest increment |
| created_at / updated_at | timestamptz, NOT NULL, per defecte now() |
| idempotency_key | varchar(128), nullable; format ASCII acotat |
| request_hash | SHA-256 hexadecimal, NOT NULL; contingut canònic validat |

UNIQUE(owner_id, idempotency_key) garanteix una sola fila per clau del propietari;
els NULL no es dedupliquen. La mateixa fila conserva projecte i idempotència.
El replay no modifica contingut ni dates. No hi ha retenció, eliminació o edició
implementades. Semàntica pública al [contracte API](API_CONTRACT.md).

## Connexions OAuth: `oauth_grants` (D023, implementat, migració no aplicada a Neon)

Definida a `migrations/002_oauth_grants.sql`. Un **grant** és una connexió autoritzada:
cada cop que l'usuari aprova un client (per exemple, Claude web) amb GitHub es crea una
fila, que acompanya aquella connexió des del codi d'un sol ús fins als tokens renovats.
Flux complet a [ARCHITECTURE](ARCHITECTURE.md).

| Camp | Tipus i regla |
| --- | --- |
| id | UUID, PK generada al servidor |
| owner_id | UUID NOT NULL; sempre `DEV_OWNER_ID`, sense taula d'usuaris |
| client_hash | char(64) NOT NULL, SHA-256 del `client_id` |
| redirect_uri | varchar(300) NOT NULL, adreça de retorn registrada |
| code_hash | char(64) NOT NULL UNIQUE, SHA-256 del codi d'autorització |
| code_challenge | char(43) NOT NULL, repte PKCE S256 |
| code_expires_at / code_used_at | timestamptz; caducitat (60 s) i ús únic del codi |
| access_hash / access_expires_at | char(64) UNIQUE nullable; access token vigent (1 h) |
| refresh_hash / refresh_expires_at | char(64) UNIQUE nullable; refresh token vigent (30 dies) |
| previous_refresh_hash / refresh_rotated_at | char(64) UNIQUE nullable; token anterior a la rotació i quan es va fer |
| superseded_refresh_hash | char(64) UNIQUE nullable; token substituït per un reintent, per detectar dos posseïdors |
| revoked_at | timestamptz nullable; connexió revocada |
| created_at | timestamptz NOT NULL, per defecte now() |

Els hashes són SHA-256 hexadecimals validats amb `CHECK`. **Mai es desen codis ni tokens
en clar**: Jarvis només necessita comparar el hash del que rep, i així una còpia filtrada
de la BD no dona accés. No hi ha taula de clients (el `client_id` és un registre signat)
ni d'usuaris.

El rol runtime té `SELECT, INSERT, UPDATE` sobre la taula, mai `DELETE`; ho concedeix
`npm run db:migrate` i ho comprova `npm run db:verify`. Per això les files no s'esborren:
la neteja de files caducades queda pendent, no implementada. La taula **no entra** a la
còpia lògica (`db:backup`/`db:restore` només cobreixen `projects` i apliquen 001); després
d'una restauració cal tornar a executar `db:migrate` i tornar a connectar els clients.

## Metadades operatives de migració

`jarvis_migrations`: version (PK), sha256 i applied_at. Només accessible al rol
migrador, no al runtime. `npm run db:migrate` aplica 001 i les migracions posteriors
(ara 002) i registra cada revisió amb el seu checksum atòmicament amb l'esquema.
No és una funcionalitat d'usuari.
Còpia/restauració a [DEVELOPMENT](DEVELOPMENT.md), decisions D018–D019.

## Model conceptual futur (no implementat)


## Nucli proposat

- `projects`: id, name, description, status (`active|paused|completed|archived`), priority, review_after, created_at, updated_at.
- `tasks`: id, project_id nullable, title, status, priority, due_at nullable, next_review_at nullable, blocked_reason nullable, updated_at.
- `decisions`: id, project_id nullable, summary, status (`proposed|confirmed|superseded`), decided_at, source, supersedes_id nullable.
- `knowledge_items`: id, type, title nullable, content, source, confidence/status, valid_from/to nullable, created_at, updated_at.
- `activity_events`: id, entity_type, entity_id, action, timestamp, actor, correlation_id, sanitized_changes. Útil per seguiment i auditories.
- `reminder_state`: subject_type, subject_id, last_sent_at, snoozed_until, next_eligible_at. Evita soroll.
- `external_links`: provider, external_id, entity_type, entity_id, sync_timestamp. No duplicar calendaris sense necessitat.
- `notification_deliveries`: idempotency_key, channel, status, sent_at, error.

## Extensions posteriors

- Universitat: `courses`, `course_groups`, `instructors`, `course_instructors`, `assignments` (o tasques vinculades a assignatures).
- Entrenaments: `exercises`, `routines`, `routine_exercises`, `workout_sessions`, `workout_exercises`, `sets`. Conservar unitats, ordre, temps i historial; no sobreescriure sessions passades.
- Garmin: `external_activities` i mètriques tipades, amb timestamps i procedència; no definir fins a conèixer els camps realment disponibles.

## Regles

- Identificadors UUID/ULID; timestamps UTC i presentació en zona local.
- Tota dada procedent d'IA ha de tenir procedència i distingir fet, proposta i inferència.
- Operacions d'escriptura amb validació i idempotència quan correspongui.
- No modelar tot com a `memories` genèriques: les tasques, dates i estats necessiten estructura.
- No exposar SQL lliure via MCP.
- Definir política de còpies de seguretat, exportació i eliminació abans de dades sensibles.

## Pendent de decidir

Per a ampliacions: cerca, retenció, eliminació, procedència detallada i models específics. Motor i autenticació inicials aprovats a D011–D014; no crear les taules conceptuals anticipadament.

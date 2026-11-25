# Model de dades

Estat d'aplicació i verificació a [CURRENT_STATE](CURRENT_STATE.md); semàntica pública
als contractes [API](API_CONTRACT.md) i [MCP](MCP_CONTRACT.md).

**Estat:** `projects` (001) i `oauth_grants` (002) són a Neon i el Worker públic les fa
servir. La migració `003_tasks_notes_summary.sql` (D024–D026) està **implementada i
provada amb PostgreSQL local** (inclòs el rol runtime), però **no aplicada a Neon**.

## Projectes: `projects`

Creada a `migrations/001_projects.sql` i ampliada a `003`:

| Camp | Tipus i regla |
| --- | --- |
| id | UUID, PK generada al servei |
| owner_id | UUID NOT NULL, derivat del token; sense taula d'usuaris |
| name | varchar(200), NOT NULL, no buit |
| description | varchar(2000), NOT NULL, per defecte buit |
| status | text: `active` (en creació), `paused`, `completed`, `archived` (003) |
| priority | text NOT NULL: `low`, `normal` (per defecte), `high` (003) |
| review_at | date nullable: dia en què un projecte pausat torna a aparèixer (003) |
| snoozed_until | date nullable: «no m'ho recordis fins a X» (003) |
| last_activity_at | timestamptz NOT NULL: última edició del projecte o de les seves tasques/notes (003) |
| created_at / updated_at | timestamptz, NOT NULL, per defecte now() |
| idempotency_key | varchar(128), nullable; format ASCII acotat |
| request_hash | SHA-256 hexadecimal, NOT NULL; contingut canònic validat |

UNIQUE(owner_id, idempotency_key) garanteix una sola fila per clau del propietari;
els NULL no es dedupliquen. La mateixa fila conserva projecte i idempotència.
El replay no modifica contingut ni dates. 003 afegeix `UNIQUE (id, owner_id)`, necessari
per a la clau forana composta (vegeu més avall). En canviar a un estat diferent de
`paused`, el servei esborra `review_at`. Els projectes no s'esborren: s'arxiven.
En aplicar 003, `last_activity_at` s'omple amb l'`updated_at` de cada projecte existent.

## Tasques: `tasks` (003)

| Camp | Tipus i regla |
| --- | --- |
| id | UUID, PK generada al servei |
| owner_id | UUID NOT NULL, derivat del token |
| project_id | UUID nullable; tasca solta si és NULL |
| title | varchar(300) NOT NULL, no buit |
| notes | varchar(4000) NOT NULL, per defecte buit |
| status | text: `open` (per defecte), `done`, `cancelled` |
| priority | text: `low`, `normal` (per defecte), `high` |
| due_date | date nullable: dia de venciment, sense hora |
| completed_at | timestamptz nullable; el posa el servidor en passar a `done` i l'esborra si es reobre |
| created_at / updated_at | timestamptz NOT NULL |
| idempotency_key / request_hash | com a `projects`; UNIQUE(owner_id, idempotency_key) |

Un `CHECK` garanteix que `completed_at` existeix si i només si `status = 'done'`.
Les tasques no s'esborren: es cancel·len. Índex `(owner_id, status, due_date)` per als
llistats i el resum.

## Notes (memòria explícita): `notes` (003)

| Camp | Tipus i regla |
| --- | --- |
| id | UUID, PK generada al servei |
| owner_id | UUID NOT NULL, derivat del token |
| project_id | UUID nullable |
| kind | text: `decision` (confirmada), `open_question` (decisió pendent), `fact`, `preference`, `note` |
| content | varchar(4000) NOT NULL, no buit |
| source | varchar(200) NOT NULL, per defecte buit: d'on ve la informació |
| status | text: `active` (per defecte) o `inactive` |
| created_at / updated_at | timestamptz NOT NULL |
| idempotency_key / request_hash | com a `projects`; UNIQUE(owner_id, idempotency_key) |

**Oblidar = desactivar.** «Oblida X» posa `status = 'inactive'`: la nota deixa de sortir a
les cerques i al resum, però no s'esborra i es pot recuperar tornant-la a `active`.
L'esborrat definitiu no existeix encara i depèn de la política de dades personals pendent.

## Registre del resum diari: `summary_runs` (003)

| Camp | Tipus i regla |
| --- | --- |
| owner_id + summary_date | PK composta: una fila per propietari i dia (data de Madrid) |
| status | text: `sending`, `sent`, `skipped` (res a dir, no s'envia), `failed` (rebutjat per Telegram, es pot reintentar), `unknown` (sense resposta, no es reintenta) |
| attempts | integer NOT NULL, per defecte 1; com a màxim 3 intents al dia |
| updated_at | timestamptz NOT NULL |

És estat operatiu, no dades de l'usuari: garanteix com a màxim un missatge de Telegram al
dia encara que el cron es dispari diversos cops. Funcionament a
[ARCHITECTURE](ARCHITECTURE.md) i regles a [AUTOMATIONS](AUTOMATIONS.md).

## Dates de calendari i instants

Hi ha dos tipus de temps i no es barregen:

- **Instants** (`timestamptz`: `created_at`, `last_activity_at`, `completed_at`…): un moment
  exacte, desat en UTC i retornat en ISO 8601 amb `Z`.
- **Dates de calendari** (`date`: `due_date`, `review_at`, `snoozed_until`, `summary_date`):
  un dia, sense hora ni zona horària, en format `YYYY-MM-DD`.

Una data de venciment és «aquell dia», no «aquell dia a les 00:00 UTC». Si es desés com a
instant, una tasca per al dia 20 podria aparèixer com a dia 19 segons la zona de qui la
llegeix. Per això `due_date` és `date` i «avui» el calcula el servidor a **Europe/Madrid**
(`madridDate` de `src/validation.js`, amb el canvi d'hora resolt per `Intl`). Exemple:
a les 00:30 del 21 de novembre a Madrid (23:30 UTC del 20), una tasca amb `due_date`
2026-11-20 ja és vençuda. Les dates impossibles (2026-02-30) es rebutgen. Només hi ha una zona horària.

## Clau forana composta

`tasks` i `notes` declaren `FOREIGN KEY (project_id, owner_id) REFERENCES projects (id,
owner_id)`. Una **clau forana** és una regla de la BD que impedeix apuntar a una fila que no
existeix. En incloure `owner_id`, el projecte ha de ser també del mateix propietari: la BD
mateixa rebutja lligar una tasca al projecte d'un altre, encara que el codi s'equivoqués.
Si `project_id` és NULL, la regla no s'aplica (tasca o nota sense projecte). Les consultes
també filtren per propietari; vegeu [ARCHITECTURE](ARCHITECTURE.md).

## Connexions OAuth: `oauth_grants` (D023, desplegat i verificat)

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

## Permisos del rol runtime

El Worker es connecta amb el rol `jarvis_runtime`, que ho concedeix `npm run db:migrate` i
ho comprova `npm run db:verify`. Mai té `DELETE` ni pot canviar l'esquema (DDL). A partir
de 003 els permisos d'actualització són **per columnes**: només pot modificar els camps
editables.

| Taula | `UPDATE` permès sobre |
| --- | --- |
| projects | idempotency_key, name, description, status, priority, review_at, snoozed_until, updated_at, last_activity_at |
| tasks | idempotency_key, title, notes, status, priority, due_date, project_id, completed_at, updated_at |
| notes | idempotency_key, content, kind, status, updated_at |
| summary_runs | status, attempts, updated_at |
| oauth_grants | totes (taula sencera) |

Totes tenen `SELECT` i `INSERT`. Així, ni amb un error de codi el runtime pot canviar
`owner_id`, `id`, `created_at` o `request_hash` d'una fila. Provat amb PostgreSQL local
(`npm run test:ops`, permisos negatius inclosos); no aplicat a Neon.

Com que no hi ha `DELETE`, les files d'`oauth_grants` caducades no s'esborren: la neteja
queda pendent, no implementada.

## Còpia lògica (format 2)

`npm run db:backup` desa `projects`, `tasks` i `notes` en un fitxer nou
`backups/jarvis-<data>.json` (mai en sobreescriu cap); `npm run db:restore` restaura l'últim
en una BD buida i reconstrueix l'esquema 001–003. **Fora de la còpia:** `oauth_grants` i
`summary_runs`, perquè són estat operatiu; després de restaurar cal tornar a executar
`db:migrate` i tornar a connectar els clients. El format 1 antic (`backups/projects.json`)
ja no es pot restaurar amb aquest codi. Procediment a [DEVELOPMENT](DEVELOPMENT.md).

## Metadades operatives de migració

`jarvis_migrations`: version (PK), sha256 i applied_at. Només accessible al rol
migrador, no al runtime. `npm run db:migrate` aplica 001 i les migracions posteriors
(002 i 003) i registra cada revisió amb el seu checksum atòmicament amb l'esquema.
No és una funcionalitat d'usuari. A Neon hi ha aplicades 001 i 002; 003 és pendent.
Còpia/restauració a [DEVELOPMENT](DEVELOPMENT.md), decisions D018–D019 i D026.

## Model conceptual futur (no implementat)

Ja existeixen projectes amb estat i prioritat, tasques, decisions i preguntes obertes (com
a `notes`), memòria explícita i el registre d'enviaments del resum. Queda com a proposta:

- `activity_events`: historial d'accions (entitat, acció, moment, actor, canvis sanejats).
  Ara només es guarda `last_activity_at`.
- `reminder_state`: període mínim entre avisos del mateix tema. Ara només hi ha
  `snoozed_until` i el límit d'un resum al dia.
- `external_links`: provider, external_id, entity_type, entity_id, sync_timestamp. No
  duplicar calendaris sense necessitat.
- Decisions que en substitueixen d'altres (`supersedes_id`) i vigència (`valid_from/to`).
- Tasques amb bloqueig (`blocked_reason`) o revisió pròpia (`next_review_at`).

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

Retenció, eliminació definitiva i exportació per l'usuari (política de dades personals),
cerca més enllà del text literal, paginació, diverses zones horàries i models específics.
No crear les taules conceptuals anticipadament.

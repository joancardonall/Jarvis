# Model de dades

Estat d'aplicació i verificació a [CURRENT_STATE](CURRENT_STATE.md); semàntica pública
als contractes [API](API_CONTRACT.md) i [MCP](MCP_CONTRACT.md).

**Estat:** les migracions 001–003 (`projects`, `oauth_grants`, `tasks`, `notes`,
`summary_runs`) són **aplicades a Neon** i les fa servir el Worker publicat (003 des del
2026-11-25). La migració `004_courses.sql` (D028: `courses`, `course_groups` i `course_id`
a tasques i notes) està **aplicada a Neon** des del 2026-11-25 (permisos runtime verificats
amb `db:verify`) i la fa servir el Worker publicat.

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
| course_id | UUID nullable; assignatura de la tasca (004). Pot tenir projecte, assignatura, tots dos o cap |
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
llistats i el resum, i `(owner_id, course_id)` (004) per als lliuraments d'una assignatura.

## Notes (memòria explícita): `notes` (003)

| Camp | Tipus i regla |
| --- | --- |
| id | UUID, PK generada al servei |
| owner_id | UUID NOT NULL, derivat del token |
| project_id | UUID nullable |
| course_id | UUID nullable; assignatura de la nota (004). No es pot canviar després |
| kind | text: `decision` (confirmada), `open_question` (decisió pendent), `fact`, `preference`, `note` |
| content | varchar(4000) NOT NULL, no buit |
| source | varchar(200) NOT NULL, per defecte buit: d'on ve la informació |
| status | text: `active` (per defecte) o `inactive` |
| created_at / updated_at | timestamptz NOT NULL |
| idempotency_key / request_hash | com a `projects`; UNIQUE(owner_id, idempotency_key) |

**Oblidar = desactivar.** «Oblida X» posa `status = 'inactive'`: la nota deixa de sortir a
les cerques i al resum, però no s'esborra i es pot recuperar tornant-la a `active`.
L'esborrat definitiu només el fa el desenvolupador amb la purga (vegeu
[Cicle de vida de les dades](#cicle-de-vida-de-les-dades)).

## Assignatures: `courses` (004, D028)

| Camp | Tipus i regla |
| --- | --- |
| id | UUID, PK generada al servei |
| owner_id | UUID NOT NULL, derivat del token |
| name | varchar(200) NOT NULL, no buit (p. ex. «Sistemes Operatius») |
| code | varchar(40) NOT NULL, per defecte buit (codi oficial de l'assignatura) |
| term | varchar(60) NOT NULL, per defecte buit; text lliure, p. ex. «2026-27 T1» |
| notes | varchar(4000) NOT NULL, per defecte buit |
| status | text: `active` (per defecte) o `archived` |
| created_at / updated_at | timestamptz NOT NULL |
| idempotency_key / request_hash | com a `projects`; UNIQUE(owner_id, idempotency_key) |

També `UNIQUE (id, owner_id)` per a les claus foranes compostes. Les assignatures no
s'esborren: s'arxiven.

## Grups d'assignatura: `course_groups` (004, D028)

| Camp | Tipus i regla |
| --- | --- |
| id | UUID, PK generada al servei |
| owner_id | UUID NOT NULL, derivat del token |
| course_id | UUID NOT NULL; clau forana composta `(course_id, owner_id)` → `courses` |
| kind | text: `theory`, `seminar`, `lab` o `other` |
| label | varchar(60) NOT NULL, per defecte buit (p. ex. «S102») |
| teacher | varchar(200) NOT NULL, per defecte buit |
| schedule | varchar(300) NOT NULL, per defecte buit; text lliure, sense model d'horari |
| location | varchar(200) NOT NULL, per defecte buit |
| status | text: `active` (per defecte) o `inactive` |
| created_at / updated_at | timestamptz NOT NULL |

`UNIQUE (course_id, kind, label)`: un grup s'identifica per assignatura, tipus i etiqueta.
Tornar-lo a desar l'actualitza en lloc de duplicar-lo (*upsert* per clau natural,
explicat a [ARCHITECTURE](ARCHITECTURE.md)); per això no té clau d'idempotència.

**Lliuraments i exàmens són tasques** amb `course_id` (tenen venciment, estat i surten al
resum), i **el context acadèmic són notes** amb `course_id` (p. ex. «l'examen final val el
40%»). Així no calen taules noves per a cada cosa. No hi ha model d'horari estructurat,
professorat com a entitat ni qualificacions.

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
owner_id)` i, des de 004, el mateix amb `(course_id, owner_id)` → `courses`; els grups
apunten igual a la seva assignatura. Una **clau forana** és una regla de la BD que impedeix apuntar a una fila que no
existeix. En incloure `owner_id`, el projecte ha de ser també del mateix propietari: la BD
mateixa rebutja lligar una tasca al projecte d'un altre, encara que el codi s'equivoqués.
Si `project_id` o `course_id` és NULL, la regla no s'aplica (tasca o nota sense projecte o
sense assignatura). Les consultes
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
| tasks | idempotency_key, title, notes, status, priority, due_date, project_id, course_id (004), completed_at, updated_at |
| notes | idempotency_key, content, kind, status, updated_at |
| summary_runs | status, attempts, updated_at |
| courses (004) | idempotency_key, name, code, term, notes, status, updated_at |
| course_groups (004) | teacher, schedule, location, status, updated_at |
| oauth_grants | totes (taula sencera) |

Totes tenen `SELECT` i `INSERT`. Així, ni amb un error de codi el runtime pot canviar
`owner_id`, `id`, `created_at` o `request_hash` d'una fila, ni el `course_id`, `kind` o
`label` d'un grup (canviar-los en faria un altre grup). Els permisos de 001–004 estan
aplicats a Neon (verificat amb `db:verify`); els permisos negatius s'han provat amb
PostgreSQL local (`npm run test:ops`).

Com que el runtime no té `DELETE`, les files d'`oauth_grants` caducades o revocades només
s'esborren amb la purga del desenvolupador (secció següent).

## Cicle de vida de les dades

Proposta de D027 amb valors per defecte implementats; la confirmació de l'usuari és
pendent. Mentrestant, només dades fictícies.

1. **Actiu:** l'estat normal.
2. **Descartat:** a l'aplicació (API, MCP, model) res s'esborra; es descarta: nota
   `inactive`, tasca `cancelled`, projecte o assignatura `archived`, grup `inactive`. És
   reversible.
3. **Purgat:** passat el període de retenció (30 dies per defecte, comptats des
   d'`updated_at`), el desenvolupador pot esborrar-ho definitivament amb
   `npm run data:purge`, amb el rol migrador, mai el Worker. Per defecte només
   **previsualitza** (executa tot en una transacció, la desfà i mostra el recompte per
   taula); només esborra amb `--confirm`, que exigeix indicar `--days N` explícitament. `--days 0`
   purga tot el que ja està descartat. Un argument mal escrit atura l'ordre.

Què esborra la purga, si el descart té més de N dies:

| Taula | S'esborra |
| --- | --- |
| notes | `inactive`, i totes les d'un projecte o assignatura que es purga |
| tasks | `cancelled` (les `done` es conserven com a historial), i totes les d'un projecte o assignatura que es purga |
| course_groups | `inactive`, i tots els d'una assignatura que es purga |
| projects | `archived`, amb totes les seves tasques i notes |
| courses | `archived`, amb els seus grups, tasques i notes |
| oauth_grants | connexions revocades, caducades o amb un codi mai bescanviat |
| summary_runs | files de dies anteriors al límit |

**Excepció:** una tasca o nota que pertany alhora a una cosa que es purga i a una que
continua viva (p. ex. un projecte arxivat i una assignatura activa) **no s'esborra**: només
perd l'enllaç amb el que desapareix. L'ordre n'informa a part («only unlinked»).

No toca els fitxers de còpia: s'han d'esborrar a mà (recomanació: no conservar còpies de més
de 90 dies quan hi hagi dades reals). Les connexions es poden llistar
(`npm run oauth:connections`) i revocar (`npm run oauth:revoke -- <id>` o `-- --all`) sense
SQL. Contra Neon (2026-11-25) només s'ha executat la purga en previsualització (tot a 0, res
esborrat) i el llistat de connexions; `data:purge --confirm` i `oauth:revoke` s'han provat
només sobre PostgreSQL local. Ordres a [DEVELOPMENT](DEVELOPMENT.md) i riscos a
[SECURITY_PRIVACY](SECURITY_PRIVACY.md).

## Còpia lògica (format 3)

`npm run db:backup` desa `projects`, `courses`, `course_groups`, `tasks` i `notes` en un
fitxer nou `backups/jarvis-<data>.json` (mai en sobreescriu cap; en clar i privat);
`npm run db:restore` restaura l'últim en una BD buida i reconstrueix l'esquema. La
restauració és una sola transacció: si falla, la BD queda buida. **Fora de la còpia:**
`oauth_grants` i `summary_runs`, perquè són estat operatiu; després de restaurar cal tornar
a executar `db:migrate` i tornar a connectar els clients.

El **format 2** (abans de les assignatures) encara es pot restaurar: el que es va afegir
després pren el valor per defecte (sense assignatures, `course_id` buit). Requisit: que les
migracions amb què es va fer la còpia existeixin sense canvis. El format 1 antic
(`backups/projects.json`) ja no es pot restaurar. La còpia exigeix que la BD tingui totes
les migracions del codi: amb el codi de D028 cal migrar 004 abans de fer-ne. Format 3
provat amb PostgreSQL local; primera còpia format 3 de Neon feta el 2026-11-25 (restauració
de format 3 provada només en local). Procediment a
[DEVELOPMENT](DEVELOPMENT.md).

## Metadades operatives de migració

`jarvis_migrations`: version (PK), sha256 i applied_at. Només accessible al rol
migrador, no al runtime. `npm run db:migrate` aplica 001 i les migracions posteriors
(002, 003 i 004) i registra cada revisió amb el seu checksum atòmicament amb l'esquema.
No és una funcionalitat d'usuari. A Neon hi ha aplicades 001–004.
Còpia/restauració a [DEVELOPMENT](DEVELOPMENT.md), decisions D018–D019, D026 i D027.

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

- Universitat: `courses` i `course_groups` ja existeixen (004, desplegada) i els lliuraments són
  tasques vinculades. Queden fora: professorat com a entitat pròpia, horari estructurat i
  qualificacions.
- Entrenaments: `exercises`, `routines`, `routine_exercises`, `workout_sessions`, `workout_exercises`, `sets`. Conservar unitats, ordre, temps i historial; no sobreescriure sessions passades.
- Garmin: `external_activities` i mètriques tipades, amb timestamps i procedència; no definir fins a conèixer els camps realment disponibles.

## Regles

- Identificadors UUID/ULID; timestamps UTC i presentació en zona local.
- Tota dada procedent d'IA ha de tenir procedència i distingir fet, proposta i inferència.
- Operacions d'escriptura amb validació i idempotència quan correspongui.
- No modelar tot com a `memories` genèriques: les tasques, dates i estats necessiten estructura.
- No exposar SQL lliure via MCP.
- No guardar contrasenyes, credencials, dades bancàries, de salut ni dades sensibles de
  tercers (proposta D027).

## Pendent de decidir

Confirmació de la política de dades personals (D027: retenció de 30 dies, còpies de 90),
cerca més enllà del text literal, paginació, diverses zones horàries i models específics.
No crear les taules conceptuals anticipadament.

# Contracte API

Estat de verificació a [CURRENT_STATE](CURRENT_STATE.md). Seguretat i credencials a
[SECURITY_PRIVACY](SECURITY_PRIVACY.md); dades a [DATA_MODEL](DATA_MODEL.md).

**Estat:** les rutes de projectes, tasques, notes i resum diari (D011–D014 i D024–D026)
estan **desplegades** al Worker públic des del 2026-11-25. Les rutes d'assignatures i
d'exportació i el camp `course_id` (D027–D028) estan **implementades i provades
localment** (simuladors i PostgreSQL local), però **no desplegades**. API i MCP criden els
mateixos serveis ([MCP_CONTRACT](MCP_CONTRACT.md)), per tant validació i errors són
idèntics.

## Rutes

Totes porten `Authorization: Bearer` (vegeu [Autenticació](#autenticació)). Els cossos són
JSON (`Content-Type: application/json`). No hi ha cap ruta `DELETE`. Les files marcades
amb *(codi)* són de D027–D028 i encara no estan desplegades.

| Mètode i ruta | Entrada | Resposta |
| --- | --- | --- |
| GET /health | Cap | 200 `{"status":"ok"}`; liveness, no comprova BD |
| POST /api/v1/projects | `name`, `description?`; capçalera `Idempotency-Key?` | 201 projecte, també en replay |
| GET /api/v1/projects | Query `status?`, `query?`, `limit?` | 200 `{projects, truncated}` |
| GET /api/v1/projects/{id} | UUID | 200 projecte; 404 si absent o d'un altre propietari |
| PATCH /api/v1/projects/{id} | Almenys un de `name`, `description`, `status`, `priority`, `review_at`, `snoozed_until` | 200 projecte |
| GET /api/v1/projects/{id}/overview | UUID | 200 `{project, open_tasks, notes, truncated}` |
| POST /api/v1/tasks | `title`, `notes?`, `project_id?`, `course_id?` *(codi)*, `due_date?`, `priority?`; `Idempotency-Key?` | 201 tasca, també en replay |
| GET /api/v1/tasks | Query `project_id?`, `course_id?` *(codi)*, `status?`, `due_before?`, `limit?` | 200 `{tasks, truncated}` |
| PATCH /api/v1/tasks/{id} | Almenys un de `title`, `notes`, `status`, `priority`, `due_date`, `project_id`, `course_id` *(codi)* | 200 tasca |
| POST /api/v1/notes | `kind`, `content`, `project_id?`, `course_id?` *(codi)*, `source?`; `Idempotency-Key?` | 201 nota, també en replay |
| GET /api/v1/notes | Query `query?`, `kind?`, `project_id?`, `course_id?` *(codi)*, `include_inactive?`, `limit?` | 200 `{notes, truncated}` |
| PATCH /api/v1/notes/{id} | Almenys un de `content`, `kind`, `status` | 200 nota |
| POST /api/v1/courses *(codi)* | `name`, `code?`, `term?`, `notes?`; `Idempotency-Key?` | 201 assignatura, també en replay |
| GET /api/v1/courses *(codi)* | Query `status?`, `query?`, `limit?` | 200 `{courses, truncated}` |
| PATCH /api/v1/courses/{id} *(codi)* | Almenys un de `name`, `code`, `term`, `notes`, `status` | 200 assignatura |
| GET /api/v1/courses/{id}/overview *(codi)* | UUID | 200 `{course, open_tasks, notes, truncated}` |
| PUT /api/v1/courses/{id}/groups *(codi)* | `kind`, `label?`, `teacher?`, `schedule?`, `location?`, `status?` | 200 grup (creat o actualitzat) |
| GET /api/v1/export *(codi)* | Cap | 200 exportació completa |
| GET /api/v1/daily-summary | Query `date?` | 200 resum del dia |
| POST /api/v1/daily-summary/send | Sense cos | 200 `{"sent":true,"date":"YYYY-MM-DD"}` |

Camps desconeguts, al cos o a la query, es rebutgen amb 422. `idempotency_key` mai va al
cos (422): només a la capçalera. `owner_id`, `id`, dates del servidor (`created_at`,
`updated_at`, `last_activity_at`, `completed_at`) i l'estat inicial són exclusius del servidor.

## Projectes

`name`: text d'1–200 caràcters, no només espais; es conserva sense trim silenciós.
`description`: text de fins a 2.000, per defecte cadena buida. `status`: `active`,
`paused`, `completed` o `archived` (un projecte nou sempre és `active`). `priority`:
`low`, `normal` o `high`. `review_at` (quan ha de tornar un projecte pausat) i
`snoozed_until` (sense recordatoris fins aquell dia) són dates; `null` les esborra.
Passar a un estat que no és `paused` esborra `review_at` si no s'envia explícitament.
Arxivar substitueix esborrar.

La resposta conté `id`, `name`, `description`, `status`, `priority`, `review_at`,
`snoozed_until`, `created_at`, `updated_at` i `last_activity_at`. No exposa propietari,
clau ni empremta. `last_activity_at` canvia en editar el projecte o en crear/editar les
seves tasques o notes.

Llistat: ordenat per `last_activity_at` (més recent primer). Sense `status`, els arxivats
s'amaguen; amb `status=archived` es veuen només aquests. `query` (1–100 caràcters) cerca
literalment, sense distingir majúscules, a `name` i `description`; `%` i `_` no són comodins.

`overview` retorna el projecte, fins a 100 tasques obertes (`open_tasks`) i fins a 100
notes actives, amb `truncated: true` si n'hi ha més.

## Tasques

`title`: 1–300 caràcters, no només espais. `notes`: fins a 4.000, per defecte buit.
`status`: `open` (en crear), `done` o `cancelled`; en passar a `done` el servidor posa
`completed_at`, i l'esborra si es reobre. `priority` per defecte `normal`. `project_id` ha
de ser un projecte propi; a `PATCH`, `null` desvincula la tasca i `due_date: null` treu el
venciment. Les tasques no s'esborren: es cancel·len.

Resposta: `id`, `project_id`, `course_id` *(codi)*, `title`, `notes`, `status`,
`priority`, `due_date`, `created_at`, `updated_at`, `completed_at`.

`course_id` *(codi)* vincula la tasca a una assignatura pròpia: un lliurament o un examen és
una tasca amb `course_id`. Una tasca pot tenir projecte, assignatura, tots dos o cap. A
`PATCH`, `course_id: null` la desvincula. Si l'assignatura no existeix o és d'un altre
propietari, 404 `course_not_found`.

Llistat: per defecte només obertes; `status` pot ser `open`, `done`, `cancelled` o `all`.
`due_before` retorna les que vencen aquell dia o abans (les que no tenen data queden fora).
Ordre: venciment (sense data al final), després prioritat (alta primer).

## Notes (memòria explícita)

`kind`: `decision` (decisió confirmada), `open_question` (decisió pendent), `fact`,
`preference` o `note`. `content`: 1–4.000 caràcters, no només espais. `source`: d'on ve
la informació, fins a 200. `status`: `active` o `inactive`; «oblidar» és `inactive` (no
s'esborra, es pot tornar a `active`). El projecte d'una nota no es pot canviar, ni la seva
assignatura (`course_id` *(codi)*, per al context acadèmic: «l'examen val el 40%»).

Resposta: `id`, `project_id`, `course_id` *(codi)*, `kind`, `content`, `source`, `status`,
`created_at`, `updated_at`. Cerca: ordenada per creació (més recent primer); per defecte només actives,
`include_inactive=true` inclou les oblidades; `query` cerca literalment a `content`.

## Assignatures i grups (D028, codi, no desplegat)

`name`: 1–200 caràcters, no només espais. `code` (fins a 40), `term` (text lliure fins a 60,
p. ex. «2026-27 T1») i `notes` (fins a 4.000): per defecte buits. `status`: `active` (en
crear) o `archived`; les assignatures no s'esborren, s'arxiven. Resposta: `id`, `name`,
`code`, `term`, `notes`, `status`, `created_at`, `updated_at`.

Llistat: per defecte només actives (`status=archived` per veure les arxivades), ordenat per
nom; `query` cerca literalment a `name` i `code`. Cada assignatura porta `groups` amb els
seus grups actius, de manera que «qui em fa el seminari de X?» és una sola consulta.
`overview` retorna `course` (amb grups), fins a 100 tasques obertes i fins a 100 notes
actives de l'assignatura, amb `truncated`.

`PUT /api/v1/courses/{id}/groups` desa un grup: `kind` (`theory`, `seminar`, `lab` o
`other`), `label` (fins a 60, p. ex. «S102»; per defecte buit), `teacher` (fins a 200),
`schedule` (text lliure fins a 300), `location` (fins a 200) i `status` (`active` o
`inactive`). El grup s'identifica per (assignatura, `kind`, `label`): si ja existeix,
s'actualitzen només els camps enviats; si no, es crea. Repetir la petició no duplica res,
per això no porta `Idempotency-Key` (és un `PUT`). Resposta: `id`, `course_id`, `kind`,
`label`, `teacher`, `schedule`, `location`, `status`, `updated_at`.

## Exportació (D027, codi, no desplegat)

`GET /api/v1/export` retorna tot el que Jarvis guarda del propietari: `exported_at`,
`truncated` i les llistes `projects`, `tasks`, `notes`, `courses` i `course_groups`,
**incloent arxivats, cancel·lats i inactius**, en la mateixa forma pública que la resta de
rutes (sense propietari, claus d'idempotència ni empremtes). Com a màxim 1.000 files per
taula (perquè la resposta càpiga en una sola petició); si alguna en té més, `truncated: true`
i per tenir-ho tot cal una còpia (`npm run db:backup`).

## Resum diari

`date` opcional (per defecte avui a Madrid). Resposta: `date`, `time_zone`
(`Europe/Madrid`), `overdue`, `due_today`, `due_this_week` (tasques obertes que vencen
els 7 dies següents), `follow_ups` (com a màxim 3 projectes), `is_empty`, `truncated` i
`text` (missatge en català fet amb plantilles). Cada tasca porta `id`, `title`,
`due_date`, `priority`, `project_id`, `project_name` i, al codi no desplegat, `course_id` i
`course_name` (al text, un lliurament mostra l'assignatura en lloc del projecte); cada seguiment, `project_id`,
`project_name`, `reason` (`review_due`, `pending_decision` o `inactive`) i `detail`.
Regles a [AUTOMATIONS](AUTOMATIONS.md).

`POST /api/v1/daily-summary/send` envia el resum d'avui a Telegram ara mateix, fora del
registre diari (pot repetir-se). Telegram real **no verificat**.

## Formats comuns

**Dates de calendari**: `YYYY-MM-DD`, sense hora, interpretades a Europe/Madrid
(`due_date`, `due_before`, `review_at`, `snoozed_until`, `date`). Dates impossibles com
`2030-02-30` es rebutgen. Instants (`created_at`…) en ISO 8601 UTC. Motiu a
[DATA_MODEL](DATA_MODEL.md).

**Llistats**: `limit` d'1 a 200 (per defecte 50). Si hi ha més resultats que el límit, la
resposta porta `truncated: true`; no hi ha paginació, cal afinar els filtres.
`include_inactive` accepta `true` o `false`.

## Idempotència opcional

Aplica a `POST` de projectes, tasques, notes i assignatures. Els grups (`PUT`) no la
necessiten perquè s'identifiquen per la seva clau natural. Sense clau, cada POST crea un registre nou,
encara que el contingut sigui igual. Amb clau, identificador ASCII `[A-Za-z0-9._:-]`
d'1–128 caràcters, es garanteix un únic registre per propietari/clau i tipus. Mateix
contingut retorna el mateix registre (201); contingut diferent retorna 409. Els camps
omesos compten amb el seu valor per defecte (ometre `description` equival a `""`).
La clau viu a la capçalera HTTP, no al JSON. La retenció dura tant com el registre;
no hi ha eliminació ni expiració de claus. Les edicions (`PATCH`) no porten clau.

No hi ha retries automàtics de POST sense clau. Si la connexió es talla o
caduca el timeout després del commit, el client pot rebre un error tot i haver-se
desat el registre. Només reintentar amb la mateixa clau permet deduplicar-lo.

## Errors i límits

Cos HTTP d'error: `{"error":"code"}`. 400 JSON invàlid o HTTPS requerit,
401 credencial invàlida/caducada, 403 origen prohibit, 404 recurs/ruta absent,
409 conflicte d'idempotència, 413 cos >16 KiB, 415 Content-Type incorrecte,
422 dades/clau/UUID invàlids, 502 Telegram ha fallat, 503 configuració incompleta o
servei no disponible. Errors inesperats es redueixen a 503 sense detall intern.

| Codi | Estat | Quan |
| --- | --- | --- |
| `invalid_project`, `invalid_project_id` | 422 | Alta o UUID de projecte invàlids |
| `invalid_project_filter`, `invalid_project_update` | 422 | Filtres del llistat o canvis invàlids (o cap canvi) |
| `invalid_task`, `invalid_task_filter`, `invalid_task_update` | 422 | Alta, filtres o canvis de tasca invàlids |
| `invalid_note`, `invalid_note_filter`, `invalid_note_update` | 422 | Alta, filtres o canvis de nota invàlids |
| `invalid_summary_date` | 422 | `date` del resum invàlida |
| `invalid_course`, `invalid_course_id` | 422 | Alta o UUID d'assignatura invàlids *(codi)* |
| `invalid_course_filter`, `invalid_course_update` | 422 | Filtres del llistat o canvis d'assignatura invàlids (o cap canvi) *(codi)* |
| `invalid_course_group` | 422 | Dades de grup invàlides *(codi)* |
| `project_not_found` | 404 | Projecte inexistent o d'un altre propietari (també en vincular-hi una tasca o nota) |
| `course_not_found` | 404 | Assignatura inexistent o d'un altre propietari (també en vincular-hi una tasca, nota o grup) *(codi)* |
| `task_not_found`, `note_not_found` | 404 | Tasca o nota inexistent o d'un altre propietari |
| `idempotency_conflict` | 409 | Mateixa clau amb contingut diferent |
| `telegram_failed` | 502 | Telegram no ha acceptat el missatge |
| `telegram_not_configured` | 503 | Falten `TELEGRAM_BOT_TOKEN` o `TELEGRAM_CHAT_ID` vàlids |

Un recurs d'un altre propietari respon igual que un d'inexistent: no es revela si existeix.

Sense CORS habilitat per a una app web; l'origen de desenvolupament MCP es pot
autoritzar explícitament. Respostes privades no emmagatzemables (`Cache-Control: no-store`).

## Autenticació

Totes les rutes privades (`/api/v1/…` i `/mcp`) requereixen
`Authorization: Bearer <token>`, amb una d'aquestes credencials:

- **Access token OAuth** (`jvs_at_…`, 1 h), obtingut amb el flux de D023. És la via
  principal; API i MCP accepten els mateixos tokens. Sense scopes funcionals: un token
  dona accés complet al propietari.
- **Token fix de desenvolupament** (D013/D022), opcional: només funciona si està configurat
  i vigent; serveix per a scripts i verificacions.

Tot 401 inclou la capçalera que indica als clients OAuth on començar (RFC 9728):
`WWW-Authenticate: Bearer realm="jarvis", resource_metadata="<origen>/.well-known/oauth-protected-resource"`.

## Endpoints OAuth (D023, desplegats; verificats amb Claude web/app)

Públics, sense token. Flux pas a pas a [ARCHITECTURE](ARCHITECTURE.md). Les respostes
porten `Cache-Control: no-store` i `Referrer-Policy: no-referrer` (les pàgines HTML,
`same-origin`: amb `no-referrer` el navegador enviaria `Origin: null` amb el formulari).

| Mètode i ruta | Entrada | Resposta |
| --- | --- | --- |
| GET /.well-known/oauth-protected-resource (i `…/mcp`) | Cap | 200 RFC 9728: `resource` = `<origen>/mcp`, `authorization_servers` = [`<origen>`] |
| GET /.well-known/oauth-authorization-server | Cap | 200 RFC 8414: `issuer`, endpoints, PKCE `S256`, auth `none`, scope `offline_access` |
| POST /oauth/register | JSON amb `redirect_uris` (1–5), `client_name?` | 201 amb `client_id` signat; no es desa res (DCR, RFC 7591) |
| GET /oauth/authorize | `client_id`, `redirect_uri`, `response_type=code`, `code_challenge`, `code_challenge_method=S256`, `state?`, `resource?` | 200 pantalla HTML de consentiment |
| POST /oauth/authorize | Formulari de la pantalla amb la casella `confirmed=yes`; capçalera `Origin` igual al propi origen | 303 cap a GitHub |
| GET /oauth/callback | `code` i `state` de GitHub | 302 al `redirect_uri` del client amb `code`, `state` i `iss` |
| POST /oauth/token | Formulari urlencoded: `grant_type`, `client_id`, `resource?` i `code` + `code_verifier` + `redirect_uri` o `refresh_token` | 200 `access_token`, `token_type: "Bearer"`, `expires_in: 3600`, `refresh_token`, `scope` |

Adreces de retorn admeses: els callbacks de Claude (`https://claude.ai/api/mcp/auth_callback`
i la variant `claude.com`) o loopback `http://localhost` / `http://127.0.0.1` (Claude Code). En loopback el port
pot ser diferent del registrat (RFC 8252); host, camí i la resta han de coincidir.
`resource`, si s'envia, ha de ser aquest servidor. Cada refresc retorna un refresh token nou.

Errors en format OAuth `{"error":"code"}`: `invalid_redirect_uri` (400, registre),
`invalid_client` (401, `client_id` no vàlid), `invalid_grant` (400, codi o refresh token
no vàlid, caducat, reutilitzat o d'un altre client), `invalid_target` (400, `resource`
aliè) i `unsupported_grant_type` (400). Els errors de `/oauth/authorize` i
`/oauth/callback` es mostren en una pàgina HTML (400/403, o 502 si GitHub no respon) i
mai es redirigeixen. Altres `/.well-known/*` → 404. Configuració OAuth incompleta →
503 `oauth_not_configured`. Límits de cos i Content-Type iguals que l'API.

# Contracte MCP

Streamable HTTP a `/mcp`, amb el SDK oficial, mode sense sessió i respostes JSON.
Versió negociada pel SDK; no es promet compatibilitat amb qualsevol versió/client.
API i MCP comparteixen servei, persistència i propietari autenticat.
Estat executable a [CURRENT_STATE](CURRENT_STATE.md).

D021: endpoint de desenvolupament publicat a
`https://jarvis.jarvis-joancardonall.workers.dev/mcp`. Transport remot verificat amb
el SDK oficial; des del 2026-11-24 el Worker públic executa l'OAuth de D023, verificat
amb Claude web/app el 2026-11-25. `.mcp.json` ja no porta capçalera `Authorization`: Claude Code farà OAuth pel
navegador. Passos i limitacions a [DEVELOPMENT](DEVELOPMENT.md).

## Eines

**Estat:** **19 eines al codi, 13 desplegades.** Les 13 de D023–D026 estan publicades al
Worker des del 2026-11-25 (verificat amb el driver real de Neon i una lectura amb la
connexió OAuth real); falta que Claude web/app i Claude Code es reconnectin i les provin.
Les 6 de D027–D028 (marcades *codi*) estan provades localment (client MCP oficial contra
simulador, PostgreSQL local i workerd amb 19 eines), però **no desplegades**.

Totes porten el prefix `jarvis.` (per exemple, `jarvis.list_tasks`). 8 eines de lectura
declaren l'anotació MCP `readOnlyHint` (indica al client que no canvien res). `export_data`
tampoc canvia res, però **no la declara expressament**: retorna totes les dades de cop i volem
que el client demani permís abans.

| Eina | Tipus | Entrada (`?` = opcional) | Retorna |
| --- | --- | --- | --- |
| `create_project` | escriptura | `name`, `description?`, `idempotency_key?` | projecte |
| `get_project` | lectura | `project_id` | projecte |
| `list_projects` | lectura | `status?`, `query?`, `limit?` | `{projects, truncated}` |
| `update_project` | escriptura | `project_id` + almenys un de `name`, `description`, `status`, `priority`, `review_at`, `snoozed_until` | projecte |
| `get_project_overview` | lectura | `project_id` | `{project, open_tasks, notes, truncated}` |
| `create_task` | escriptura | `title`, `notes?`, `project_id?`, `course_id?`, `due_date?`, `priority?`, `idempotency_key?` | tasca |
| `list_tasks` | lectura | `project_id?`, `course_id?`, `status?`, `due_before?`, `limit?` | `{tasks, truncated}` |
| `update_task` | escriptura | `task_id` + almenys un de `title`, `notes`, `status`, `priority`, `due_date`, `project_id`, `course_id` | tasca |
| `save_note` | escriptura | `kind`, `content`, `project_id?`, `course_id?`, `source?`, `idempotency_key?` | nota |
| `search_notes` | lectura | `query?`, `kind?`, `project_id?`, `course_id?`, `include_inactive?`, `limit?` | `{notes, truncated}` |
| `update_note` | escriptura | `note_id` + almenys un de `content`, `kind`, `status` | nota |
| `get_daily_summary` | lectura | `date?` | resum del dia |
| `send_daily_summary` | escriptura externa | cap | `{sent, date}` |
| `create_course` *(codi)* | escriptura | `name`, `code?`, `term?`, `notes?`, `idempotency_key?` | assignatura |
| `list_courses` *(codi)* | lectura | `status?` (per defecte actives), `query?` (nom o codi), `limit?` | `{courses, truncated}`, cada una amb els seus grups actius |
| `update_course` *(codi)* | escriptura | `course_id` + almenys un de `name`, `code`, `term`, `notes`, `status` | assignatura |
| `save_course_group` *(codi)* | escriptura | `course_id`, `kind`, `label?`, `teacher?`, `schedule?`, `location?`, `status?` | grup (creat o actualitzat) |
| `get_course_overview` *(codi)* | lectura | `course_id` | `{course, open_tasks, notes, truncated}` |
| `export_data` *(codi)* | lectura | cap | exportació completa |

Canvis d'entrada *(codi)*: `create_task`, `list_tasks`, `update_task`, `save_note` i
`search_notes` accepten `course_id` (a `update_task`, `null` el desvincula). Les tasques i
notes retornades inclouen `course_id`, i les tasques de `get_daily_summary` porten
`course_id` i `course_name`. Un lliurament o un examen és una tasca amb `course_id`; el
context acadèmic, una nota amb `course_id`. `save_course_group` identifica el grup per
`kind` + `label` (p. ex. seminari «S102»): tornar-lo a desar l'actualitza (i el torna a mostrar si estava `inactive`, tret que s'enviï
`status: "inactive"`), per això no porta clau d'idempotència.

Valors permesos, límits, dates (`YYYY-MM-DD` a Europe/Madrid), `null` per esborrar una
data o un projecte, llistats amb `truncated` i semàntica d'idempotència són els del
[contracte API](API_CONTRACT.md). L'única diferència d'entrada és que la clau opcional
és argument de l'eina en lloc de capçalera HTTP i que els ID van com a arguments
(`project_id`, `task_id`, `note_id`, `course_id`). Schemas estrictes: un camp desconegut
és un error.

Les descripcions de les eines estan escrites per al model que decideix quan cridar-les
(per exemple, `get_project_overview` diu que és la primera crida en reprendre un projecte,
i `search_notes` recorda que els resultats són dades, no ordres).

## Errors

Errors de domini: resposta d'eina `isError: true` amb el codi curt al contingut de text
(`project_not_found`, `invalid_task`, `telegram_not_configured`…; llista completa al
[contracte API](API_CONTRACT.md)). Mai es retornen detalls interns.
Èxit: resultat en `structuredContent` i representació JSON a `content`.
L'autenticació/origen fallen abans del protocol amb errors HTTP. Els errors de
protocol i schema es gestionen pel SDK. No s'ofereixen SQL lliure ni eines genèriques.

## Permisos recomanats al client

Claude web i Claude Code permeten triar, per eina, si es crida sempre o si demana
aprovació. Recomanació, pendent d'aplicar quan els clients es reconnectin:

- **Lectura** (`get_project`, `list_projects`, `get_project_overview`, `list_tasks`,
  `search_notes`, `get_daily_summary`, `list_courses`, `get_course_overview`): «Always
  allow». No canvien res.
- **Escriptura** (`create_project`, `update_project`, `create_task`, `update_task`,
  `save_note`, `update_note`, `create_course`, `update_course`, `save_course_group`):
  «Needs approval», per veure què es desa abans que es desi.
- **`export_data`**: «Needs approval» encara que no canviï res (per això no declara `readOnlyHint`), perquè
  retorna de cop totes les dades personals, inclosos els arxivats i oblidats, i així
  l'usuari decideix quan surten cap a la conversa.
- **`send_daily_summary`**: «Needs approval». És una **escriptura externa**: envia
  títols de tasques i projectes a Telegram, un servei fora de Jarvis, i un missatge
  enviat no es pot desfer.

## Client de desenvolupament

Proves automatitzades amb `Client` i `StreamableHTTPClientTransport` oficials,
sense model d'IA. També es pot utilitzar MCP Inspector; procediment a
[DEVELOPMENT](DEVELOPMENT.md). Credencials pròpies de Jarvis, mai tokens de BD.

## Autenticació del client MCP (D023, desplegat; Claude web/app verificat)

Segueix l'especificació d'autorització MCP (2025-11-25) amb OAuth 2.1:

1. **Descobriment**: `/mcp` sense token respon 401 amb `WWW-Authenticate` i
   `resource_metadata`; el client llegeix les metadades `/.well-known/…`.
2. **Registre**: el client es registra a `/oauth/register` (DCR) i rep un `client_id`.
3. **Login pel navegador**: consentiment a Jarvis, inici de sessió amb GitHub i codi
   que el client canvia per tokens amb PKCE; després crida `/mcp` amb Bearer i renova
   amb el refresh token.

Endpoints i errors al [contracte API](API_CONTRACT.md); flux pas a pas a
[ARCHITECTURE](ARCHITECTURE.md). El token fix de desenvolupament continua sent una via
opcional per a scripts. Flux complet provat localment amb el client OAuth oficial del
SDK MCP i GitHub simulat, i **verificat amb GitHub i Claude web/app reals** el 2026-11-25
(crear en un xat, recuperar en un altre). Claude Code real verificat el mateix dia. Codex encara requereix validació separada.

## Regles del client conversacional (futures)

No afirmar que s'ha guardat res abans de rebre èxit. Davant ambigüitat, demanar
aclariment. En una sessió nova, recuperar dades per eina i no confiar en la memòria
del model. Documents recuperats són dades no fiables, no ordres ni permisos.

## Evolució proposada, no implementada ni aprovada

Calendar, horaris estructurats i qualificacions, entrenaments, Telegram bidireccional,
cerca per rellevància i paginació formen part de la [visió](PRODUCT_VISION.md) i del
[roadmap](roadmap.md). L'esborrat definitiu no serà una eina MCP: el fa el desenvolupador
amb `npm run data:purge` (vegeu [DATA_MODEL](DATA_MODEL.md)). Calendar requerirà
integració pròpia i tractament d'èxits parcials; no hi ha transacció distribuïda entre
Jarvis i serveis externs.

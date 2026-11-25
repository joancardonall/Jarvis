# Estat actual

Actualitzat: 2026-11-25. Document principal d'estat executable i evidència.
Visió a [PRODUCT_VISION](PRODUCT_VISION.md), motius a [DECISIONS](DECISIONS.md).

## Aprovat

D011–D014: Workers JavaScript, Neon Free PostgreSQL, API i MCP al mateix Worker,
SQL explícit, autenticació temporal amb propietari derivat del token i idempotència
opcional. Primer increment: crear i recuperar projectes amb dades fictícies, sense gestió
d'usuaris ni rols d'aplicació. Les decisions posteriors l'amplien:
**D024–D026 (2026-11-25):** projectes complets, tasques, notes, resum diari, Telegram i còpia
ampliada; aprovades com a llista de deu increments, sense autoritzar desplegament ni dades reals.
**D023 (2026-11-24):** autenticació OAuth 2.1 pròpia amb inici de sessió de GitHub,
aprovada amb implementació completa, commit i push de la branca. Substitueix el
«sense OAuth» de la línia anterior. Publicar-la continua sent una acció de l'usuari.
D017 autoritza preparar recursos Free, migrar i provar recuperació amb dades
fictícies. D021 autoritza publicar el Worker de desenvolupament i preparar la
connexió amb Claude Code, ara disponible; només dades fictícies i pla Free.

## Resum en una frase

**Publicat i verificat:** crear i recuperar projectes amb OAuth de GitHub (D023), des de Claude
web/app i Claude Code. **Implementat però no publicat:** llistar i editar projectes, tasques,
notes, resum diari i Telegram (D024–D026), a la branca `feat/jarvis-core`.

## Projectes, tasques, memòria, resum i Telegram (D024–D026) — implementat, NO desplegat

Aprovat per l'usuari el 2026-11-25 com a llista de deu increments a fer sense interrupcions.
No autoritzat: desplegar, migrar la BD real, fusionar a main ni dades personals reals.
**El Worker públic continua exposant només les 2 eines de D023** i Neon només té les
migracions 001 i 002. Decisions a [DECISIONS](DECISIONS.md), passos d'activació a
[DEVELOPMENT](DEVELOPMENT.md).

**Implementat** (detall a [API](API_CONTRACT.md), [MCP](MCP_CONTRACT.md),
[DATA_MODEL](DATA_MODEL.md) i [AUTOMATIONS](AUTOMATIONS.md)):

1. Llistar i cercar projectes. 2. Editar projectes: estat, prioritat, data de revisió.
3. Tasques amb venciment i prioritat. 4. Notes com a memòria explícita, amb «oblidar» reversible.
5. Resum d'un projecte en una crida. 6. Les mateixes operacions a l'API HTTP.
7. Resum diari per regles. 8. Enviament per Telegram amb cron, un missatge al dia com a màxim.
9. Posposar seguiments d'un projecte. 10. Còpia lògica de projectes, tasques i notes.

13 eines MCP (abans 2), migració 003, cap dependència ni servei nou.

**Verificat el 2026-11-25** (Node 26.13.1, npm 11.20.0, PostgreSQL 17.12 local i temporal,
instal·lat amb Homebrew per a aquestes proves):

| Ordre | Resultat real | Abast |
| --- | --- | --- |
| `npm test` | 52/52 (18 API/MCP, 14 OAuth, 12 domini, 8 operatives) | Regles, validació, aïllament per propietari, resum i Telegram **simulat** |
| `npm run test:postgres` | 3/3 | SQL real: migracions 001–003 (la 003 sobre projectes ja existents), escenari complet, restriccions, 10 creacions i 10 reclamacions de resum simultànies |
| `npm run test:ops` | 1/1 | Clúster nou: rols mínims, ledger 001–003, **tot l'escenari amb el rol runtime**, permisos negatius, còpia i restauració completes |
| `npm run test:worker` | 1/1 | workerd local: 13 eines descobertes pel client oficial |
| `npm run check`, `npm run build` | Correctes; 1687,56 KiB / gzip 313,00 KiB | Sense desplegar |
| `npm audit --omit=dev` | 0 vulnerabilitats conegudes | Auditoria de registre |
| Dates dins de workerd | Dia i hora de Madrid correctes a l'hivern i a l'estiu | Prova puntual amb un Worker de prova |
| Revisió independent | Cap troballa crítica ni alta; aïllament per propietari intacte | Agent revisor amb proves de concepte sobre PostgreSQL real |

Aquestes dues suites d'integració també passen sobre el codi de D023 ja publicat: queda
tancat el pendent «no executades» de `oauth_grants` i de les migracions múltiples.

Troballes de la revisió, corregides i amb prova nova: anys fora de rang (0000, 9999) donaven
503; `SUMMARY_HOUR` de 10 o més no enviava mai a l'hivern (ara només 6, 7 o 8); un timeout de
Telegram es reintentava i podia duplicar el missatge (ara només es reintenta un rebuig
explícit); repetir una petició idempotent marcava activitat al projecte; salts de línia en un
títol podien imitar una secció del resum; caràcters NUL donaven 503; un emoji es podia partir
en tallar el missatge; moure una tasca només marcava el projecte nou; la restauració no era
atòmica; el resum d'un altre dia mesurava la inactivitat des d'ara.

**No verificat ni executat:**

- Res desplegat: ni migració 003 a Neon, ni codi nou al Worker, ni cron real.
- El driver HTTP de Neon amb el SQL nou (provat amb `pg` sobre PostgreSQL local). Es
  comprova amb `npm run dev:verify-neon` un cop migrat, que ara també exercita tasques,
  notes, resum de projecte i resum diari.
- Telegram real (bot, entrega, límits) i els clients Claude reals amb les 13 eines.
- `scripts/verify-neon.js` ampliat: només comprovada la sintaxi; no executat (token fix caducat).

**Limitacions que cal conèixer:** no es pot fer una còpia amb el codi nou abans d'aplicar la
migració 003 (la còpia exigeix el ledger complet); el fitxer de còpia antic (format 1) ja no
es pot restaurar; els instants de la còpia tenen precisió de mil·lisegons; el resum llegeix
com a màxim 200 tasques, projectes i decisions pendents i avisa si n'hi ha més; sense
esborrat real ni paginació. Llista completa a [SECURITY_PRIVACY](SECURITY_PRIVACY.md).

## OAuth amb GitHub (D023) — desplegat i verificat amb Claude web/app i Claude Code

**Posada en marxa 2026-11-24** (passos 1–7 de [DEVELOPMENT](DEVELOPMENT.md), executats
per l'usuari; comprovacions fetes per l'agent):

- OAuth App de GitHub creada; `.env.oauth.json` amb format vàlid, permisos 0600, ignorat per Git.
- `npm run db:migrate` executat per l'usuari; `npm run db:verify`: **Runtime connection and
  minimum permissions verified** (inclou ara `oauth_grants`).
- Secrets pujats: `OAUTH_SIGNING_KEY`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` (llistats
  per nom, sense valors). Versió activa **`abc5bd69-18ed-48a2-8c5b-8628393d25dd`** (100%),
  missatge `D023 OAuth with GitHub`, publicada des de la branca `feat/oauth-github`.
- Remot: salut 200; metadades RFC 8414 i RFC 9728 correctes; 401 amb `resource_metadata`;
  registre de client 201; pantalla de consentiment 200 amb casella; token falsificat 401.
- `npm run dev:verify-remote` amb el token fix: passa (API/MCP i persistència Neon).
- **Claude web/app real, 2026-11-25 (pas 8, executat i confirmat per l'usuari):** connector
  nou sense capçaleres; pantalla de consentiment, casella i login amb GitHub completats;
  connector connectat amb les dues eines visibles. En un xat s'ha creat un projecte fictici
  (*Prova OAuth*) amb aprovació manual i **un segon xat nou l'ha recuperat per UUID**.
  Primer flux OAuth complet amb GitHub i client reals. Captures de l'usuari; l'agent no
  ha consultat la BD per comprovar la fila.
- Permisos recomanats al connector: `get project` «Always allow», `create project`
  «Needs approval» mentre no hi hagi més confiança en l'ús.
- **Claude Code real, 2026-11-25 (pas 9):** extensió de VS Code; l'usuari ha autenticat el
  servidor `jarvis` de `.mcp.json` amb `/mcp` (login GitHub, retorn loopback). L'agent ha
  cridat les eines d'aquest servidor (no les del connector de claude.ai): creat el projecte
  fictici `09795485-89ba-4bc8-a75b-75154f33e01a` amb clau `d023-claude-code-validation` i
  recuperat per UUID amb el mateix contingut i dates. Posada en marxa de D023 completa.
- Claude Code també hereta el connector de claude.ai: hi ha dues connexions a Jarvis i
  les eines surten duplicades. Decidir-ne una queda pendent.

### Detall de la implementació (abans del desplegament)

Branca `feat/oauth-github`, fusionada a main el 2026-11-25 per aprovació de l'usuari
(fast-forward; abans: `npm test` 39/39, `test:worker` 1/1, `check`, `build` i
`npm audit --omit=dev` amb 0 vulnerabilitats, ja amb npm instal·lat).

**Implementat:** servidor d'autorització dins del Worker (metadades, registre de clients
sense estat, consentiment, anada i tornada de GitHub, tokens amb rotació), taula
`oauth_grants` (migració 002), autenticació per access token OAuth a API i MCP, token fix
opcional, `npm run oauth:setup`, migracions múltiples amb ledger. Cap dependència ni
servei nou. Detall a [ARCHITECTURE](ARCHITECTURE.md) i [SECURITY_PRIVACY](SECURITY_PRIVACY.md).

**Verificat el 2026-11-24** (Node 24.22.1; sense npm en aquesta sessió, s'ha executat
l'ordre equivalent de cada script directament amb `node`):

| Comprovació | Resultat real | Abast |
| --- | --- | --- |
| `npm test` (equivalent) | 39/39 (18 API/MCP, 14 OAuth, 7 operatives) | Flux complet amb el client OAuth oficial del SDK MCP i **GitHub simulat**; model d'amenaces de SECURITY_PRIVACY |
| `npm run test:worker` (equivalent) | 1/1 | workerd local: metadades, registre, pantalla de consentiment i rebuig de token falsificat dins del runtime real |
| `npm run check` (equivalent) | Correcte | Sintaxi i enllaços Markdown |
| `npm run build` (equivalent) | Correcte, 1654,98 KiB / gzip 305,68 KiB | Dry-run, sense desplegar |
| SQL de `oauth_grants` sobre Neon real | Escenari d'emmagatzematge correcte | Rol migrador i driver `pg`, dins d'una transacció amb ROLLBACK; la taula no existeix després |
| Revisió de seguretat independent | Cap via d'accés sense el compte permès; 6 troballes corregides o documentades | Agent revisor separat, amb proves de concepte contra el simulador |

**No verificat ni executat:**

- Cap pendent de clients Claude: GitHub, Claude web/app i Claude Code verificats el 2026-11-25.
- `npm run test:postgres` i `npm run test:ops` no es van poder executar el 2026-11-24;
  **executades i correctes el 2026-11-25** amb PostgreSQL local (vegeu D024–D026 a dalt).
- El driver HTTP de Neon del Worker amb les consultes noves (només s'ha provat el SQL amb `pg`).

Troballes de la revisió, totes amb prova nova: la pàgina de consentiment feia que el
navegador enviés `Origin: null` (hauria bloquejat el botó); un lladre podia conservar
l'accés reutilitzant un refresh token dins la finestra de reintent; el port variable de
Claude Code; un sol clic bastava per aprovar; codis de GitHub mal formats arribaven a
GitHub; un intercanvi simultani del mateix codi no revocava. Riscos residuals a
[SECURITY_PRIVACY](SECURITY_PRIVACY.md).

## Estat operatiu

- Worker publicat segons D021: https://jarvis.jarvis-joancardonall.workers.dev
  Versió verificada: `1307721e-dda1-4faf-8265-bf6715f36fd0` (100%, secrets renovats el 2026-11-18).
- HTTPS i circuit API/MCP→Neon verificats amb SDK oficial i dades fictícies.
  No hi ha bloqueig TLS actual. CPU i clients conversacionals encara pendents.
- Compte Cloudflare verificat amb login OAuth propi; previews i observability
  desactivats. Cinc secrets runtime protegits, rol `jarvis_runtime`, BD `jarvis_dev`.
- Pla Cloudflare Free confirmat per l'usuari; API de subscripcions retorna 403,
  sense verificació independent de billing. Cap upgrade activat.
- D022 executada: token renovat el 2026-11-18, caduca el
  **2026-11-25T17:57:36.599Z**. Propietari i BD conservats; token antic rebutjat.
  Ja no cal per a Claude web/app: connecta amb OAuth (D023).
- Secrets pujats amb JSON privat per evitar substitucions dotenv de Wrangler.
  Diagnòstic històric al [registre d'aprenentatge](learning/learning-log.md).
- `.mcp.json` preparat amb variable d'entorn, sense token versionat.

## Diagnòstic del connector Claude web/app — 2026-11-18

- GET /health comprovat per HTTPS: 200 amb status ok.
- initialize MCP amb la credencial local existent: 401; caducitat local confirmada.
- La captura de Claude mostra Jarvis amb avís i Reconnect; el missatge és genèric
  i no prova per si sol que el servidor estigui apagat.
- L'usuari ha confirmat que és Claude web/app, no Claude Code, i ha autoritzat
  la renovació a D022. La compatibilitat real del connector encara no està validada.
- 23 proves locals passen; còpia privada recuperable dels dos fitxers preparada.
- Primer login de l'agent caducat sense autorització; l'usuari ha completat després
  el login des del seu terminal. Compte Cloudflare esperat comprovat abans de rotar.
- Còpia privada coherent de .dev.vars i .env.client conservada a backups/ (ignorat).
- token:rotate executat; verificació que owner, URL runtime i altres opcions no canvien.
- Dos secrets actualitzats amb JSON privat via `wrangler secret bulk`:
  DEV_TOKEN_SHA256 i DEV_TOKEN_EXPIRES_AT. No s'ha pujat codi, tocat permisos ni BD.
- GET /health: 200; credencial absent i antiga: 401; credencial nova: initialize i
  descoberta amb SDK oficial correctes, dues eines disponibles.
- Recuperats per MCP els dos projectes ficticis existents: IDs, contingut i dates
  iguals a la còpia coneguda. Prova només de lectura, sense crear cap projecte.
- Desplegament de secrets: b20f63b1-453b-4630-add2-83b2037424d3;
  versió activa al 100% indicada a l'estat operatiu. Cap canvi de codi del Worker.
- Claude web/app connectat amb OAuth i verificat el 2026-11-25 (vegeu D023 a dalt).
- Token fix vigent fins al 2026-11-25T17:57:36.599Z; després només servirà OAuth,
  llevat que es torni a rotar per als scripts de verificació.

## Implementat

- API de crear/recuperar i salut; dues eines MCP amb servei compartit.
- Schemas estrictes, límit d'entrada, comprovació d'origen i HTTPS fora de loopback.
- Bearer token propi amb resum SHA-256 i caducitat, un propietari configurat per entorn.
- Repository Neon amb SQL parametritzat, transacció explícita i timeout de 10 segons.
- Migració inicial, idempotència opcional concurrent i filtres de propietari.
- Scripts npm, lock i proves; documentació permanent sincronitzada a AGENTS.md.
- Preparació operativa: rols SQL mínims, migració amb ledger/checksum, verificació
  de privilegis, prova API/MCP amb Neon i còpia/restauració lògica de projects.
- Generació de tokens en fitxers privats; ja no imprimeix secrets. Configuració
  administrativa, migració, runtime i client separades i ignorades per Git.
- Renovació del token (`npm run token:rotate`) conservant l’owner; provada amb
  fitxers sintètics i executada sobre el Worker publicat segons D022.

Contractes a [API](API_CONTRACT.md) i [MCP](MCP_CONTRACT.md), flux a
[ARCHITECTURE](ARCHITECTURE.md), execució a [DEVELOPMENT](DEVELOPMENT.md).

## Verificat localment

Entorn: macOS arm64, Node 22.22.0 temporal, PostgreSQL 18.6 temporal i dedicat.
No hi ha instal·lació global ni models d'IA.

| Ordre | Resultat real | Abast |
| --- | --- | --- |
| npm test | 23/23 | Contractes anteriors i proteccions operatives: destí UE/TLS, corrupció, secrets, absència de sobreescriptura i rotació de token amb mateix owner |
| npm run test:postgres | 1/1 suite | Migració SQL real, API/MCP contra PostgreSQL, instància nova, 10 altes concurrents, rollback i constraints |
| npm run test:worker | 1/1 | Runtime workerd, xarxa loopback, salut, autenticació i descoberta MCP amb client SDK oficial |
| npm run test:ops | 1/1 suite | Clúster PostgreSQL independent, rols mínims, migració repetible, permisos negatius i restauració completa de projects |
| npm run check | Correcte | Sintaxi JavaScript i enllaços Markdown locals |
| npm run build | Correcte | Bundle Wrangler dry-run, sense desplegar |
| npm audit --omit=dev | 0 vulnerabilitats conegudes | Auditoria de registre, no garantia de seguretat |

Les suites no tenen tests saltats. Els adapters API/MCP s'han provat sobre
PostgreSQL real en Node; workerd s'ha provat per separat sense BD. Aquestes proves locals inicials no acreditaven workerd→Neon;
la prova real posterior es documenta a l'apartat Neon real. Els 11 tests del prototip retirat són històrics i no
formen part d'aquesta validació.

## Neon real — preparat i verificat

Destí confirmat per l'usuari, captura i API oficial: projecte **Jarvis**,
`plain-heart-00084011`, organització `org-quiet-recipe-62118051`, regió
`aws-eu-central-1` (Frankfurt), branch `production`. El nom production és el branch
per defecte de Neon; només s'hi han creat BD de desenvolupament amb dades fictícies.
L'API de l'organització confirma **free**. SQL confirma **PostgreSQL 18.6**.
Els projectes d'Ohio i l'ID diferent del prompt no s'han connectat ni modificat.

- CLI oficial Neon **9.2.0** instal·lat en prefix temporal, sense instal·lació global
  al sistema. Login nou completat per l'usuari al navegador; cap credencial de
  connectors reutilitzada. La sessió privada temporal pot desaparèixer amb la neteja
  del sistema; una futura sessió pot requerir login de nou.
- `neon init`: projecte vinculat, skill local neon-postgres instal·lada,
  neon.ts creat només per PostgreSQL. Paquets de configuració fixats com a devDependencies.
- `neon config plan` i `neon deploy`: **No changes — branch production already matches
  the policy. Utilized services: Postgres.** Cap servei addicional ni upgrade.
- `.env.local`: variables baixades pel CLI, sense imprimir valors. La credencial
  inicial és administrativa: només serveix per preparació, mai al Worker.
- BD **jarvis_dev** i **jarvis_restore** preparades al mateix branch existent.
- Rols SQL separats, sense permisos administratius heretats; migració 001 registrada
  amb checksum i permisos mínims runtime verificats sobre Neon real.
- Secrets locals separats en .env.ops, .env.database, .dev.vars i .env.client,
  ignorats per Git; fitxers amb permisos Unix restrictius. Cap valor al repositori.
- Només **dos projectes ficticis** persistits, amb claus de prova estables.
- Còpia lògica a backups/projects.json restaurada íntegrament a jarvis_restore;
  checksum i contingut comparats. No s'ha esborrat la BD d'origen ni el destí.

### Ordres i evidència del proveïdor real

| Ordre | Resultat |
| --- | --- |
| npm run ops:provision | Development roles configured |
| npm run db:migrate | Migration 001 and runtime table grants verified |
| npm run db:verify | Runtime connection and minimum permissions verified |
| npm run token | Credencials desades privadament, cap token imprès |
| npm run dev:verify-remote | HTTPS, auth absent/invàlida, origen prohibit, descoberta de dues eines, API→MCP i MCP→API amb persistència real |
| npm run dev:verify-neon | API/MCP cross-read, fresh app instance and real Neon persistence verified from Node |
| npm run db:backup | Logical projects snapshot saved privately |
| npm run db:restore | Restore into empty jarvis_restore verified against snapshot checksum |
| npm run build | Dry-run correcte; 1629,40 KiB / gzip 298,44 KiB; no desplegament |
| npm run dev + npm run dev:verify-worker-neon | API/MCP cross-read and real Neon persistence verified through local workerd HTTP |

La prova local va arrencar el Worker a **127.0.0.1:8787** i el va aturar després.
El Worker públic també està desplegat i verificat segons l’estat operatiu anterior.
La prova cobreix HTTP i MCP amb el client SDK real contra workerd i Neon, sense LLM.
Els timings que Wrangler imprimeix són durada de petició, **no CPU del proveïdor**.

## Què continua pendent

- Mesura de CPU a Cloudflare: pla preparat a DEVELOPMENT, encara no executat.
- Disponibilitat remota sostinguda, reactivació després d'inactivitat sostinguda,
  límits reals sota càrrega i clients MCP conversacionals finals pendents.
- Windows, Inspector manual i Codex com a clients de Jarvis no verificats.
  Claude web/app i Claude Code verificats el 2026-11-25.
- La còpia només cobreix projects i migració coneguda: no és pg_dump complet,
  recuperació del compte ni política de còpies per dades personals. No hi ha
  xifrat propi, retenció automatitzada ni còpia fora del dispositiu provats.
- OAuth implementat però no publicat (vegeu a dalt). No hi ha login web propi,
  rate limiter distribuït o garanties de disponibilitat.
  Quotes Free poden interrompre el servei; cap fallback facturable.

## Següent pas i aprovacions

La preparació Free, migració, persistència i restauració remotes de l'increment
han quedat verificades. No cal repetir ops:provision, token, backup o restore:
aquests scripts rebutgen sobreescriure fitxers o bases ja ocupats.

**Següent pas: posar en marxa D024–D026** seguint
[DEVELOPMENT](DEVELOPMENT.md): migració 003, deploy, reconnectar clients i validar.
Publicació inicial autoritzada i executada segons D021. HTTPS i `npm run dev:verify-remote` ja passen.
No habilitar autodeploy. Les dades personals continuen prohibides.
Guia i ordres a [DEVELOPMENT](DEVELOPMENT.md). La reconciliació documental i el
[flux Git](GIT_WORKFLOW.md) estan aprovats; rotació real autoritzada i executada a D022.
Fins que D024–D026 es publiqui, un xat nou encara necessita conèixer l’UUID del projecte.

## Objectius futurs

Memòria personal, tasques, decisions, universitat, entrenaments, integracions,
web i proactivitat per Telegram continuen a la [visió](PRODUCT_VISION.md) i el
[roadmap](roadmap.md). No estan implementats ni autoritzats en aquest increment.

## Punt de represa

D023 publicada, verificada amb Claude web/app i Claude Code i fusionada a main.
D024–D026 implementades i pujades a la branca `feat/jarvis-core` el 2026-11-25, sense
desplegar ni fusionar. La branca també conté el registre de la validació de Claude Code
(`docs/claude-code-validation`), que tampoc és a main.

Pendent de l'usuari, en aquest ordre: migrar (003), desplegar, reconnectar els clients,
validar amb dades fictícies i, si vol, activar Telegram. Després: política de dades
personals abans de posar-hi res real, i aprovar l'abast del bloc següent del
[roadmap](roadmap.md) (universitat i calendari, app web, entrenaments).

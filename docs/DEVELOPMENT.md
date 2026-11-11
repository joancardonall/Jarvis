# Desenvolupament i proves

Aquest document és la guia d'execució. Estat i evidència a
[CURRENT_STATE](CURRENT_STATE.md); estructura a [ARCHITECTURE](ARCHITECTURE.md).

## Publicació de desenvolupament — D021, 2026-11-11

La prohibició de publicar dels procediments històrics següents queda substituïda
per D021. Worker publicat a `https://jarvis.jarvis-joancardonall.workers.dev`;
previews i observability continuen desactivats. Només dades fictícies.

Ordres executades amb Node 22.22.0 i Wrangler fixat al projecte:

```sh
npx wrangler login
npx wrangler whoami
npx wrangler deploy --secrets-file RUNTIME_JSON_PRIVATE_PATH --message 'D021 explicit runtime JSON secrets; avoid dotenv overrides'
npx wrangler secret list
npm run dev:verify-remote
```

`RUNTIME_JSON_PRIVATE_PATH` és un marcador, no una ruta existent. El primer
desplegament va usar `.dev.vars` directament; no repetir aquest format: Wrangler
expandeix dotenv i prioritza variables de procés, incloses les carregades d'altres
fitxers locals. Això pot substituir la URL runtime per una altra credencial.
La correcció ha serialitzat exclusivament els cinc valors de `.dev.vars` a JSON
en un directori temporal privat, amb fitxer 0600 i creació exclusiva. Ha validat
rol `jarvis_runtime` i BD `jarvis_dev` abans de pujar-lo. JSON evita aquesta expansió.
No copiar credencials manualment ni mostrar el fitxer. Conservar aquest format en
futures publicacions i revisar sempre el destí; no usar secrets administratius.

El compte està fixat a wrangler.jsonc. El subdomini de compte no existia i s'ha
creat amb l'API oficial, només després de confirmar l'absència de scripts.
`--secrets-file` puja només la configuració runtime; mai .env.ops, .env.database
o .env.local. Els cinc valors consten com a secret_text. Token actual caduca el
16 de novembre de 2026; no s'ha regenerat ni sobreescrit cap secret local.
La prova remota reutilitza les dues claus fictícies existents, sense duplicats.
Primer intent: TLS handshake fallit, també amb curl. Posteriorment HTTPS funciona
sense canvis; després del redeploy amb secrets JSON, la prova remota completa passa.
Causa exacta del TLS inicial no confirmada; configuració de secrets com a causa
probable del 503 posterior. GET /health retorna 200; usar GET per provar salut,
ja que `curl -I` envia HEAD i aquesta ruta no admet HEAD públic.

### Claude Code

Configuració de projecte a `.mcp.json`, sense secrets: transport HTTP i Bearer
des de `JARVIS_BEARER_TOKEN`. Amb Claude Code instal·lat i Node al PATH, iniciar-lo
des de l'arrel amb el token carregat des del fitxer privat, sense imprimir-lo.

macOS/Linux:

```sh
set -a
. ./.env.client
set +a
claude
```

Windows PowerShell, amb el format generat pel projecte:

```powershell
$tokenLine = Get-Content .env.client | Where-Object { $_ -match '^JARVIS_BEARER_TOKEN=' }
$env:JARVIS_BEARER_TOKEN = ($tokenLine -split '=', 2)[1].Trim('"')
claude
```

Acceptar la configuració de projecte a Claude Code i consultar `/mcp`. No usar
`claude -p` ni executar un model automàticament per aquesta comprovació.
Amb TLS ja verificat, demanar crear un projecte fictici amb clau estable i
recuperar-lo pel seu UUID en una conversa nova. Sense resposta d'èxit de l'eina,
no considerar-lo desat. No donar permisos generals d'escriptura automàtica.
No s'ha localitzat `claude` al PATH d'aquesta sessió; el client real queda pendent.

### Renovar el token

El token caduca als 7 dies. `npm run token:rotate` en genera un de nou i
substitueix només `DEV_TOKEN_SHA256` i `DEV_TOKEN_EXPIRES_AT` a `.dev.vars` i
el token a `.env.client`. **Conserva `DEV_OWNER_ID`**, de manera que els projectes
existents continuen visibles. El token antic deixa de ser vàlid. No imprimeix
cap secret. Si falta configuració vàlida, falla sense tocar res.

```sh
npm run token:rotate
npx wrangler deploy --secrets-file RUNTIME_JSON_PRIVATE_PATH --message 'Rotate development token'
```

Aquestes ordres són el pla, no una autorització per executar-les. La rotació real
continua pendent d'aprovació. Abans de rotar, conservar una còpia privada i
recuperable de .dev.vars i .env.client. Després, comprovar que owner i URL runtime
es conserven i preparar JSON privat amb els cinc valors nous segons l'apartat de
publicació; el marcador RUNTIME_JSON_PRIVATE_PATH s'ha de substituir per aquest
fitxer. No pujar .dev.vars directament ni mostrar secrets.

Les dues substitucions locals són successives, no una operació atòmica conjunta:
si falla la segona, pot quedar una parella inconsistent. Recuperar els dos fitxers
coherents de la còpia abans de continuar. No reexecutar a cegues.

La segona ordre actualitza els secrets del Worker publicat; fins llavors el
remot només accepta el token antic. Després, recarregar `.env.client` i
reiniciar Claude Code (vegeu l'apartat anterior). `npm run token` continua
reservat a la configuració inicial i mai sobreescriu fitxers.
Validar el token nou recuperant projectes existents i comprovant que el vell
retorna 401. Si el desplegament falla o la resposta es perd, no assumir quin
token accepta el remot: comprovar la versió activa i les credencials abans de
restaurar o repetir. La prova sintètica no acredita
rotació real, desplegament ni recuperació davant errors de fitxer.

Fonts oficials consultades: [Claude Code MCP](https://code.claude.com/docs/en/mcp),
[desplegament i secrets](https://developers.cloudflare.com/workers/wrangler/commands/workers/)
i [subdomini Workers](https://developers.cloudflare.com/api/resources/workers/subresources/subdomains/methods/update/).

## Preparació local

Node >=22.19.0 amb npm; validat en aquest torn amb Node 22.22.0 a macOS arm64.
Windows pendent de prova; ordres npm i codi sense rutes absolutes.

```sh
npm ci
npm run check
npm test
npm run test:worker
npm run build
```

`npm test`: contracte HTTP/MCP amb storage simulat i serialització del driver Neon
amb HTTP simulat. No requereix BD, LLM ni credencials reals.
`test:worker`: Wrangler/workerd local, ports 18787 i l'inspector de Wrangler;
comprova salut, autenticació i descoberta MCP per xarxa loopback, sense Neon.
`build`: només empaquetament `wrangler deploy --dry-run`, no desplega.

`npm run dev` escolta només a 127.0.0.1:8787. Sense configuració, `/health`
funciona i les rutes privades fallen tancades. No hi ha fallback en memòria.

## PostgreSQL real dedicat

Instal·lar/arrencar PostgreSQL és una preparació local explícita. Crear una BD
**descartable i buida** anomenada `jarvis_test`, només a loopback. No usar mai
la BD personal ni la de desenvolupament. No hi ha Docker ni provisionament automàtic.

macOS/Linux:

```sh
export TEST_DATABASE_URL='postgresql://TEST_USER:TEST_PASSWORD@127.0.0.1:5432/jarvis_test'
npm run test:postgres
```

Windows PowerShell:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://TEST_USER:TEST_PASSWORD@127.0.0.1:5432/jarvis_test'
npm run test:postgres
```

Els valors anteriors són marcadors. Defineix credencials localment sense publicar-les.
Els tests exigeixen hostname loopback i nom exacte `jarvis_test`, no hereten
DATABASE_URL i rebutgen URLs coincidents. Cada execució crea i elimina exclusivament
un schema aleatori propi, aplica la migració real i usa connexions independents.
No eliminen taules del schema public ni la BD sencera. Sense TEST_DATABASE_URL,
la comanda falla explícitament: no declara integració passada amb tests saltats.

La prova verifica API→MCP, MCP→API en instància nova, aïllament, 10 escriptures
concurrents amb la mateixa clau, conflictes sense alterar contingut, absència de
clau, restriccions SQL i rollback sense reserva de clau persistent. Empra el mateix
SQL que producció amb un adaptador pg transaccional; no prova el servei Neon real.

## Preparació externa autoritzada — D017

Autoritzats: comptes Free, projecte Neon UE, rols mínims, migració, dades
fictícies, connexió/persistència i prova de restauració. La publicació de desenvolupament s’ha autoritzat posteriorment a D021 i ja
està executada. Dades personals, upgrades, targetes i recursos de pagament
continuen fora de l’abast.
L'estat real de cada acció es consulta a [CURRENT_STATE](CURRENT_STATE.md).

### Flux CLI executat per petició de l'usuari

Neon CLI 9.2.0, instal·lat en prefix temporal per aquesta sessió. Amb el CLI al PATH:

```sh
neon login
neon init -y --org-id org-quiet-recipe-62118051 --project-id plain-heart-00084011 --branch production --services postgres --agent codex --skill neon-postgres
neon config plan
neon deploy
```

En aquesta sessió s'ha utilitzat un directori privat temporal amb `--config-dir`,
sense reutilitzar credencials d'eines connectades. Login completat per l'usuari.
El projecte del prompt original era diferent: el destí anterior ha estat confirmat
expressament per l'usuari. `plan` i `deploy` no han aplicat canvis: només Postgres.
Això **no és** desplegar el Worker. No hi ha Functions, Auth, Data API, Storage,
Realtime o AI Gateway declarats. NEON_FUNCTION_HOST_SUFFIX és metadada del CLI,
no evidència d'una funció activa.

`init` escriu `.neon` (context ignorat), `neon.ts`, skill local i `.env.local` amb
DATABASE_URL i DATABASE_URL_UNPOOLED inicials. S'ha usat la URL directa només per
aprovisionar BD i rols; `.dev.vars` apunta exclusivament al nou rol runtime.
No connectar mai l'app amb la credencial administrativa baixada pel CLI.
`@neon/config` i `@neon/env` són eines dev fixades, no dependències del Worker.

Ja configurat en el destí actual: no tornar a executar provisionament o generació
de secrets sense revisar CURRENT_STATE. Les instruccions manuals següents són
la ruta alternativa si es torna a configurar un entorn, no feina encara pendent.

### 1. Panells, accions manuals

**Cloudflare:** entrar al compte propi, consultar Workers & Pages i confirmar el
pla Workers Free. La preparació inicial no exigia publicar un script; D021 ja ha autoritzat
i executat la publicació. No connectar Git per autodeploy ni activar dominis,
Paid, cron o serveis opcionals. Els tokens d'eines connectades al xat no s'utilitzen.

**Neon:** crear projecte `jarvis-dev` en Free, AWS Frankfurt (UE,
`aws-eu-central-1`), PostgreSQL 17 o 18, sense serveis opcionals. Londres no és UE.
A Branches → branch principal → Databases, crear `jarvis_dev` i `jarvis_restore`,
buides i amb l'administrador inicial com a propietari. Comparteixen còmput del
mateix branch; no calen dos projectes ni cap recurs de pagament.

El prompt «Set up with your code agent» és opcional: ometre'l i anar al dashboard.
Qualsevol prompt de configuració s’ha de contrastar amb projecte, regió i abast
aprovats; en aquesta sessió el flux CLI s’ha executat per petició expressa posterior.

No crear rols runtime/migrador des del panell: poden heretar `neon_superuser`.
El provisionament utilitza SQL per crear rols sense membresies administratives.
[Documentació oficial de rols](https://neon.com/docs/manage/roles).

### 2. Traspàs segur de la connexió

A Connect, seleccionar `jarvis_dev`, rol administrador inicial i **pooling desactivat**.
Copiar `.env.example` a `.env.ops` amb l'editor local. Emplenar
`NEON_ADMIN_DATABASE_URL` amb aquesta connexió directa i marcar
`JARVIS_FREE_PLAN_CONFIRMED="true"` només després de comprovar els dos panells.
No mostrar el fitxer amb cat ni enviar-ne el contingut al xat.

A Unix, restringir `.env.ops` amb `chmod 600 .env.ops`; a Windows, restringir l'ACL
al compte propi. Les rutes .env.* estan ignorades per Git. Els scripts normalitzen
TLS a `verify-full`, rebutgen pooling i endpoints fora d'AWS Frankfurt. No processen
URLs del xat ni de connectors. No cal un Neon API key: només connexió SQL pròpia.

Els scripts comproven nom de BD i taules buides abans d'aprovisionar. No eliminen
BD, dades o rols existents ni els adopten silenciosament. Fallar no imprimeix
errors de pg, paràmetres o credencials; cal revisar prerequisits localment.

### 3. Rols, migració i persistència (ordres explícites)

```sh
npm run ops:provision
npm run db:migrate
npm run db:verify
npm run token
npm run dev:verify-neon
```

- `ops:provision`: crea `jarvis_migrator` i `jarvis_runtime` per SQL, sense CREATEDB,
  CREATEROLE, BYPASSRLS o membresies. Configura permisos separats per BD i schema.
  Desa primer les credencials a `.env.database`, amb mode Unix 0600, per conservar
  capacitat de recuperació si una operació remota falla parcialment.
- `db:migrate`: aplica la SQL revisada 001 i registra checksum a `jarvis_migrations`
  en una mateixa transacció. Repetir-la és segur només si el checksum coincideix.
  Si hi ha esquema antic sense ledger, s'atura: no l'adopta automàticament.
- `db:verify`: prova TLS, connexió i privilegis mínims. Runtime: SELECT, INSERT i
  UPDATE(idempotency_key) a projects, sense DELETE, edició de name ni CREATE al schema.
- `token`: genera un token nou i el desa a `.env.client`; `.dev.vars` conté només
  hash, caducitat, owner i URL runtime. **Ja no imprimeix secrets.** Cap fitxer existent
  se sobreescriu; una rotació requereix decisió local explícita sobre els fitxers.
- `dev:verify-neon`: crea dos projectes ficticis amb claus estables i prova API→MCP
  i MCP→API amb instàncies noves. Utilitza l'adaptador real Neon des de Node;
  no publica servidor, no prova encara workerd remot ni clients conversacionals.

No hi ha una transacció global entre dues BD. Si el provisionament falla després
de desar credencials, no reexecutar ni esborrar fitxers a cegues: revisar l'estat
parcial localment amb els secrets ja conservats. No posar el rol migrador al Worker.

### 4. Còpia i restauració independent

```sh
npm run db:backup
npm run db:restore
```

La còpia es desa a `backups/projects.json` (directori ignorat, fitxer Unix 0600).
Llegeix projects sota transacció REPEATABLE READ READ ONLY i conserva IDs, propietari,
dates, estat i idempotència. Inclou format i checksum de la migració; es valida
l'estructura i el SHA-256. Màxim 10.000 projectes, només dades fictícies.

La restauració només admet `jarvis_restore`, al mateix endpoint, amb el rol
migrador i sense taules existents. Aplica esquema i files atòmicament i compara
el snapshot resultant complet. Mai esborra el destí ni toca la BD d'origen.
Fitxer preexistent o destí ocupat: falla tancat, no sobreescriu. No és pg_dump
complet: exclou rols, configuració, altres taules i recuperació del compte.
Checksum detecta corrupció, no autentica còpies externes desconegudes.

Aquesta és una prova acotada de restauració; no una política operativa per dades
personals. La còpia és local i no té xifrat propi ni retenció automatitzada.
No activar backups comercials ni emmagatzematge de pagament.

### 5. Prova del Worker local contra Neon

Després de configurar `.dev.vars`, `npm run dev` usa el rol runtime real.
En un segon terminal amb Node/npm disponibles:

```sh
npm run dev:verify-worker-neon
```

Aquesta ordre llegeix el token de `.env.client` sense imprimir-lo i prova API/MCP
contra el Worker local a 127.0.0.1:8787 i Neon real. Sense `--worker`,
`npm run dev:verify-neon` prova el mateix servei en Node amb l'adaptador Neon.
No requereix que l'usuari copiï cap token a arguments ni a la línia de comandes. Per aquesta prova local no usar `wrangler dev --remote` ni desplegar.
La configuració actual pública és `workers_dev: true` i `preview_urls: false`.

Inspector és opcional; les proves automàtiques utilitzen el SDK oficial.
La versió consultada 2.14.0 exigeix Node `^22.23.4 || ^24.22.1 || >=26.12.1`,
més recent que el Node de les proves locals inicials. No s'ha validat manualment.

## Proves de les operacions

`npm test` inclou límits de destí, TLS, corrupció de còpies i fitxers privats sense
overwrite. `npm run test:ops` requereix un **clúster local descartable nou**, amb
`jarvis_dev` i `jarvis_restore` buides, `OPS_TEST_ADMIN_URL` loopback i
`OPS_TEST_ISOLATED_CLUSTER=true`. Crea rols amb noms fixos en aquest clúster;
no donar-hi mai un servidor personal ni la configuració Neon de desenvolupament.
No elimina dades o rols al final: descartar/aturar el clúster de proves expressament.

La suite prova migració repetible, permisos negatius runtime, persistència,
restauració completa, reobertura d'una connexió i replay d'idempotència restaurat.
Són proves PostgreSQL reals però no acrediten per si soles accés al servei Neon.

## Límits gratuïts consultats — 2026-11-09

| Servei | Quota rellevant | Risc de disponibilitat |
| --- | --- | --- |
| Workers Free | 100.000 peticions/dia; CPU 10 ms/invocació | Errors en superar límits; encara sense mesura del projecte |
| Neon Free | 100 CU-h/mes, 1 GB de BD i 5 GB de transferència per projecte | Còmput suspès si s'esgota còmput/transferència; reactivació després d'inactivitat amb latència |

No afegir targeta, upgrades ni serveis opcionals de pagament. Dos noms de BD
al mateix branch no són dos còmputs independents; comparteixen quotes i endpoint.
La confirmació del pla al panell és necessària: la guia no acredita l'estat del compte.
Fonts: [Workers](https://developers.cloudflare.com/workers/platform/limits/) i
[Neon](https://neon.com/pricing). No es promet disponibilitat contínua gratuïta.

## Mesura de CPU — pendent amb Worker ja publicat

No s'ha mesurat CPU de Cloudflare. La durada total d'una petició amb BD i la CPU
no són equivalents; ni timings de Node ni un perfil local donen aquesta garantia.
El límit Workers Free consultat és 10 ms de CPU/invocació i 100.000 peticions/dia.
[Font oficial](https://developers.cloudflare.com/workers/platform/limits/).

Pla de prova acotada sobre la versió de desenvolupament autoritzada a D021:

1. Confirmar pla Free, només dades fictícies, permisos, TLS, restauració i absència
   de secrets en logs; mantenir l’endpoint i els accessos autoritzats a D021.
2. Anotar versió desplegada, data i finestra de prova. Fer una sèrie limitada
   (p. ex. 20 operacions per cas), sense càrrega continuada: salut, auth invàlida,
   crear sense clau, crear amb replay, recuperar, MCP initialize/list/call.
3. Separar el primer accés després d'inactivitat de les peticions calentes i
   incloure noms/descripcions propers als màxims permesos.
4. Al dashboard del Worker → Metrics/Analytics, registrar **CPU time per execution**,
   quantils disponibles i errors de límit; registrar latència a part. El gràfic fa
   mostreig: una mostra petita no és una garantia de pitjor cas ni un benchmark.
5. Comparar amb 10 ms; si hi ha poc marge o errors, optimitzar i repetir el cas afectat.
   No activar Paid ni modificar el stack silenciosament per fer passar el test.

La mètrica de CPU del proveïdor requereix execució remota autoritzada i compte
configurat; publicació autoritzada i executada, mesura encara no executada.
[Documentació de mètriques](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/).

## Dependències i comprovacions

Versions exactes i transitives a package-lock.json. SDK MCP, driver Neon, Zod i pg
(testos PostgreSQL) declaren MIT en les versions instal·lades; Wrangler declara
MIT OR Apache-2.0. Zod aporta schemas estrictes compartits amb MCP; el SDK evita
implementar el protocol; pg només serveix la integració local.

Fonts tècniques: [SDK MCP](https://github.com/modelcontextprotocol/typescript-sdk/tree/v1.x),
[driver Neon](https://neon.com/docs/serverless/serverless-driver),
[Inspector](https://modelcontextprotocol.io/docs/tools/inspector).

Límits i disponibilitat revisats en la proposta: [Workers](https://developers.cloudflare.com/workers/platform/limits/)
i [Neon Free](https://neon.com/pricing). Reconfirmar les condicions al compte abans
d'autoritzar recursos. L'espera de xarxa no és CPU de Worker, però la quota de
10 ms de CPU s'haurà de mesurar al desplegament. No hi ha garanties de servei gratuït.
Evidència de restauració local/remota a CURRENT_STATE; no confondre una prova
lògica de projects amb una política de còpies per dades personals.

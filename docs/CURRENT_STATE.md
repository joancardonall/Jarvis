# Estat actual

Actualitzat: 2026-11-11. Document principal d'estat executable i evidència.
Visió a [PRODUCT_VISION](PRODUCT_VISION.md), motius a [DECISIONS](DECISIONS.md).

## Aprovat

D011–D014: Workers JavaScript, Neon Free PostgreSQL, API i MCP al mateix Worker,
SQL explícit, autenticació temporal amb propietari derivat del token i idempotència
opcional. Únic increment autoritzat: crear i recuperar projectes amb dades fictícies.
Sense gestió completa d'usuaris, rols d'aplicació, OAuth, tasques, Telegram, Calendar o web.
D017 autoritza preparar recursos Free, migrar i provar recuperació amb dades
fictícies. D021 autoritza publicar el Worker de desenvolupament i preparar la
connexió amb Claude Code, ara disponible; només dades fictícies i pla Free.

## Publicació autoritzada — 2026-11-11

- Revisió del codi coherent amb l'abast documentat; `npm run check`, `npm test`
  (22/22) i `npm run build` repetits correctament.
- URL local configurada amb rol `jarvis_runtime` i BD `jarvis_dev`; token vigent
  fins al 2026-11-16. Cap secret imprès.
- Login OAuth oficial completat. Compte fixat a wrangler.jsonc; no hi havia scripts previs.
- Worker publicat: https://jarvis.jarvis-joancardonall.workers.dev
  Versió `9502a89d-20ca-4bae-89b2-00ffa4532fe1`. Ruta activa i previews desactivats.
- Cinc secrets runtime confirmats amb `wrangler secret list`, sense valors exposats.
- `npm run test:worker`: 1/1 correcte. Verificació remota intentada: handshake
  TLS fallit tant amb Node com curl; activació del certificat és una hipòtesi.
  API/MCP remots, CPU i Claude Code encara no verificats.
- Subscripcions: API retorna 403; pla Free confirmat anteriorment per l’usuari,
  sense nova verificació de billing per API ni activació de serveis de pagament.
- `.mcp.json` preparat amb variable d’entorn, sense token.
- Les referències a una nova aprovació de publicació als apartats històrics
  següents queden substituïdes per D021; publicació ja executada.

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
- Renovació del token (`npm run token:rotate`) conservant l'owner; provada amb
  fitxers sintètics. No s'ha executat sobre els secrets reals ni al Worker publicat.

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
| npm run dev:verify-neon | API/MCP cross-read, fresh app instance and real Neon persistence verified from Node |
| npm run db:backup | Logical projects snapshot saved privately |
| npm run db:restore | Restore into empty jarvis_restore verified against snapshot checksum |
| npm run build | Dry-run correcte; 1629,40 KiB / gzip 298,44 KiB; no desplegament |
| npm run dev + npm run dev:verify-worker-neon | API/MCP cross-read and real Neon persistence verified through local workerd HTTP |

S'ha arrencat el Worker **només a 127.0.0.1:8787**, i després s'ha aturat.
La prova cobreix HTTP i MCP amb el client SDK real contra workerd i Neon, sense LLM.
Els timings que Wrangler imprimeix són durada de petició, **no CPU del proveïdor**.

## Què continua pendent

- Worker públic desplegat segons D021; HTTPS i API/MCP→Neon verificats.
  Preview URLs desactivats. Compte verificat per CLI; billing API sense permisos.
- Mesura de CPU a Cloudflare: pla preparat a DEVELOPMENT, encara no executat.
- Disponibilitat remota del backend, reactivació després d'inactivitat sostinguda,
  límits reals sota càrrega i clients MCP conversacionals finals pendents.
- Windows, Inspector manual, Codex i Claude com a clients de Jarvis no verificats.
- La còpia només cobreix projects i migració coneguda: no és pg_dump complet,
  recuperació del compte ni política de còpies per dades personals. No hi ha
  xifrat propi, retenció automatitzada ni còpia fora del dispositiu provats.
- No hi ha OAuth, login web, rate limiter distribuït o garanties de disponibilitat.
  Quotes Free poden interrompre el servei; cap fallback facturable.

## Següent pas i aprovacions

La preparació Free, migració, persistència i restauració remotes de l'increment
han quedat verificades. No cal repetir ops:provision, token, backup o restore:
aquests scripts rebutgen sobreescriure fitxers o bases ja ocupats.

Publicació autoritzada i executada segons D021. Següent pas: mesurar
el consum de CPU i connectar Claude Code. HTTPS i `npm run dev:verify-remote` ja passen.
No habilitar autodeploy. Les dades personals continuen prohibides.
Guia i ordres a [DEVELOPMENT](DEVELOPMENT.md).

## Objectius futurs

Memòria personal, tasques, decisions, universitat, entrenaments, integracions,
web i proactivitat per Telegram continuen a la [visió](PRODUCT_VISION.md) i el
[roadmap](roadmap.md). No estan implementats ni autoritzats en aquest increment.

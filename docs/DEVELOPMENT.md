# Desenvolupament i proves

Aquest document és la guia d'execució. Estat i evidència a
[CURRENT_STATE](CURRENT_STATE.md); estructura a [ARCHITECTURE](ARCHITECTURE.md).

## Autenticació OAuth amb GitHub — D023

**Estat (2026-11-25): passos 1–8 executats per l'usuari; desplegat i verificat amb
GitHub, Claude web/app i Claude Code reals (tots nou passos fets).** Els passos es conserven
com a guia per tornar a configurar l'entorn o per a un altre entorn. Evidència i proves a [CURRENT_STATE](CURRENT_STATE.md);
decisió a [DECISIONS](DECISIONS.md); amenaces i proteccions a [SECURITY_PRIVACY](SECURITY_PRIVACY.md).

Què és: **OAuth** és un protocol estàndard perquè una aplicació (Claude) obtingui
permís per usar un servei (Jarvis) sense conèixer cap contrasenya. Claude obre el
navegador, inicies sessió amb GitHub i Jarvis entrega a Claude un token temporal.
Només el compte de GitHub amb ID numèric `209090554` (configurat a `wrangler.jsonc`)
pot entrar. Jarvis no guarda contrasenyes ni el token de GitHub.

### Passos de posada en marxa (pendents)

Ordre important: **migració i secrets abans del deploy**. Ordres al terminal, a l'arrel
del projecte. Cap pas imprimeix secrets; no els enviïs mai pel xat.

1. **Crear l'OAuth App a GitHub** (navegador). GitHub → Settings → Developer settings →
   OAuth Apps → New OAuth App. Nom `Jarvis`; Homepage URL
   `https://jarvis.jarvis-joancardonall.workers.dev`; Authorization callback URL
   `https://jarvis.jarvis-joancardonall.workers.dev/oauth/callback`; Device Flow desactivat.
   Després, «Generate a new client secret».
   *Resultat:* tens un Client ID i un Client secret. El secret només es mostra un cop.
   *Si falla:* si més endavant GitHub diu «redirect_uri mismatch», la callback URL
   d'aquí no coincideix lletra per lletra amb la de dalt (barra final, `http` vs `https`).
2. **Preparar el fitxer privat de secrets** (terminal):

   ```sh
   npm run oauth:setup
   ```

   Crea `.env.oauth.json` (permisos 0600, ignorat per Git) amb una `OAUTH_SIGNING_KEY`
   aleatòria ja generada i dos camps buits. Obre'l amb l'editor i enganxa-hi Client ID i
   Client secret. No el mostris amb `cat`.
   *Resultat:* missatge `Created private .env.oauth.json ... No secret printed.`
   *Si falla:* si el fitxer ja existeix, l'ordre s'atura i no el sobreescriu. Revisa'l
   abans de decidir; no l'esborris a cegues.
3. **Migrar la BD** (terminal):

   ```sh
   npm run db:migrate
   npm run db:verify
   ```

   `db:migrate` aplica la migració 002 (taula `oauth_grants`) i dona al rol runtime
   `SELECT, INSERT, UPDATE` sobre ella (mai DELETE). `db:verify` comprova els permisos.
   *Resultat:* totes dues acaben sense error.
   *Si falla:* si un checksum no coincideix, s'atura sense canviar res; no ho forcis.
4. **Iniciar sessió a Cloudflare** (terminal):

   ```sh
   npx wrangler login
   npx wrangler whoami
   ```

   *Resultat:* `whoami` mostra el compte propietari del Worker `jarvis`.
5. **Pujar els tres secrets nous** (terminal):

   ```sh
   npx wrangler secret bulk .env.oauth.json --name jarvis --env-file /dev/null
   ```

   Afegeix `OAUTH_SIGNING_KEY`, `GITHUB_CLIENT_ID` i `GITHUB_CLIENT_SECRET` i conserva
   els altres secrets. A Windows, posa un fitxer buit local en lloc de `/dev/null`.
   *Resultat:* Wrangler confirma tres secrets pujats.
6. **Desplegar el codi** (terminal):

   ```sh
   npx wrangler deploy --env-file /dev/null --message 'D023 OAuth with GitHub'
   ```

   *Resultat:* Wrangler mostra l'URL i un ID de versió nou.
7. **Comprovar el servidor** (terminal):

   ```sh
   curl https://jarvis.jarvis-joancardonall.workers.dev/.well-known/oauth-authorization-server
   npm run dev:verify-remote
   ```

   La primera ha de retornar JSON amb `issuer`. La segona prova API/MCP amb el token
   fix, només mentre sigui vigent (caduca el 2026-11-25T17:57:36.599Z).
   *Si falla:* 503 `oauth_not_configured` vol dir que falta un dels tres secrets o
   que té format incorrecte (p. ex. clau de signatura massa curta o camp buit).
8. **Connectar Claude web/app** (navegador). Customize → Connectors → eliminar el
   connector Jarvis antic → Add custom connector amb
   `https://jarvis.jarvis-joancardonall.workers.dev/mcp`, **sense capçaleres ni client id**
   → Connect → pantalla de Jarvis → marcar la casella de confirmació → «Continuar amb GitHub».
   *Resultat:* tornes a Claude i apareixen les dues eines.
   *Si falla:* «Aquest compte de GitHub no té accés a Jarvis» vol dir que el navegador
   té sessió amb un altre compte de GitHub; tanca'l a github.com i torna-ho a provar.
   Un 503 genèric durant el login sol indicar que la migració del pas 3 no s'ha aplicat
   (la taula `oauth_grants` no existeix).
9. **Connectar Claude Code** (terminal, a l'arrel del projecte). Reinicia Claude Code,
   escriu `/mcp`, tria `jarvis` i autentica: s'obrirà el navegador amb el mateix flux.
   *Resultat:* `jarvis` apareix connectat amb les dues eines.

Registra cada resultat real a [CURRENT_STATE](CURRENT_STATE.md); aquesta guia no és evidència.

### Desfer i revocació d'emergència

**Desfer el desplegament:** `npx wrangler rollback` (terminal) torna a la versió anterior.
La taula `oauth_grants` pot quedar-se: no molesta el codi antic.

**Revocar tot l'accés** (sospita de fuita): genera una `OAUTH_SIGNING_KEY` nova en un
JSON privat que només contingui aquesta clau i puja'l amb `npx wrangler secret bulk
FITXER_PRIVAT --name jarvis --env-file /dev/null` (`FITXER_PRIVAT` és un marcador).
Tots els tokens, codis i clients registrats deixen de ser vàlids a l'instant: cal tornar
a connectar Claude web i Claude Code. Per revocar una sola connexió sense SQL, amb el codi
de D027 hi ha `npm run oauth:revoke` (vegeu [Operacions de dades](#operacions-de-dades)).

### Provar el login en local (opcional)

Cal una **segona** OAuth App de GitHub amb callback `http://127.0.0.1:8787/oauth/callback`
i les tres variables a `.dev.vars` (format a `.dev.vars.example`). Després `npm run dev`.
La galeta `Secure` sobre `http://127.0.0.1` depèn del navegador: si falla aquí, no
demostra que falli en remot. No reutilitzis l'OAuth App de producció.

## Tasques, notes i resum diari — D024–D026

**Estat (2026-11-25): migració i desplegament executats.** La migració 003 es va aplicar a
Neon (pas 3) i el Worker es va publicar el 2026-11-25 (pas 4; versió
`962035a5-07aa-4cc5-84cf-fc66fb0367f3`, 13 eines, Cron Trigger registrat). Es va comprovar
amb `db:verify`, amb `dev:verify-neon` (driver HTTP real de Neon) i amb una lectura feta amb
la connexió OAuth real. **Encara pendents:** el pas 5 (reconnectar Claude web/app i Claude
Code perquè vegin les 13 eines), el pas 6 (validar-les amb dades fictícies) i tot l'apartat
de [Telegram](#telegram-opcional), que **no** està configurat; per tant, el cron es desperta
però no envia res. Els passos es conserven com a referència per tornar-los a fer en un altre
entorn. Evidència a
[CURRENT_STATE](CURRENT_STATE.md), decisions a [DECISIONS](DECISIONS.md), contractes a
[API_CONTRACT](API_CONTRACT.md) i [MCP_CONTRACT](MCP_CONTRACT.md), riscos a
[SECURITY_PRIVACY](SECURITY_PRIVACY.md).

Què afegeix: projectes amb estat, prioritat i dates de revisió; **tasques**; **notes**
(memòria explícita: decisions, preguntes obertes, fets, preferències); un resum de projecte;
un **resum diari** fet amb regles (sense IA); i, opcionalment, l'enviament d'aquest resum per
**Telegram** cada matí. Passa de 2 a 13 eines MCP. Només dades fictícies fins que hi hagi una
política de dades personals.

Un **Cron Trigger** és un «despertador» de Cloudflare: a les hores indicades a
`wrangler.jsonc` (`30 5-8 * * *`, en UTC) el Worker s'executa sol, sense cap petició. El
Worker mateix decideix si a Madrid ja són les 7 i si el resum d'avui ja s'ha gestionat.

### Posada en marxa de D024–D026 (passos 1–4 executats, 5–6 pendents)

Ordre important: **migració abans del deploy**; el codi nou falla si la BD no té les
taules noves. Ordres al terminal, a l'arrel del projecte i a la branca `feat/jarvis-core`
(el deploy publica el codi de la carpeta tal com està; fusionar a main requereix aprovació
apart). Cap pas imprimeix secrets. Publicar, migrar i pujar secrets els executa o els
confirma l'usuari.

1. **Comprovar el codi en local** (terminal):

   ```sh
   npm ci
   npm test
   npm run build
   ```

   *Resultat:* `npm test` acaba amb 52 proves passades (el recompte d'aquell moment; ara en
   són més) i `build` genera el paquet sense desplegar res. *Si falla:* no continuïs; el
   problema és al codi local, no a Neon. Executa `npm test` **sol** i llegeix-ne el resultat
   abans de desplegar: vegeu la lliçó a la
   [posada en marxa de D027–D028](#posada-en-marxa-de-d027d028-passos-13-executats-46-pendents).
2. **Còpia abans de migrar: atenció.** Amb el codi d'aquesta branca, `npm run db:backup`
   exigeix que la BD ja tingui les migracions 001–003. Abans de migrar, Neon només en té
   001–002, així que l'ordre s'atura amb `migration_mismatch` **sense escriure res** (deduït
   del codi, no executat contra Neon). Opcions, de més a menys senzilla:
   - Confiar en l'historial de recuperació de Neon per a aquest pas i fer la còpia format 2
     just després de migrar (pas 3b). Amb només dades fictícies, és la recomanació.
   - Fer la còpia amb el codi de D023 (`git switch main`, `npm run db:backup`,
     `git switch feat/jarvis-core`). Genera el format 1 (`backups/projects.json`), que el
     codi nou ja **no** pot restaurar i que s'atura si el fitxer ja existeix. No provat.
3. **Migrar i verificar la BD** (terminal):

   ```sh
   npm run db:migrate
   npm run db:verify
   ```

   `db:migrate` aplica la migració `003_tasks_notes_summary.sql` (taules `tasks`, `notes`,
   `summary_runs` i columnes noves a `projects`) i dona al rol runtime els permisos per
   columnes. Les migracions 001 i 002 ja aplicades es comproven pel checksum i no es
   repeteixen. `db:verify` comprova que el rol runtime pot fer el que cal i res més (ni
   esborrar ni canviar el propietari).
   *Resultat:* `Migrations 001-003 and runtime table grants verified.` i després
   `Runtime connection and minimum permissions verified.`
   *Si falla:* `migration_mismatch` vol dir que un checksum no coincideix: s'atura **sense
   canviar res**. No editis la migració per fer-la passar; revisa quin fitxer ha canviat.
   `privileges_too_broad` vol dir que el rol runtime té massa o massa pocs permisos.

   **3b. Còpia format 2** (terminal), ara que la BD ja té 001–003:

   ```sh
   npm run db:backup
   ```

   Desa projectes, tasques i notes en un fitxer **nou** amb data,
   `backups/jarvis-<data>.json` (privat, ignorat per Git, mai sobreescriu).
   *Resultat:* `Logical snapshot of projects, tasks and notes saved privately to ...`
4. **Desplegar el codi** (terminal):

   ```sh
   npx wrangler whoami
   npx wrangler deploy --env-file /dev/null --message 'D024 tasks, notes and daily summary'
   ```

   El deploy també crea el Cron Trigger. Sense secrets de Telegram, el cron es desperta però
   no fa res ni toca la BD. A Windows, posa un fitxer buit local en lloc de `/dev/null`.
   *Resultat:* Wrangler mostra l'URL, un ID de versió nou i el cron `30 5-8 * * *`.
   *Si falla:* després del deploy, un 503 `service_unavailable` en qualsevol eina sol voler
   dir que la migració 003 no s'ha aplicat (pas 3). Fes el pas 3 o desfés el deploy.
5. **Reconnectar els clients Claude** (navegador i terminal). A Claude web/app,
   Customize → Connectors → Jarvis: desconnectar i tornar a connectar (o refrescar). A
   Claude Code, `/mcp` → `jarvis` → reconnectar. Revisa els permisos de cada eina: les de
   lectura (`list_projects`, `get_daily_summary`…) poden anar a «Always allow»; les
   d'escriptura (`create_task`, `save_note`, `send_daily_summary`…) a **«Needs approval»**.
   *Resultat:* Jarvis mostra 13 eines.
   *Si falla:* si encara en veus 2, el client conserva la llista antiga: cal reconnectar.
6. **Validar amb dades fictícies** (xat de Claude). Demana, per exemple, «llista els meus
   projectes», «crea una tasca fictícia per demà al projecte X» i «què tinc avui?» (eina
   `get_daily_summary`). Després, en una conversa nova, recupera la tasca.
   *Resultat:* les eines responen sense `isError` i la tasca es conserva entre converses.
   Registra el resultat real a [CURRENT_STATE](CURRENT_STATE.md).

### Telegram (opcional)

Un **bot de Telegram** és un compte automàtic que creen els programes. Per parlar-hi des
d'un programa cal el seu **token del bot**: és una contrasenya (qui la té pot enviar
missatges com si fos el bot), per això és un secret i no surt mai del fitxer privat. El
**chat id** és el número que identifica la teva conversa amb el bot. Jarvis **només** envia
missatges a aquest chat configurat, i el bot no llegeix ni respon res (només de sortida).
Recorda que el text del resum (títols de tasques i projectes) surt cap a Telegram, un
servei extern.

1. **Crear el bot** (app de Telegram). Parla amb `@BotFather`, envia `/newbot` i tria nom i
   usuari. *Resultat:* BotFather et dona un token. No l'enganxis al xat de Claude.
2. **Preparar el fitxer privat** (terminal):

   ```sh
   npm run telegram:setup
   ```

   Crea `.env.telegram.json` (permisos 0600, ignorat per Git) amb dos camps buits. Obre'l
   amb l'editor i enganxa el token a `TELEGRAM_BOT_TOKEN`. No el mostris amb `cat`.
   *Resultat:* `Created private .env.telegram.json. ...`
   *Si falla:* si el fitxer ja existeix, l'ordre s'atura i no el sobreescriu.
3. **Escriure al bot** (app de Telegram). Obre el teu bot i envia-li qualsevol missatge,
   per exemple «hola». Així Telegram sap quin és el teu chat.
4. **Desar el chat id** (terminal):

   ```sh
   npm run telegram:chat
   ```

   Pregunta a Telegram quin xat privat ha escrit al bot més recentment i en desa l'id al
   fitxer. *Resultat:* `Chat <número> (<nom>) saved to .env.telegram.json. Check it is
   yours.` Comprova que el nom és el teu.
   *Si falla:* `no_private_message_found` vol dir que encara no has escrit al bot (pas 3)
   o que ha passat massa temps; torna a escriure-li i repeteix. `invalid_bot_token` vol dir
   que el token enganxat no té el format correcte.
5. **Pujar els dos secrets** (terminal):

   ```sh
   npx wrangler secret bulk .env.telegram.json --name jarvis --env-file /dev/null
   ```

   *Resultat:* Wrangler confirma `TELEGRAM_BOT_TOKEN` i `TELEGRAM_CHAT_ID` pujats; els altres
   secrets es conserven.
6. **Provar l'enviament** (xat de Claude). Demana «envia'm el resum a Telegram» (eina
   `send_daily_summary`, que ha de demanar aprovació). *Resultat:* reps el resum al teu
   Telegram. Aquest enviament a demanda no compta per al resum automàtic del matí.
   *Si falla:* `telegram_not_configured` (503) vol dir que falten els secrets o que tenen
   format incorrecte; `telegram_failed` (502) vol dir que Telegram ha rebutjat l'enviament
   (per exemple, chat id equivocat).

L'endemà, entre les 7 i les 10 (hora de Madrid), hauria d'arribar un sol resum automàtic si
hi ha alguna cosa a dir; un dia sense res a dir no envia res. Si l'enviament falla 3 cops,
aquell dia no hi ha resum (es prefereix zero missatges a duplicats).

**Apagar Telegram:** esborra els dos secrets (terminal):

```sh
npx wrangler secret delete TELEGRAM_BOT_TOKEN --name jarvis
npx wrangler secret delete TELEGRAM_CHAT_ID --name jarvis
```

Sense aquests secrets, el cron no envia res i `send_daily_summary` retorna
`telegram_not_configured`. Si sospites que el token s'ha filtrat, a més revoca'l a
`@BotFather` (ordre `/revoke`) i, si vols continuar, repeteix els passos amb el token nou.

### Desfer D024–D026

**Desfer el desplegament:** `npx wrangler rollback` (terminal) torna a la versió de D023.
Les taules i columnes noves poden quedar-se: el codi antic les ignora. L'únic canvi visible
seria un projecte amb estat diferent d'`active`, que el codi antic mostra igualment. No s'ha
provat què fa el Cron Trigger després d'un rollback; per assegurar que no s'envia res,
esborra també els secrets de Telegram. La migració 003 no es desfà automàticament.

## Política de dades i universitat — D027–D028

**Estat (2026-11-25): desplegat** des de la branca `feat/data-policy-university` (pujada a
GitHub, no fusionada a main). **Passos 1–3 executats** amb l'aprovació de l'usuari: migració
004 a Neon, còpia format 3 i Worker publicat (versió `2c87252d-e793-4e6a-84b5-deefe77c8151`,
19 eines). **Passos 4–6 pendents:** reconnectar els clients, validar amb dades fictícies i
confirmar la política. Contra Neon, `data:purge` només s'ha executat en previsualització (tot
a 0) i `oauth:connections` ha llistat 2 connexions; `oauth:revoke` i `data:purge --confirm`
no s'hi han executat. Evidència a
[CURRENT_STATE](CURRENT_STATE.md), decisions a [DECISIONS](DECISIONS.md), dades a
[DATA_MODEL](DATA_MODEL.md), contractes a [API_CONTRACT](API_CONTRACT.md) i
[MCP_CONTRACT](MCP_CONTRACT.md), riscos a [SECURITY_PRIVACY](SECURITY_PRIVACY.md).

Què afegeix. **D027 (política de dades)** és una **proposta** amb valors per defecte ja
implementats: a l'aplicació res s'esborra, només es *descarta* (una nota passa a `inactive`,
una tasca a `cancelled`, un projecte o una assignatura a `archived`). L'esborrat definitiu el
fa el desenvolupador amb una ordre, mai el Worker ni el model, perquè un error de la IA no
pugui destruir dades. També permet exportar-ho tot i gestionar les connexions OAuth sense
SQL. **D028 (universitat)** afegeix assignatures amb els seus grups (teoria, seminari,
laboratori) i tracta lliuraments i exàmens com a tasques amb `course_id`. Passa de 13 a 19
eines MCP. Fins que l'usuari confirmi la política, **només dades fictícies**.

### Posada en marxa de D027–D028 (passos 1–3 executats, 4–6 pendents)

Ordre important: **migració abans de la còpia i del deploy**. La còpia exigeix que la BD
tingui totes les migracions del codi, i el codi nou falla si la BD no té les taules noves.
Migrar primer és segur per al Worker actual: el codi publicat ignora les taules i la
columna noves. Ordres al terminal, a l'arrel del projecte i a la branca
`feat/data-policy-university` (el deploy publica la carpeta tal com està; fusionar a main
requereix aprovació apart). Cap pas imprimeix secrets.

**Lliçó del desplegament anterior.** El deploy de D024–D026 es va llançar en una sola ordre
encadenada darrere de les proves, i la sortida de `npm test` passava per un `grep`. Una prova
va fallar, però l'ordre encadenada va veure el resultat del `grep` (que sí havia trobat
text) i no el de `npm test`, i va desplegar igualment. Regla: **executa `npm test` sol,
llegeix el resultat i, només si no hi ha cap fallada, llança el deploy com a ordre a part.**
Mai `npm test | grep ... && npx wrangler deploy ...`.

1. **Migrar i verificar la BD** (terminal):

   ```sh
   npm run db:migrate
   npm run db:verify
   ```

   `db:migrate` aplica `004_courses.sql` (taules `courses` i `course_groups`, i la columna
   opcional `course_id` a `tasks` i `notes`) i dona al rol runtime els permisos per columnes
   de les taules noves (sense `DELETE` ni canvi de propietari). Les migracions 001–003 ja
   aplicades es comproven pel checksum i no es repeteixen.
   *Resultat:* `Migrations 001-004 and runtime table grants verified.` i després
   `Runtime connection and minimum permissions verified.`
   *Si falla:* `migration_mismatch` vol dir que un checksum no coincideix i s'atura **sense
   canviar res**; no editis cap migració per fer-la passar. `privileges_too_broad` vol dir
   que el rol runtime no té exactament els permisos esperats: no despleguis.
   **Executat el 2026-11-25:** migració 004 aplicada, permisos runtime verificats i
   `db:verify` correcte. També ha passat `npm run dev:verify-neon` ampliat (driver real de
   Neon, des de Node), que deixa files fictícies a Neon.
2. **Còpia format 3** (terminal):

   ```sh
   npm run db:backup
   ```

   Desa projectes, assignatures, grups, tasques i notes en un fitxer **nou**
   `backups/jarvis-<data>.json` (privat, ignorat per Git, mai sobreescriu).
   *Resultat:* `Logical snapshot of projects, courses, tasks and notes saved privately to ...`
   *Si falla:* `migration_mismatch` vol dir que la BD no té totes les migracions 001–004:
   torna al pas 1.
   **Executat el 2026-11-25:** `backups/jarvis-2026-11-25T16-32-13-325Z.json`.
3. **Proves i, després, deploy en una ordre a part** (terminal). Primer, només les proves:

   ```sh
   npm test
   ```

   *Resultat:* al final, el resum de Node mostra `pass 55` i `fail 0`. **Llegeix-lo.**
   *Si falla:* si `fail` no és 0, no despleguis; el problema és al codi local.

   Només si `fail` és 0, en una ordre nova:

   ```sh
   npx wrangler whoami
   npx wrangler deploy --env-file /dev/null --message 'D027-D028 data policy and university'
   ```

   A Windows, posa un fitxer buit local en lloc de `/dev/null`.
   *Resultat:* Wrangler mostra l'URL, un ID de versió nou i el cron `30 5-8 * * *`.
   *Si falla:* després del deploy, un 503 `service_unavailable` a les eines d'assignatures
   sol voler dir que la migració 004 no s'ha aplicat: fes el pas 1 o desfés el deploy.
   **Executat el 2026-11-25:** `npm test` sol, 55/55 i `fail 0`; després, en una ordre a part,
   deploy de la versió `2c87252d-e793-4e6a-84b5-deefe77c8151` amb el cron encara registrat.
   Comprovat des de fora: `/health` 200; `/mcp`, `/api/v1/export` i `/api/v1/courses` sense
   token 401; metadades OAuth 200.
4. **Reconnectar els clients Claude** (navegador i terminal). A Claude web/app, Customize →
   Connectors → Jarvis: desconnectar i tornar a connectar. A Claude Code, `/mcp` → `jarvis`
   → reconnectar. Recomanació de permisos: `list_courses` i `get_course_overview` poden anar a
   «Always allow»; `create_course`, `update_course` i `save_course_group` a **«Needs
   approval»**. `export_data` és de lectura, però bolca totes les teves dades a la conversa:
   és raonable deixar-la també a «Needs approval».
   *Resultat:* Jarvis mostra 19 eines.
   *Si falla:* si encara en veus 13, el client conserva la llista antiga: cal reconnectar.
5. **Validar amb dades fictícies** (xat de Claude). Per exemple: «crea l'assignatura fictícia
   Sistemes Operatius», «el seminari S102 el fa la professora Prova, dimarts de 10 a 12»,
   «qui em fa el seminari de Sistemes Operatius?», «afegeix la pràctica de SO per al dia 20»
   i «què tinc avui?». Després, en una conversa nova, «exporta les meves dades de Jarvis».
   *Resultat:* les eines responen sense `isError`, el grup no es duplica si el tornes a
   desar i l'exportació inclou l'assignatura. Registra el resultat real a
   [CURRENT_STATE](CURRENT_STATE.md).
   *Si falla:* `course_not_found` (404) vol dir que l'id de l'assignatura no existeix o no
   és teu; un error 422 `invalid_course...` indica un camp massa llarg o un valor no permès.
6. **Confirmar la política de dades** (lectura i decisió de l'usuari). Revisa D027 a
   [DECISIONS](DECISIONS.md): què es guarda, 30 dies abans de poder purgar i 90 dies com a
   màxim per a les còpies. Confirma-la o demana canvis **abans** de posar-hi dades reals.
   *Resultat:* D027 passa de proposada a aprovada a [DECISIONS](DECISIONS.md).

**Desfer:** `npx wrangler rollback` (terminal) torna a la versió de D024–D026
(`962035a5-07aa-4cc5-84cf-fc66fb0367f3`). Les taules i
la columna noves poden quedar-se: el codi anterior les ignora. La migració 004 no es desfà
automàticament.

### Operacions de dades

Aquestes ordres són el petit «manual de manteniment» de D027. **Atenció: actuen sobre la BD
real de Neon (`jarvis_dev`) amb el rol migrador** (les credencials de `.env.database`), no
sobre una còpia. Totes s'executen al terminal, a l'arrel del projecte. `data:purge` necessita
la migració 004 aplicada (pas 1 de dalt).

**Per què el `--`.** Quan escrius `npm run data:purge -- --days 0`, tot el que va després
del `--` passa al script; sense el `--`, npm es pot quedar els flags per a ell i el script no
els veu. Comprova sempre la primera línia de la sortida per saber què ha passat de debò.

#### Esborrar definitivament el descartat: `npm run data:purge`

Esborra per sempre el que ja estava descartat fa més de N dies (per defecte 30). Els dies es
compten des de `updated_at`, la darrera modificació, que normalment és el moment del descart.
Esborra exactament això:

- notes `inactive` (les que has demanat «oblidar»);
- tasques `cancelled` (les `done` es conserven com a historial);
- grups d'assignatura `inactive`;
- projectes `archived`, **amb totes les seves tasques i notes** (també les fetes);
- assignatures `archived`, **amb els seus grups, tasques i notes**;
- estat operatiu: connexions OAuth revocades, caducades o mai completades, i registres
  antics de `summary_runs` (el registre del resum diari).

**Excepció que protegeix dades vives:** si una tasca o nota és alhora d'un projecte arxivat i
d'una assignatura activa (o al revés), no s'esborra: només se li treu l'enllaç amb el que
desapareix. La sortida ho compta a part, a la línia `Kept because… (only unlinked)`.

**No toca els fitxers de `backups/`**: el que s'esborra pot continuar en còpies antigues.

**Per defecte només previsualitza.** Fa totes les esborrades dins d'una transacció i, al
final, la desfà (ROLLBACK). Així el recompte que veus és exacte, no una estimació, i la BD
queda igual. Només esborra de veritat amb `--confirm`. Opcions: `--days N` (enter de 0 a
3650; `--days 0` vol dir «tot el que ja està descartat, sense esperar») i `--confirm`.
**`--confirm` exigeix escriure `--days N`**: sense període explícit no s'esborra res. Qualsevol
altre argument (`--day 90`, `--days=90`, un valor buit) atura l'ordre amb
`invalid_purge_arguments` en lloc d'esborrar amb un valor per defecte.

```sh
npm run data:purge                           # previsualitza amb 30 dies
npm run data:purge -- --days 0               # previsualitza tot el descartat
npm run data:purge -- --days 0 --confirm     # esborra; irreversible
```

*Resultat de la previsualització:* `PREVIEW, nothing erased. Would erase (discarded more
than 30 days ago):`, una línia per taula (`notes: 1`, `tasks: 0`...) i `Repeat with
--confirm to erase. Backup files are not touched.` Amb `--confirm`, la primera línia és
`Permanently erased (discarded more than ... days ago):`.
*Si falla:* `invalid_days` vol dir que el número de dies no és vàlid. Davant de qualsevol
error la transacció es desfà i no s'esborra res.

**`--confirm` és irreversible.** L'única manera de recuperar-ho és restaurar una còpia
anterior (`db:restore`, que només restaura a `jarvis_restore`).

Exemple complet, oblidar una nota:

1. Al xat, «oblida la nota fictícia sobre l'horari de tutories». Jarvis la marca `inactive`:
   deixa de sortir a les cerques, però continua a la BD.
2. Si vols que desaparegui ja, sense esperar 30 dies, previsualitza (terminal):
   `npm run data:purge -- --days 0`. Comprova que surt `notes: 1` i que la resta de
   recomptes són els que esperes: amb `--days 0` també entra **tot** el que hagis descartat.
3. Si quadra, esborra: `npm run data:purge -- --days 0 --confirm`. *Resultat:*
   `Permanently erased ...` amb `notes: 1`.
4. Si la nota era a còpies antigues de `backups/`, continua allà: esborra aquells fitxers a
   mà si cal que desaparegui del tot.

#### Connexions OAuth: `oauth:connections` i `oauth:revoke`

Cada cop que un client (Claude web/app, Claude Code) inicia sessió es crea una
**connexió**. Aquestes ordres permeten veure-les i tallar-les sense escriure SQL.

```sh
npm run oauth:connections
```

*Resultat:* una línia per connexió amb l'id, l'estat (`active`, `expired`, `revoked` o
`never_completed`, un login que no es va acabar), el host del client (on Jarvis el retorna
després del login), la data de creació i l'última renovació. No mostra cap hash ni token.
Si no n'hi ha cap: `No client connections.`

```sh
npm run oauth:revoke -- ID_DE_LA_CONNEXIO
npm run oauth:revoke -- --all
```

`ID_DE_LA_CONNEXIO` és un marcador: copia l'id de la llista anterior.
*Resultat:* `Connections revoked: 1. Those clients must log in again.` El client perd
l'accés de seguida (també el token d'accés vigent) i ha de tornar a iniciar sessió.
*Si falla:* `invalid_connection_id` vol dir que l'id no té format d'UUID; `revoked: 0` vol
dir que aquella connexió ja estava revocada o no existeix.

Quan fer servir cada cosa:

- **Revocar una** (`-- ID`): un dispositiu perdut o una connexió vella que ja no uses.
- **Revocar totes** (`-- --all`): vols desconnectar tots els clients però no sospites que
  la clau de signatura s'hagi filtrat.
- **Canviar `OAUTH_SIGNING_KEY`** (vegeu [revocació d'emergència](#desfer-i-revocació-demergència)):
  continua sent l'interruptor d'emergència si sospites una fuita. A més de les connexions,
  invalida els registres de client i els fluxos de login a mig fer, que no són a la BD.

#### Exportar les teves dades

Amb el Worker de D027 desplegat, hi ha dues maneres d'obtenir tot el que Jarvis guarda de tu:

- Demanar a Claude «exporta totes les meves dades de Jarvis» (eina `export_data`).
- Fer `GET /api/v1/export` amb un token vàlid, des del terminal. `JARVIS_TOKEN` és un
  marcador; no enganxis mai el token al xat:

  ```sh
  curl -H "Authorization: Bearer JARVIS_TOKEN" \
    https://jarvis.jarvis-joancardonall.workers.dev/api/v1/export > export.json
  ```

*Resultat:* un JSON amb `exported_at`, `truncated` i les llistes `projects`, `tasks`,
`notes`, `courses` i `course_groups`, **incloent el que està arxivat, cancel·lat o
inactiu**. No porta `owner_id`, claus d'idempotència ni empremtes. Màxim 1.000 files per
taula: si `truncated` és `true`, alguna taula en tenia més i cal una còpia (`db:backup`)
per tenir-ho tot. El fitxer conté dades personals: guarda'l en un lloc privat i fora del
repositori.

#### Còpies: format 3

`npm run db:backup` ara escriu el **format 3**, que afegeix assignatures i grups (detall a
[Còpia i restauració independent](#4-còpia-i-restauració-independent)). **Els fitxers de
format 2 es poden continuar restaurant**: el que es va afegir després pren el valor per
defecte (per exemple, `course_id` buit). Les còpies **no es purguen soles**. Recomanació, quan
hi hagi dades reals: esborrar a mà els fitxers de `backups/` de més de 90 dies.

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
o .env.local. Els cinc valors consten com a secret_text. Aquell token caducava el
16 de novembre de 2026; s’ha renovat posteriorment segons D022. Caducitat vigent
i evidència a [CURRENT_STATE](CURRENT_STATE.md).
La prova remota reutilitza les dues claus fictícies existents, sense duplicats.
Primer intent: TLS handshake fallit, també amb curl. Posteriorment HTTPS funciona
sense canvis; després del redeploy amb secrets JSON, la prova remota completa passa.
Causa exacta del TLS inicial no confirmada; configuració de secrets com a causa
probable del 503 posterior. GET /health retorna 200; usar GET per provar salut,
ja que `curl -I` envia HEAD i aquesta ruta no admet HEAD públic.

### Claude Code

Amb D023, `.mcp.json` només declara transport HTTP i l'URL `/mcp`: **ja no porta
capçalera `Authorization`** ni llegeix `JARVIS_BEARER_TOKEN`. Claude Code rep un 401,
descobreix l'OAuth de Jarvis i obre el navegador per iniciar sessió amb GitHub.
Els passos són el 9 de la [posada en marxa](#passos-de-posada-en-marxa-pendents);
el Worker amb D023 ja està desplegat.

Les instruccions anteriors (carregar `.env.client` a l'entorn abans d'iniciar
`claude`) queden **obsoletes**. No usar `claude -p` ni executar un model
automàticament per comprovar-ho. Amb l'eina connectada, crear un projecte fictici
amb clau estable i recuperar-lo pel seu UUID en una conversa nova. Sense resposta
d'èxit de l'eina, no considerar-lo desat. No donar permisos generals d'escriptura
automàtica. Validat amb l'extensió de VS Code el 2026-11-25 (evidència a CURRENT_STATE).

### Claude web/app (connector remot)

El connector de Claude web/app és independent de `.mcp.json`. L'URL és
`https://jarvis.jarvis-joancardonall.workers.dev/mcp` i s'autentica amb OAuth:
**sense capçaleres, sense client id i sense token a l'URL**. Passos: el 8 de la
[posada en marxa](#passos-de-posada-en-marxa-pendents).

Les instruccions anteriors (opció «No sign in» i capçalera `Authorization: Bearer`)
queden **obsoletes**: Claude web, davant d'un 401, busca OAuth i el connector amb
token fix no funcionava. La confirmació del client real es registra a CURRENT_STATE.
[Guia oficial de connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
i [autenticació de connectors](https://claude.com/docs/connectors/building/authentication.md).

### Renovar el token fix (opcional)

Amb D023 el token fix és **opcional**: només serveix per a scripts com
`npm run dev:verify-remote`. Claude Code i Claude web/app ja no el necessiten.
Un cop OAuth estigui verificat amb els clients reals, es pot deixar caducar sense
renovar-lo: caducat o sense configurar, queda desactivat. `DEV_OWNER_ID` sí que
cal conservar-lo, perquè identifica el propietari de les dades també amb OAuth.

El token caduca als 7 dies. `npm run token:rotate` en genera un de nou i
substitueix només `DEV_TOKEN_SHA256` i `DEV_TOKEN_EXPIRES_AT` a `.dev.vars` i
el token a `.env.client`. **Conserva `DEV_OWNER_ID`**, de manera que els projectes
existents continuen visibles. El token antic deixa de ser vàlid. No imprimeix
cap secret. Si falta configuració vàlida, falla sense tocar res.

```sh
npm run token:rotate
npx wrangler secret bulk TOKEN_JSON_PRIVATE_PATH --name jarvis --env-file /dev/null
```

La renovació del 18 de novembre està autoritzada i executada segons D022.
Aquest procediment no autoritza futures rotacions automàticament. Abans de rotar,
conservar una còpia privada i
recuperable de .dev.vars i .env.client. Després, comprovar que owner i URL runtime
es conserven i preparar JSON privat amb només DEV_TOKEN_SHA256 i DEV_TOKEN_EXPIRES_AT;
el marcador TOKEN_JSON_PRIVATE_PATH s’ha de substituir per aquest fitxer.
En aquesta renovació s’ha utilitzat secret bulk, que conserva els altres secrets
i el codi publicat. A Windows, emprar un fitxer buit local a --env-file en lloc
de /dev/null. No repetir la publicació de codi per canviar només la credencial. No pujar .dev.vars directament ni mostrar secrets.

Les dues substitucions locals són successives, no una operació atòmica conjunta:
si falla la segona, pot quedar una parella inconsistent. Recuperar els dos fitxers
coherents de la còpia abans de continuar. No reexecutar a cegues.

La segona ordre actualitza els secrets del Worker publicat; fins llavors el
remot només accepta el token antic. `npm run token` continua
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

`npm test` (55 proves el 2026-11-25, amb el codi de D027–D028: 18 d'API/MCP, 14 d'OAuth, 14
de domini i 9 operatives): contracte HTTP/MCP amb storage simulat i serialització del driver
Neon amb HTTP simulat. Inclou `tests/oauth.test.js`: flux OAuth
complet amb el client oficial del SDK MCP i GitHub **simulat** (PKCE, redireccions,
consentiment, rotació de tokens, falsificacions); `tests/domain.test.js`: projectes,
tasques, notes, resum diari, dates de Madrid, Telegram **simulat** (D024–D026), assignatures,
grups i exportació (D027–D028), amb els
escenaris compartits `tests/domain-storage.js` i `tests/grant-storage.js` sobre el
simulador en memòria; i `tests/ops-unit.test.js`, les regles dels scripts operatius.
No requereix BD, LLM, GitHub, Telegram ni credencials reals.
`test:worker`: Wrangler/workerd local, ports 18787 i l'inspector de Wrangler;
comprova salut, autenticació, descoberta MCP (19 eines), metadades OAuth, registre i
pantalla de consentiment per xarxa loopback, sense Neon ni GitHub.
`build`: només empaquetament `wrangler deploy --dry-run`, no desplega.
`oauth:setup`: crea `.env.oauth.json` privat per al pas 2 de la
[posada en marxa](#passos-de-posada-en-marxa-pendents); no sobreescriu mai.
`telegram:setup`: crea `.env.telegram.json` privat (0600, ignorat per Git) amb els camps
`TELEGRAM_BOT_TOKEN` i `TELEGRAM_CHAT_ID` buits; no sobreescriu mai. `telegram:chat`:
amb el token ja enganxat, pregunta a Telegram quin xat privat ha escrit al bot i en desa
l'id; no imprimeix el token. Passos a [Telegram (opcional)](#telegram-opcional).
`data:purge`, `oauth:connections` i `oauth:revoke` (D027): purga del descartat (per defecte
només previsualitza), llistat i revocació de connexions OAuth, sobre la BD real amb el rol
migrador. Manual a [Operacions de dades](#operacions-de-dades).

`npm run dev` escolta només a 127.0.0.1:8787. Sense configuració, `/health`
funciona i les rutes privades fallen tancades. No hi ha fallback en memòria.

## PostgreSQL real dedicat

Instal·lar/arrencar PostgreSQL és una preparació local explícita. Crear una BD
**descartable i buida** anomenada `jarvis_test`, només a loopback. No usar mai
la BD personal ni la de desenvolupament. No hi ha Docker ni provisionament automàtic.
La recepta concreta que s'ha fet servir en aquesta màquina és a
[PostgreSQL local per a les proves d'integració](#postgresql-local-per-a-les-proves-dintegració).

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

Una segona prova aplica la migració 002 i executa sobre `oauth_grants` l'escenari
compartit `tests/grant-storage.js`: codis d'un sol ús, rotació de refresh tokens i
restriccions. Una tercera aplica la migració 003 sobre projectes ja existents (que es
conserven) i executa l'escenari compartit `tests/domain-storage.js`: projectes, tasques,
notes, registre del resum diari, restriccions, aïllament per propietari i 10 creacions i
10 reclamacions concurrents; amb D028 aplica també la migració 004 i hi afegeix assignatures,
grups, exportació, claus foranes entre propietaris i 10 desats simultanis del mateix grup, que
han de deixar una sola fila. Tots dos escenaris corren també a `npm test` contra el
simulador en memòria, perquè **simulador i SQL real no divergeixin**: si el simulador
accepta una cosa que PostgreSQL rebutja, la mateixa prova falla en un dels dos costats.

**Executades per primer cop el 2026-11-25** (PostgreSQL 17.12 local): `test:postgres` 3/3,
també sobre el codi de D023. Això tanca el pendent de D023, quan no hi havia PostgreSQL
local i el SQL de `oauth_grants` només s'havia provat sobre Neon amb ROLLBACK.
Repetides el 2026-11-25 amb el codi de D027–D028: 3/3. Evidència a
[CURRENT_STATE](CURRENT_STATE.md). No prova el driver HTTP de Neon.

### PostgreSQL local per a les proves d'integració

Què es va fer en aquesta màquina (macOS arm64, 2026-11-25): instal·lar PostgreSQL 17 amb
Homebrew i crear un **clúster descartable** en un directori temporal. Un clúster és una
instal·lació de PostgreSQL amb les seves BD, rols i fitxers; aquest no té res a veure amb
Neon, mai conté dades reals i es pot esborrar sencer en acabar.

Decisions de la recepta: escolta només a `127.0.0.1:55432` (un port diferent del 5432 per no
xocar amb cap altre PostgreSQL); autenticació `trust` (sense contrasenya, acceptable només
perquè és loopback i descartable); i **sense socket Unix**, perquè en un directori temporal
profund la ruta del socket superava el límit de longitud i el servidor no arrencava.

Recepta reproduïble (terminal, macOS amb Homebrew). `DIRECTORI_TEMPORAL` és un marcador:
crea'l amb `mktemp -d` i no el posis dins del projecte.

```sh
brew install postgresql@17
PGBIN="$(brew --prefix postgresql@17)/bin"
PGTMP="$(mktemp -d)"   # el teu DIRECTORI_TEMPORAL
"$PGBIN/initdb" -D "$PGTMP/data" -U postgres --auth=trust
"$PGBIN/pg_ctl" -D "$PGTMP/data" -l "$PGTMP/server.log" \
  -o "-p 55432 -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" start
for db in jarvis_test jarvis_dev jarvis_restore; do
  "$PGBIN/createdb" -h 127.0.0.1 -p 55432 -U postgres "$db"
done
```

*Resultat:* `pg_ctl` diu `server started` i les tres BD existeixen buides.
*Si falla:* mira `$PGTMP/server.log`; un port ocupat vol dir que ja hi ha un clúster a
55432 (atura'l abans).

Proves d'integració SQL (mateix terminal):

```sh
TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:55432/jarvis_test' npm run test:postgres
```

*Resultat esperat:* 3 proves passades. Es pot repetir: cada execució usa un schema propi.

Proves operatives (rols, migracions, permisos, còpia i restauració):

```sh
OPS_TEST_ADMIN_URL='postgresql://postgres@127.0.0.1:55432/jarvis_dev' \
OPS_TEST_ISOLATED_CLUSTER=true npm run test:ops
```

*Resultat esperat:* 1 prova passada. **Necessita un clúster acabat de crear a cada
execució**, perquè crea els rols `jarvis_migrator` i `jarvis_runtime` i omple
`jarvis_dev` i `jarvis_restore`, i no esborra res en acabar. Per repetir-la, atura i
esborra el clúster i torna a fer la recepta.

Aturar i esborrar el clúster (terminal):

```sh
"$PGBIN/pg_ctl" -D "$PGTMP/data" stop
rm -rf "$PGTMP"
```

Comprova abans que `$PGTMP` és el directori temporal que has creat i no una altra ruta.
A Windows aquesta recepta no s'ha provat.

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
- `db:migrate`: aplica les SQL revisades 001, 002 (`oauth_grants`, D023), 003 (`tasks`,
  `notes`, `summary_runs` i camps nous de `projects`, D024–D026) i 004 (`courses`,
  `course_groups` i `course_id` a tasques i notes, D028) i registra cada checksum
  a `jarvis_migrations` en transacció. Repetir-la és segur només si els checksums
  coincideixen. Concedeix al runtime permisos **per columnes**: `SELECT` i `INSERT`, i
  `UPDATE` només dels camps editables (p. ex. `title`, `status`, `due_date` a `tasks`; d'un
  grup, mai `kind`, `label` ni `course_id`).
  Mai DELETE ni `UPDATE` de `owner_id`, `id`, `created_at` o `request_hash`; a
  `oauth_grants`, `SELECT, INSERT, UPDATE`. Si hi ha esquema antic sense ledger, s'atura.
- `db:verify`: prova TLS, connexió i privilegis mínims del runtime: sense superusuari ni
  membresies; pot llegir i inserir a `projects`, `tasks`, `notes`, `courses`,
  `course_groups`, `summary_runs` i `oauth_grants` i editar-ne els camps permesos; no pot
  esborrar files, canviar el propietari de projectes, tasques, notes o assignatures ni crear
  objectes al schema.
- `token`: genera un token nou i el desa a `.env.client`; `.dev.vars` conté només
  hash, caducitat, owner i URL runtime. **Ja no imprimeix secrets.** Cap fitxer existent
  se sobreescriu; una rotació requereix decisió local explícita sobre els fitxers.
- `dev:verify-neon`: crea dos projectes ficticis amb claus estables i prova API→MCP
  i MCP→API amb instàncies noves. Utilitza l'adaptador real Neon des de Node;
  no publica servidor, no prova encara workerd remot ni clients conversacionals.
  Tant aquesta com `dev:verify-worker-neon` i `dev:verify-remote` necessiten un token
  fix **vigent**: el darrer va caducar el 2026-11-25. Per usar-les, `npm run token:rotate`
  (i, per al remot, pujar els dos secrets com a la [renovació](#renovar-el-token-fix-opcional)).

No hi ha una transacció global entre dues BD. Si el provisionament falla després
de desar credencials, no reexecutar ni esborrar fitxers a cegues: revisar l'estat
parcial localment amb els secrets ja conservats. No posar el rol migrador al Worker.

### 4. Còpia i restauració independent

```sh
npm run db:backup
npm run db:restore
```

**Format 3 (D027).** Cada `db:backup` desa un fitxer **nou** amb data,
`backups/jarvis-<data>.json` (directori ignorat, fitxer Unix 0600); mai sobreescriu una
còpia anterior. Llegeix `projects`, `courses`, `course_groups`, `tasks` i `notes` sota
transacció REPEATABLE READ READ ONLY i conserva IDs, propietari, dates, estat i
idempotència. Inclou format i checksums de les migracions 001–004; es valida l'estructura de
cada fila i el SHA-256. Si la BD no té exactament les migracions del codi (001–004), s'atura
amb `migration_mismatch`: no es pot fer la còpia amb el codi nou abans de migrar. Màxims:
10.000 projectes, 1.000 assignatures, 10.000 grups i 50.000 tasques i notes; només dades
fictícies fins que es confirmi D027.

**Els fitxers de format 2 (D026) es poden restaurar:** el que es va afegir després pren el
valor per defecte, com ho fan les migracions amb les files existents. Requisit: que les
migracions amb què es va fer la còpia existeixin al codi sense canvis. L'antic
`backups/projects.json` (format 1) ja no es pot restaurar amb aquest codi.

`db:restore` restaura la còpia **més recent** (per nom amb data). Només admet
`jarvis_restore`, al mateix endpoint, amb el rol migrador i sense taules existents.
Reconstrueix tot l'esquema (001–004) i insereix les files en **una sola transacció**: si
alguna cosa falla, la BD destí queda buida, no a mitges. Després compara fila per fila el
resultat amb el fitxer (no el checksum del fitxer, perquè una còpia de format 2 es llegeix
com a format 3).
*Resultat:* `Restore into empty jarvis_restore verified against snapshot checksum.` Mai esborra el destí ni toca la BD d'origen.
Fitxer preexistent o destí ocupat: falla tancat, no sobreescriu. No és pg_dump
complet: exclou rols, configuració, altres taules i recuperació del compte.
Checksum detecta corrupció, no autentica còpies externes desconegudes.
La còpia no inclou `oauth_grants` ni `summary_runs` (estat operatiu, no dades de
l'usuari): després de restaurar cal tornar a connectar els clients OAuth.

Aquesta és una prova acotada de restauració. La política proposada a D027 hi afegeix només
una recomanació: no conservar còpies de més de 90 dies quan hi hagi dades reals, esborrant-les
a mà. La còpia és local, en clar, sense xifrat propi ni retenció automatitzada.
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

`npm test` inclou límits de destí, TLS, corrupció de còpies (formats 2 i 3), fitxers privats
sense overwrite (també `.env.oauth.json` i `.env.telegram.json`) i la detecció de les
migracions 002, 003 i 004. `npm run test:ops` requereix un **clúster local descartable nou**, amb
`jarvis_dev` i `jarvis_restore` buides, `OPS_TEST_ADMIN_URL` loopback i
`OPS_TEST_ISOLATED_CLUSTER=true`. Crea rols amb noms fixos en aquest clúster;
no donar-hi mai un servidor personal ni la configuració Neon de desenvolupament.
No elimina dades o rols al final: descartar/aturar el clúster de proves expressament.

La suite prova migracions 001–004 repetibles amb ledger, **tot l'escenari de domini
executat amb el rol runtime** (també assignatures i grups), permisos negatius (DELETE, canvi
de propietari, DDL, camps fixos d'un grup), persistència, còpia format 3, restauració
completa i atòmica (una fila corrupta deixa la BD buida), reobertura d'una connexió, replay
d'idempotència restaurat, llistat i revocació de connexions OAuth i purga amb
previsualització i confirmació. **Executada per primer cop el 2026-11-25: 1/1**, i repetida
el mateix dia amb el codi de D027–D028: 1/1, amb el
[clúster local](#postgresql-local-per-a-les-proves-dintegració). Són proves PostgreSQL
reals però no acrediten per si soles accés al servei Neon.

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

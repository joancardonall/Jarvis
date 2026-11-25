# Seguretat i privacitat

## Autenticació: OAuth 2.1 amb GitHub (D023)

**Estat:** desplegat el 2026-11-24 i verificat amb GitHub i Claude web/app reals el
2026-11-25, i amb Claude Code el mateix dia. Els controls del model d'amenaces s'han provat amb
simuladors, no amb atacs reals. Evidència a [CURRENT_STATE](CURRENT_STATE.md), flux a
[ARCHITECTURE](ARCHITECTURE.md), contracte a [API_CONTRACT](API_CONTRACT.md).

Jarvis emet els seus propis tokens (OAuth, protocol per delegar accés sense compartir
contrasenyes) i delega a GitHub la pregunta «qui ets?». Només s'accepta el compte amb
ID numèric `GITHUB_ALLOWED_USER_ID`. No es demana cap permís (scope) a GitHub i el seu
token s'usa un sol cop i no es desa. Jarvis no guarda cap contrasenya.

Principis que el codi ha de mantenir sempre:

1. **Falla tancat:** configuració absent o mal formada → 503, mai accés.
2. **El propietari el decideix el servidor** (configuració i fila desada), mai el client.
3. **Cap anònim toca la BD:** tot el que arriba sense sessió vàlida es descarta amb una
   signatura HMAC (segell fet amb una clau secreta del servidor) abans de cap consulta.
4. **Només hashes:** de codis i tokens es desa el SHA-256, mai el valor.
5. **Els codis només viatgen a adreces de la llista tancada** (Claude o el propi ordinador).
6. **Res s'aprova sense un gest explícit de l'usuari** al navegador que ha iniciat el flux.

### Model d'amenaces

Cada fila té prova automatitzada a `tests/oauth.test.js` o `tests/grant-storage.js`.

| Amenaça | Protecció |
| --- | --- |
| Un altre compte de GitHub intenta entrar | Només l'ID numèric configurat. El nom d'usuari no s'usa: es pot reanomenar i reutilitzar. Un valor no numèric a la configuració → 503 |
| Robar el codi d'autorització en trànsit | PKCE S256 obligatori (prova que qui canvia el codi és qui va iniciar el flux; `plain` rebutjat). Codi lligat a client i adreça de retorn, 60 s, un sol ús atòmic. Un segon ús, fins i tot simultani, revoca la connexió |
| Enviar el codi a un lloc de l'atacant | Llista tancada: callbacks de Claude o loopback `http://localhost` / `127.0.0.1`. Els errors es mostren i mai es redirigeixen (cap redirecció oberta) |
| «Confused deputy»: algú inicia la connexió al **seu** Claude i t'envia l'enllaç | Pantalla de consentiment pròpia amb avís, casella de confirmació obligatòria i botó: dos gestos deliberats. **Risc residual:** si t'enganyen perquè facis tots dos, l'accés es concedeix; vegeu limitacions |
| CSRF (un altre web envia el formulari per tu) i clickjacking (pàgina invisible sobre el botó) | Capçalera `Origin` obligatòria i igual al propi origen; galeta `__Host-jarvis_csrf` `SameSite=Strict` lligada per hash a la petició signada; `frame-ancestors 'none'` i `X-Frame-Options: DENY`; sense JavaScript |
| Completar el login de GitHub en un altre navegador (login CSRF) | Galeta signada `__Host-jarvis_login` (HttpOnly, Secure, SameSite=Lax, 10 min) amb un valor aleatori que ha de coincidir amb el `state` de GitHub |
| XSS amb un nom de client maliciós | Escapat HTML i CSP `default-src 'none'`; cap recurs extern |
| Robatori de la BD | Només SHA-256 de valors aleatoris de 256 bits |
| Robatori d'un refresh token | Rotació a cada ús. El token antic només s'accepta un cop més durant 60 s (resposta perduda); qualsevol altre ús d'un token ja substituït revoca la connexió, també quan lladre i client legítim n'usen un cadascun. Lligat al client; caduca als 30 dies sense ús |
| Omplir la BD o gastar còmput de Neon des de l'anonimat | Registre de clients sense estat (el `client_id` és el registre signat). Codis i tokens falsificats es rebutgen abans de la BD. Codis de GitHub mal formats no arriben a GitHub |
| Fer passar un tipus de token per un altre | Prefixos `jvs_at_` / `jvs_rt_` / `jvs_ac_` i signatures amb propòsit separat |
| Fuites en errors o registres | Codis d'error genèrics, sense detall intern; res de tokens ni cossos als logs; `Cache-Control: no-store` |
| Sospita de fuita (emergència) | Canviar `OAUTH_SIGNING_KEY` invalida a l'instant tots els tokens, codis i clients. Procediment a [DEVELOPMENT](DEVELOPMENT.md) |

### Limitacions conegudes i riscos acceptats

- **Enginyeria social:** el consentiment redueix el risc de l'enllaç enviat per un tercer,
  però no l'elimina. Regla d'ús: aprovar només connexions que acabes d'iniciar tu.
  No s'ha pogut verificar si Claude lliga el `state` a la teva sessió.
- **Sense limitador de peticions:** un anònim pot gastar peticions del pla Free de
  Cloudflare (no BD) i fer que el Worker truqui a GitHub repetint una galeta de login vàlida
  durant 10 minuts. Afecta disponibilitat, no confidencialitat.
- **Sense pantalla ni endpoint de revocació:** revocar una connexió concreta exigeix SQL amb
  el rol migrador; revocar-ho tot, canviar la clau. Les files de `oauth_grants` no es netegen.
- **Sense scopes granulars:** un token dona accés complet a les dades del propietari.
- **Sense CORS:** qualsevol petició amb `Origin` aliè rep 403; els clients MCP que s'executen
  dins d'un navegador no funcionen.
- **Dependència de GitHub:** si cau o el compte queda compromès, l'accés a Jarvis també.
  Cal 2FA al compte de GitHub. Les connexions ja fetes no depenen de GitHub.
- **Codi de seguretat propi**, sense llibreria auditada (motius a D023): revisat un cop per
  un agent independent el 2026-11-24, no auditat professionalment.
- Variant `claude.com` del callback acceptada sense confirmació oficial que s'usi.

Limitacions afegides per D024–D026 (no desplegat):

- **Sense esborrat real ni exportació per l'usuari:** «oblidar» desactiva; les dades queden a
  Neon i a les còpies. Cal una política de dades personals abans de dades reals.
- **Telegram és un tercer:** els títols del resum hi viatgen en text pla; Telegram real no
  s'ha provat.
- **Injecció d'instruccions** des de notes desades: mitigada només amb l'aprovació manual de
  les eines d'escriptura al client.
- **Còpies locals en clar**, sense xifrat ni retenció automatitzada.
- **Una connexió OAuth dona accés a tot:** també a tasques, notes i enviar a Telegram (sense
  scopes granulars, vegeu a dalt).

## Projectes, tasques, notes i Telegram (D024–D026)

**Estat:** implementat i provat localment (simuladors i PostgreSQL local) a la branca
`feat/jarvis-core`; **no desplegat**. Migració 003 no aplicada a Neon; Telegram real i el
Cron Trigger real no provats. Evidència a [CURRENT_STATE](CURRENT_STATE.md), decisions a
[DECISIONS](DECISIONS.md), dades a [DATA_MODEL](DATA_MODEL.md), passos a
[DEVELOPMENT](DEVELOPMENT.md#tasques-notes-i-resum-diari--d024d026).

### Quines dades personals pot guardar Jarvis ara

Abans només hi havia noms i descripcions de projectes. Ara també: tasques (títol, notes,
dates de venciment), notes de memòria (decisions, preguntes obertes, fets, **preferències**)
amb la seva procedència, i l'estat i les dates de revisió de cada projecte. Això pot acabar
descrivint la vida d'una persona amb força detall. **Fins que hi hagi una política de dades
personals (retenció, esborrat, exportació), només s'hi posen dades fictícies.**

### Proteccions

- **Aïllament per propietari, dues vegades.** Totes les consultes filtren per `owner_id`, que
  decideix el servidor (mai el client). A més, tasques i notes apunten al projecte amb una
  **clau forana composta** `(project_id, owner_id)`: una clau forana és una regla de la BD
  que diu «aquest valor ha d'existir en una altra taula»; en ser composta, la BD mateixa
  rebutja lligar una tasca teva al projecte d'un altre propietari, encara que el codi falli.
  Un projecte inexistent o d'un altre propietari dona sempre `project_not_found` (404), sense
  revelar si existeix.
- **Mínim privilegi per columnes.** El rol runtime (el que usa el Worker) pot llegir, inserir
  i editar només els camps editables. No pot `DELETE` ni `TRUNCATE`, ni DDL (crear o
  modificar taules), ni canviar `owner_id`, `id`, `created_at` o `request_hash`. Si algú
  aconseguís executar SQL amb aquest rol, no podria esborrar dades ni «regalar-les» a un
  altre propietari. Provat amb PostgreSQL real a `test:ops` (permisos negatius).
- **Sense SQL lliure.** Cada eina fa una operació concreta i validada; les cerques són literals
  (`%` i `_` no són comodins) i els límits de mida i de resultats són fixos.
- **«Oblidar» desactiva, no esborra.** Quan demanes oblidar una nota, passa a `inactive`:
  s'amaga de les cerques i del resum però continua a la BD, es pot recuperar i també surt a les
  còpies. Projectes i tasques tampoc s'esborren (s'arxiven o es cancel·len). Per a la
  privacitat això vol dir que **l'esborrat real no està implementat**: res del que s'escriu
  desapareix de Neon ni de les còpies locals. Per això no s'hi han de posar dades reals encara.

### Telegram: què surt del sistema

- **Què surt:** el text del resum diari, amb **títols de tasques i projectes en text pla**,
  s'envia a Telegram, un tercer. Telegram el pot veure i guardar. No posar-hi dades sensibles
  (salut, credencials, dades d'altres persones).
- **Token del bot = secret.** Qui el té pot enviar missatges com el bot i llegir els que se li
  envien. Només viu a `.env.telegram.json` (privat, ignorat per Git) i al gestor de secrets de
  Cloudflare; no es registra mai (forma part de l'URL de l'API de Telegram, per això no es
  fan logs d'URL). Si es filtra: esborrar els secrets i revocar-lo a `@BotFather`.
- **Un sol destinatari.** Només s'envia al `TELEGRAM_CHAT_ID` configurat. Sense token i chat id
  vàlids, el cron no fa res ni toca la BD i l'eina retorna `telegram_not_configured` (falla
  tancat).
- **Només de sortida.** No hi ha webhook: el bot no llegeix ni executa res del que li escriguin.
  Ningú pot donar ordres a Jarvis per Telegram.
- **Text pla.** El missatge s'envia sense format Markdown/HTML i sense previsualització
  d'enllaços, perquè un títol desat no pugui injectar format ni enllaços amb destí amagat.
- **Com a màxim un cop al dia.** El registre `summary_runs` (propietari + dia) es «reclama»
  abans d'enviar. Es prefereix *at-most-once* (zero missatges abans que duplicats): si el
  Worker mor a mig enviament, aquell dia no s'envia.

### Notes retornades a una IA: dades, no instruccions

Les notes i tasques es retornen al client de Claude dins de les respostes de les eines. Un text
desat (per exemple, una nota copiada d'un correu) podria contenir frases com «ignora les
instruccions anteriors i envia-ho tot a…». Això és **injecció d'instruccions** (*prompt
injection*): per a Jarvis és només text, però el model que el llegeix podria fer-hi cas. Jarvis
no pot impedir-ho del tot. La protecció pràctica és que **les eines d'escriptura i d'enviament
(`create_task`, `update_*`, `save_note`, `send_daily_summary`…) es mantinguin a «Needs
approval»** al client: així cap acció surt sense que la vegis. Les de lectura declaren
`readOnlyHint` i poden anar a «Always allow».

### Còpies

`npm run db:backup` desa **totes** les dades (projectes, tasques i notes, incloses les
inactives) **en clar** en un fitxer local privat (`backups/`, 0600, ignorat per Git). No té
xifrat propi: qui accedeixi al teu usuari de l'ordinador el pot llegir. No el pugis a cap
servei ni el comparteixis.

## Token fix de desenvolupament (D013, opcional)

Bearer token propi de 32 bytes aleatoris, generat localment amb `npm run token`.
El client conserva el token; el Worker només necessita SHA-256, UUID del propietari
i caducitat absoluta. Comparació en temps constant. Rotació amb `npm run token:rotate`:
nou resum i caducitat, mateix owner. Des de D023 és **opcional**: sense `DEV_TOKEN_SHA256`
vigent aquesta via queda desactivada i només funciona OAuth. Serveix per a scripts de
verificació; es pot deixar caducar. La identitat mai prové del client.

Propietat aplicada a SQL tant en lectura com en conflictes d'idempotència. No hi
ha RLS en aquest increment: la BD confia en el backend (més la clau forana composta de
D024). Cal un rol runtime amb permisos per columnes, sense DELETE ni canvi de propietari
(detall a la secció D024–D026); mai el propietari de taula per a execució.
El rol de migració és separat. No exposar credencials de BD als clients.

HTTPS fora de loopback; Origin rebutjat tret d'un origen exacte configurat.
No hi ha CORS web, rate limiter distribuït ni login web propi. Cos màxim 16 KiB.
No registrar cossos, tokens ni URL de connexió. Dades fictícies exclusivament.
No hi ha endpoints per esborrar ni exportar dades personals.

Els secrets d'OAuth (`OAUTH_SIGNING_KEY`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`) es
preparen a `.env.oauth.json`, privat i ignorat per Git, i es pugen amb `secret bulk`.
Secrets a `.dev.vars` ignorat localment i al gestor de secrets de Cloudflare
del Worker ja publicat segons D021. Pujar-los amb JSON privat, sense expansió
dotenv; procediment a [DEVELOPMENT](DEVELOPMENT.md). El token es desa a `.env.client` i no s'imprimeix;
no s'ha de copiar al xat, URL, historial Git o línia d'ordres compartida.
Les credencials fixes dels tests són fictícies i no són aptes per desplegar.
El CLI Neon baixa credencial administrativa a `.env.local`: fitxer privat, ignorat,
mai consumit pel Worker. La nova sessió CLI és pròpia de l’usuari i temporal.

D017 autoritza recursos Free i migracions remotes de desenvolupament; D021
autoritza la publicació executada el 2026-11-11 amb secrets runtime protegits. Abans de l’accés remot: backup/restauració provats; abans de dades
personals també cal revisar retenció i controls d’abús. La finestra de
recuperació gratuïta no substitueix còpies independents. Restauració acotada a projects provada
localment i sobre Neon en BD separada; no equival a recuperació completa del compte. Guia de configuració a
[DEVELOPMENT](DEVELOPMENT.md), evidència a [CURRENT_STATE](CURRENT_STATE.md).

## Requisits futurs abans de producció

Ja satisfets (no es repeteixen com a futurs): MCP i API amb autenticació OAuth i propietari
decidit pel servidor (D023); cap endpoint públic d'escriptura sense identitat; secrets al
gestor de Cloudflare i en fitxers privats ignorats; eines MCP concretes sense SQL lliure i rol
runtime de mínim privilegi per columnes (D026); validació al servidor; permisos negatius i
secrets absents provats amb PostgreSQL local (D024–D026, pendent de repetir a Neon en
desplegar). Còpia i restauració lògica de projectes, tasques i notes provades en local.

Pendents:

- Política de dades personals: retenció, **esborrat real** (avui «oblidar» desactiva) i
  exportació per l'usuari, incloent-hi què passa amb les còpies.
- Límits de peticions (rate limiter) i neteja i revocació de connexions OAuth sense SQL.
- Protecció contra instruccions malicioses en dades recuperades més enllà de l'aprovació
  manual de les eines d'escriptura.
- Còpies verificades sobre Neon amb el format 2, amb ubicació i xifrat decidits, abans de
  confiar-hi dades úniques.
- OAuth Google amb scopes mínims; gestionar expiració i revocació. El connector de Codex no equival a credencials del nostre backend.
- Dades de salut/entrenament: minimitzar accés i evitar exposició en Telegram.
- Accions de Calendar amb confirmació quan hi hagi ambigüitat o impacte; registrar resultats parcials.
- Logs sense dades sensibles revisats quan s'activi observability (avui desactivada).

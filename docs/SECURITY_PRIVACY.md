# Seguretat i privacitat

## Autenticació: OAuth 2.1 amb GitHub (D023)

**Estat:** implementat i provat amb simuladors; **no desplegat** ni validat amb GitHub o
Claude reals. Evidència a [CURRENT_STATE](CURRENT_STATE.md), flux a
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

## Token fix de desenvolupament (D013, opcional)

Bearer token propi de 32 bytes aleatoris, generat localment amb `npm run token`.
El client conserva el token; el Worker només necessita SHA-256, UUID del propietari
i caducitat absoluta. Comparació en temps constant. Rotació amb `npm run token:rotate`:
nou resum i caducitat, mateix owner. Des de D023 és **opcional**: sense `DEV_TOKEN_SHA256`
vigent aquesta via queda desactivada i només funciona OAuth. Serveix per a scripts de
verificació; es pot deixar caducar. La identitat mai prové del client.

Propietat aplicada a SQL tant en lectura com en conflictes d'idempotència. No hi
ha RLS en aquest increment: la BD confia en el backend. Cal un rol runtime amb
SELECT/INSERT i UPDATE(idempotency_key) només de projects; mai el propietari de taula per a execució.
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

- MCP remot i API requereixen autenticació i autorització; no confiar en IDs proporcionats pel model.
- Cap endpoint públic que permeti escriure dades personals sense identitat verificada.
- Secrets (DB, Telegram, OAuth) només en gestor de secrets/variables segures; mai `.env` versionat.
- Principi de mínim privilegi; eines MCP concretes, sense SQL lliure.
- Validació server-side, límits de peticions, logs sense dades sensibles i protecció contra instruccions malicioses en dades recuperades.
- OAuth Google amb scopes mínims; gestionar expiració i revocació. El connector de Codex no equival a credencials del nostre backend.
- Còpies de seguretat i exportació verificades abans de confiar-hi dades úniques.
- Retenció i eliminació definides; decisions de «oblidar» poden requerir esborrat o desactivació segons política i còpies.
- Dades de salut/entrenament: minimitzar accés i evitar exposició en Telegram.
- Accions de Calendar amb confirmació quan hi hagi ambigüitat o impacte; registrar resultats parcials.
- Provar permisos negatius i secrets absents abans de desplegar.

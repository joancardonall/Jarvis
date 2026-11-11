# Seguretat i privacitat

## Increment actual de desenvolupament

Bearer token propi de 32 bytes aleatoris, generat localment amb `npm run token`.
El client conserva el token; el Worker només necessita SHA-256, UUID del propietari
i caducitat absoluta. Comparació de hashes sense sortida anticipada; configuració
incompleta falla tancada. Rotació amb `npm run token:rotate`: nou resum i caducitat, mateix owner; un token per entorn,
sense usuaris, rols o OAuth. Un token vàlid permet crear i llegir només el seu owner.
La identitat es deriva de configuració segura del token, mai del client.

Propietat aplicada a SQL tant en lectura com en conflictes d'idempotència. No hi
ha RLS en aquest increment: la BD confia en el backend. Cal un rol runtime amb
SELECT/INSERT i UPDATE(idempotency_key) només de projects; mai el propietari de taula per a execució.
El rol de migració és separat. No exposar credencials de BD als clients.

HTTPS fora de loopback; Origin rebutjat tret d'un origen exacte configurat.
No hi ha CORS web, rate limiter distribuït, OAuth o login web. Cos màxim 16 KiB.
No registrar cossos, tokens ni URL de connexió. Dades fictícies exclusivament.
No hi ha endpoints per esborrar ni exportar dades personals.

Secrets a `.dev.vars` ignorat localment i al gestor de secrets de Cloudflare quan
s'autoritzi desplegar. El token es desa a `.env.client` i no s'imprimeix;
no s'ha de copiar al xat, URL, historial Git o línia d'ordres compartida.
Les credencials fixes dels tests són fictícies i no són aptes per desplegar.
El CLI Neon baixa credencial administrativa a `.env.local`: fitxer privat, ignorat,
mai consumit pel Worker. La nova sessió CLI és pròpia de l’usuari i temporal.

D017 autoritza recursos Free i migracions remotes de desenvolupament; D021
autoritza la publicació executada el 2026-11-11 amb secrets runtime protegits. Abans de l’accés remot: backup/restauració provats; abans de dades
personals també cal revisar retenció i controls d’abús. La finestra de
recuperació gratuïta no substitueix còpies independents. Restauració acotada a projects provada
localment i sobre Neon en BD separada; no equival a recuperació completa del compte. Configuració pendent a
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

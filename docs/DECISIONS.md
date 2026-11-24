# Registre de decisions (ADR lleuger)

## D021 — Publicació de desenvolupament i client Claude Code — 2026-11-11

**Estat:** publicació executada; HTTPS i API/MCP→Neon remots verificats. CPU i client conversacional pendents.
**Decisió:** publicar el Worker de desenvolupament a Cloudflare Free amb HTTPS,
autenticació temporal i secrets runtime, mantenint només dades fictícies i les
dues operacions actuals. Preparar la connexió MCP amb Claude Code, ara disponible.
**Justificació:** validar el circuit remot des d'un client conversacional real.
**Alternatives descartades:** ampliar mòduls abans de validar el circuit, activar
Paid, autodeploy o reutilitzar credencials de connectors.
**Conseqüències:** l'autorització de publicació substitueix la restricció de D017;
no autoritza dades personals, serveis facturables ni noves funcionalitats. Claude
Code es pot validar sense retirar la compatibilitat prevista amb Codex. Cal
comprovar compte, desplegament, API/MCP remots i CPU abans de declarar-los verificats.
El login OAuth oficial de Cloudflare requereix intervenció de l'usuari.

## Acceptades funcionalment — 2026-11-08

- D001: Claude serà la interfície conversacional principal; Jarvis no tindrà chatbot propi a l'inici. **Substituïda temporalment per D010 pel que fa al client inicial.**
- D002: La informació estructurada de Jarvis persistirà en una BD pròpia i serà accessible per MCP.
- D003: La captura de memòria començarà amb ordres explícites de l'usuari.
- D004: Telegram serà el canal dels resums i recordatoris.
- D005: Jarvis farà seguiment de projectes i tasques fins i tot sense venciment, respectant pauses i evitant soroll.
- D006: L'app Jarvis substituirà Hevy per al registre futur d'entrenaments.
- D007: Objectiu de cap despesa recurrent nova i cap ordinador permanentment encès.
- D008: Primer validar el circuit conversa → persistència → recuperació → avís.

## D009 — Conversió del repositori — 2026-11-09

**Estat:** acceptada expressament per l'usuari.

**Context:** coexistien un pla de chatbot amb FastAPI/Ollama i la nova visió
centrada en Claude, dades estructurades, MCP, PWA i Telegram.

**Decisió:** la visió de `jarvis_starter` passa a ser l'únic projecte principal.
La documentació i els prompts es mouen a l'arrel. Es retiren el prototip de xat,
els seus tests, dependències, configuració Python local i el pla anterior.
No es manté un segon projecte ni una còpia d'arxiu dins del repositori.

**Conseqüències:** no hi ha aplicació executable ni stack escollit. La proposta
anterior de persistir converses deixa de ser el següent mòdul. Aquesta decisió
no aprova Workers, FastAPI, Supabase, OAuth ni cap implementació funcional.
La tria posterior de stack i increment es registra a D011–D014.

**Validació:** estructura única, enllaços locals resolubles i absència del codi
retirat i de referències operatives al pla antic.

## D010 — Codex com a client inicial — 2026-11-09

**Estat:** acceptada expressament per l'usuari; substitueix temporalment D001
pel que fa a Claude com a interfície inicial.

**Context:** l'usuari no té accés a Claude i vol utilitzar Codex de moment.

**Decisió:** Codex és el client inicial de treball i la interfície prevista per
validar el circuit de projectes. Claude deixa de ser un requisit per començar.
Jarvis conserva el domini i el contracte MCP independents del client.

**Conseqüències:** validar la connexió MCP, autenticació i permisos en el client
Codex real abans de considerar el flux operatiu. No assumir disponibilitat web,
iPhone, Calendar, API facturable ni execució programada a partir de l'accés actual.
No es configuren integracions ni es reutilitzen credencials d'aquest xat.
Backend, BD i hosting estaven oberts en aquesta decisió; resolts després a D011.
Una futura incorporació de Claude
requerirà validació pròpia, sense duplicar la lògica de domini.

**Validació pendent:** crear i recuperar un projecte persistent en una sessió
nova de Codex, amb permisos comprovats i confirmació real de l'eina.

## D011 — Worker JavaScript i PostgreSQL Neon Free — 2026-11-09

**Estat:** aprovada expressament; implementació del primer increment autoritzada.
**Decisió:** un Worker JavaScript i Neon Free; SQL explícit, sense ORM.
**Justificació:** JS conegut, execució gestionada sense PC sempre encès i cost
recurrent addicional zero dins les quotes gratuïtes.
**Alternatives descartades per aquest increment:** FastAPI (nou hosting i stack),
Supabase Free (pausa per inactivitat), ORM (complexitat prematura).
**Conseqüències:** dependència del driver Neon, quotes i possibles interrupcions;
cap garantia de disponibilitat contínua. No autoritza recursos ni desplegament.
Substitueix P002, P003 i P006; Supabase deixa de ser el candidat seleccionat.

## D012 — API i MCP compartits — 2026-11-09

**Estat:** aprovada expressament.
**Decisió:** API HTTP i MCP Streamable HTTP al mateix Worker, amb serveis de domini
i repository compartits. Primer increment: crear i recuperar projectes.
**Justificació:** mateix comportament i permisos per als dos clients.
**Alternatives descartades:** dos backends o MCP que es crida a si mateix per HTTP.
**Conseqüències:** proves creuades entre transports; SDK MCP oficial, sense LLM als
 tests. Cap tasca, Calendar, Telegram ni interfície web en aquest increment.

## D013 — Autenticació temporal de desenvolupament — 2026-11-09

**Estat:** aprovada expressament, sense usuaris, rols ni OAuth complets.
**Decisió:** Bearer token d'alta entropia, resum SHA-256 al servidor, caducitat i
owner UUID derivat de configuració segura. Totes les consultes filtren propietari.
**Justificació:** circuit de desenvolupament segur amb identitat explícita.
**Alternatives descartades:** accés anònim, owner enviat pel client, login propi o
OAuth prematur. Sense infraestructura de gestió d'usuaris/rols.
**Conseqüències:** rotació manual; no és OAuth MCP interoperable ni login web.
Només dades fictícies; secrets propis, mai credencials de les eines del xat.
**Actualització 2026-11-24:** D023 afegeix OAuth; aquest token passa a ser opcional,
només per a scripts de verificació.

## D014 — Idempotència opcional — 2026-11-09

**Estat:** aprovada expressament; corregeix la proposta anterior d'obligatorietat.
**Decisió:** clau opcional; si es proporciona, es garanteix per propietari i clau.
**Justificació:** clients senzills sense obligació de claus; reintents segurs quan
el client els demana. Una clau amb contingut diferent és un conflicte.
**Alternatives descartades:** clau obligatòria, deduplicar per nom o només en memòria.
**Conseqüències:** sense clau cada petició crea un projecte; no repetir escriptures
automàticament sense clau. Restricció SQL i operació atòmica per concurrència.

## Proposades, NO decidides

- P001: React PWA (futur).
- P004: Cron i accés propi a Calendar (futur).
- P005: OAuth per a la futura PWA (ajornat). L'OAuth per a clients MCP ja està decidit a D023.

## Format per a decisions futures

Títol / data / estat / context / decisió / justificació / alternatives descartades /
conseqüències / evidència de validació. L'estat executable es consulta a
[CURRENT_STATE.md](CURRENT_STATE.md), no s'infereix de l'aprovació.

## D015 — Documentació Markdown permanent — 2026-11-09

**Estat:** aprovada expressament.
**Decisió:** Markdown és la font de veritat de visió, decisions, contractes i estat;
cal sincronitzar-la amb codi i proves en cada tasca. Normes completes a AGENTS.md.
**Justificació:** evitar plans contradictoris i funcionalitats declarades sense evidència.
**Alternatives descartades:** decisions només al xat o estat duplicat a molts documents.
**Conseqüències:** document principal per tema, enllaços i estat explícit proposat /
aprovat / implementat / verificat; cap canvi d’abast aprovat sense consulta.

## D016 — Implementació simple de la persistència inicial — 2026-11-09

**Estat:** decisió d'implementació dins D011–D014, sense ampliar l'abast aprovat.
**Decisió:** conservar idempotència amb el projecte a la mateixa fila, protegida
per UNIQUE(owner_id, idempotency_key), amb SQL transaccional i replay sense canvis.
**Justificació:** només hi ha creació/lectura; no cal coordinar dues taules.
**Alternatives descartades:** mapa en memòria (no és durable ni concurrent),
segona taula i dues escriptures (més complexitat per a aquest increment).
**Conseqüències:** clau retinguda amb projecte, UPDATE necessari per retornar la
fila en conflicte; una futura edició haurà de revisar la resposta immutable de replay.
Evidència de concurrència i rollback a [CURRENT_STATE](CURRENT_STATE.md).

## D017 — Preparació Free autoritzada, sense publicació — 2026-11-09

**Estat:** aprovada expressament per l'usuari.
**Decisió:** preparar Cloudflare Free i Neon Free a la UE, dades fictícies, credencials
separades, migracions, connexió, persistència i restauració de desenvolupament.
Preparar la mesura de CPU; no publicar el Worker ni utilitzar dades personals.
**Justificació:** validar infraestructura i recuperació abans de confiar-hi dades.
**Alternatives descartades:** pressupost de pagament, reutilitzar credencials del
xat, compartir secrets als missatges o provar restauració sobre la BD original.
**Conseqüències:** guia manual dels panells, fitxers secrets locals ignorats i nova
aprovació abans del desplegament públic. No cal tornar a aprovar la preparació ja
autoritzada. L'estat real i les confirmacions de compte són a CURRENT_STATE.

## D018 — Recuperació lògica acotada al primer increment — 2026-11-09

**Estat:** decisió d'implementació dins la preparació autoritzada a D017.
**Decisió:** dues BD al mateix branch: jarvis_dev i jarvis_restore, amb una còpia
lògica privada de projects i checksum de la migració SQL. Restaurar només a una
BD buida i comparar íntegrament el resultat, incloses claus d'idempotència i dates.
**Justificació:** l'única dada de negoci actual és projects; restauració portable,
independent de la finestra gratuïta del proveïdor i sense dependències noves.
**Alternatives descartades:** restaurar a sobre de l'origen, confiar només en
snapshots de Neon o afegir infraestructura de backup general prematurament.
**Conseqüències:** còpia limitada a aquest esquema (màxim 10.000 projectes), no és
pg_dump complet ni recuperació de rols, configuració o pèrdua del compte Neon.
Fitxer només local, sense xifrat propi; no és encara política per dades personals.
El checksum detecta corrupció, no autentica un fitxer d'origen desconegut.
Una taula jarvis_migrations registra la revisió aplicada i el seu SHA-256 en la
mateixa transacció. No s'accepta incorporar automàticament un esquema ja existent.

## D019 — Permisos operatius mínims — 2026-11-09

**Estat:** concreció de D013 i D017, sense usuaris o rols d'aplicació.
**Decisió:** crear rols PostgreSQL per SQL sense membresies administratives:
jarvis_migrator té CREATE/USAGE al schema i és propietari de les seves taules;
jarvis_runtime té SELECT, INSERT i només UPDATE(idempotency_key) a projects.
**Justificació:** Neon pot crear rols administratius des del panell; l'upsert
necessita actualitzar exclusivament la columna de la clau, no tot el projecte.
**Alternatives descartades:** rol inicial de Neon al Worker o UPDATE de totes les
columnes. No es crea un servei de gestió d'usuaris/rols de producte.
**Conseqüències:** secrets generats en fitxers privats; rotació manual i verificació
de privilegis. Els dos canvis de permisos de les BD no són una transacció global:
un error parcial exigeix inspecció, no reexecució cega ni esborrat automàtic.

## D020 — Configuració oficial Neon sobre el projecte confirmat — 2026-11-09

**Estat:** flux CLI demanat i destí confirmat expressament per l'usuari.
**Decisió:** init/deploy només amb PostgreSQL sobre Jarvis `plain-heart-00084011`,
Frankfurt Free, branch production; no l'ID diferent del prompt original.
**Justificació:** reutilitzar el projecte correcte i validar de punta a punta sense
canviar l'arquitectura del backend ni afegir serveis.
**Alternatives descartades:** executar a cegues l'ID del prompt, usar Ohio, activar
Functions/Auth o posar la credencial inicial de Neon al runtime.
**Conseqüències:** neon.ts és configuració del proveïdor, no TypeScript del producte;
CLI i skill oficial instal·lats, paquets de configuració només dev. Driver HTTP
existent preservat: no s'afegeix Hyperdrive ni ORM. Credencial administrativa
baixada a .env.local usada només per preparació; runtime separat a .dev.vars.
Pla revisat i deploy sense canvis, sense serveis addicionals o upgrades.
Nova aprovació encara necessària per publicar Cloudflare. Evidència a CURRENT_STATE.


## D022 — Renovació de credencial per a Claude web/app — 2026-11-18

**Estat:** autoritzada i executada el 2026-11-18; nou token verificat amb SDK
MCP oficial. Actualització del connector Claude web/app encara pendent de l’usuari.
Evidència d’execució a CURRENT_STATE.
**Decisió:** renovar el token temporal i la caducitat mantenint owner, BD i codi;
actualitzar els dos secrets d'autenticació del Worker existent i preparar el
connector de Claude web/app amb capçalera Bearer, sense introduir OAuth.
**Justificació:** diagnòstic real: salut 200, token local caducat el 16 de novembre
i initialize MCP amb aquesta credencial retorna 401. El servidor no està apagat.
**Alternatives descartades:** eliminar autenticació, allargar el token antic,
regenerar owner (perdria accés als projectes) o afegir OAuth fora d'abast.
**Conseqüències:** còpia privada recuperable abans de substituir fitxers; revocació
del token antic i nova caducitat de set dies. Login Cloudflare propi si cal;
cap valor de token al xat, logs o Git. La connexió de Claude es verifica separadament
de la prova del servidor amb el SDK. Sense canvis de producte, merge o push.


## D023 — OAuth 2.1 propi amb inici de sessió de GitHub — 2026-11-24

**Estat:** aprovada expressament per l'usuari el 2026-11-24, amb implementació completa,
adaptació de directrius i commit/push de la branca. **Implementada i provada localment;
no desplegada ni validada amb GitHub o Claude reals.** Evidència a
[CURRENT_STATE](CURRENT_STATE.md).
**Context:** el connector de Claude web/app no funciona amb el token fix de D013: en
rebre un 401 busca OAuth (protocol estàndard per delegar accés sense compartir
contrasenyes), que Jarvis no oferia. A més, el token caducava cada 7 dies i calia
enganxar-lo a mà.
**Decisió:** el Worker fa també de servidor d'autorització OAuth 2.1. La identitat es
delega a GitHub i només s'accepta un compte, identificat pel seu ID numèric
(`209090554`, usuari `joancardonall`). Pantalla de consentiment pròpia, PKCE S256
obligatori, registre dinàmic de clients sense estat, access tokens d'1 hora i refresh
tokens de 30 dies amb rotació. Estat a Neon (taula `oauth_grants`, migració 002), només
com a hashes SHA-256. El propietari de les dades continua sent el mateix UUID.
Flux a [ARCHITECTURE](ARCHITECTURE.md), contracte a [API_CONTRACT](API_CONTRACT.md),
amenaces a [SECURITY_PRIVACY](SECURITY_PRIVACY.md).
**Justificació:** és el mecanisme que Claude espera; elimina la rotació manual; cap
contrasenya desada a Jarvis; cap servei ni dependència nova; tot el codi és llegible
i provable amb el simulador i amb el client OAuth oficial del SDK MCP.
**Alternatives descartades:**
- Llibreria `@cloudflare/workers-oauth-provider`: mantinguda per Cloudflare, però
  exigeix un servei nou (KV), no es pot provar amb les proves Node actuals i el seu
  registre de clients escriu a l'emmagatzematge sense autenticació.
- Contrasenya pròpia: tota la seguretat dependria d'un secret endevinable i d'un
  limitador d'intents que no tenim.
- Tokens sense estat (signats, sense BD): no permeten codis d'un sol ús, rotació ni
  revocació individual.
- Identificar el compte pel nom d'usuari: es pot reanomenar i algú altre el pot reutilitzar.
- Client ID Metadata Documents (CIMD): obligaria el Worker a descarregar URLs externes
  (risc SSRF, peticions a destins triats per un tercer); Claude ja funciona amb registre dinàmic.
- Cloudflare Access o un proveïdor d'identitat extern: servei addicional i menys control.
**Conseqüències:** més superfície pública (set rutes noves sense token) i codi de
seguretat propi que cal mantenir i revisar; tres secrets nous i una OAuth App a GitHub;
sense limitador de peticions, endpoint de revocació, CORS ni scopes granulars (limitacions
a SECURITY_PRIVACY). Canviar `OAUTH_SIGNING_KEY` revoca totes les connexions. El token fix
queda com a via opcional. Substitueix la restricció «sense OAuth» de D013 i D022.
Publicar continua sent una acció explícita de l'usuari (login de Wrangler i secrets).
**Evidència de validació:** proves i límits a [CURRENT_STATE](CURRENT_STATE.md).

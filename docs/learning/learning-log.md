# Registre d'aprenentatge

## 2026-11-11 — Estat actual i flux Git

Reconciliació documental aprovada: CURRENT_STATE presenta l'estat vigent, sense
confondre errors històrics resolts amb bloquejos actuals. HTTPS i API/MCP remots
verificats; CPU, client conversacional i rotació real pendents. Conservats els
23 tests i la secció de renovació, corregint la pujada amb JSON i explicitant
el risc de substitució parcial dels dos fitxers. No s'ha rotat cap secret.

[Flux Git](../GIT_WORKFLOW.md): branca per tasca, un agent a la carpeta principal,
worktrees si hi ha paral·lelisme, commits petits permesos a la branca; merge i
push necessiten aprovació. Sense canvis d'arquitectura, domini o infraestructura.
Comprovacions i limitacions comunicades en el tancament de la tasca.

Preguntes de comprensió:
1. Què ens permet revisar una branca abans de fusionar-la a main?
2. Per què passar 23 tests sintètics no demostra una rotació remota real?
3. Per què el token pot canviar mentre el propietari dels projectes es conserva?

Cap concepte nou es marca com a après.

## 2026-11-11 — Diagnòstic HTTPS i secrets de desplegament

TLS ja funciona sense canvis: causa inicial desconeguda. Un 503 posterior en
operacions BD s'ha resolt redesplegant el mateix codi amb secrets JSON explícits.
Wrangler prioritza variables de procés en fitxers dotenv: un fitxer correcte no
garanteix que el valor pujat sigui el mateix. JSON evita aquesta expansió.
API/MCP remots i Neon passen amb dades fictícies; CPU i Claude Code pendents.
Detall i evidència a [CURRENT_STATE](../CURRENT_STATE.md), procediment a
[DEVELOPMENT](../DEVELOPMENT.md). Cap concepte nou confirmat com a après.

## 2026-11-11 — Worker remot i preparació Claude Code

D021 autoritza publicació de desenvolupament i Claude Code. Mateixa arquitectura:
client → HTTPS/Bearer → API o MCP → servei compartit → rol runtime → Neon.
Worker desplegat amb secrets protegits; previews i autodeploy desactivats.
Alternatives: no ampliar mòduls ni passar a Paid per validar el circuit actual.
Ordres a [DEVELOPMENT](../DEVELOPMENT.md), resultats a
[CURRENT_STATE](../CURRENT_STATE.md). TLS remot encara falla; certificat inicial
és una hipòtesi, no una causa demostrada. CPU i client Claude Code pendents.

Preguntes de comprensió:
1. Per què Claude Code rep el Bearer token però mai la connexió PostgreSQL?
2. Quina diferència hi ha entre desplegament correcte i circuit remot verificat?
3. Per què la latència HTTPS no acredita el consum de CPU del Worker?

Cap concepte nou es marca com a après.

## 2026-11-09 — Conversió a la nova visió

L'usuari ha autoritzat que la visió de `jarvis_starter` sigui el projecte principal
i que es retiri el contingut anterior innecessari (D009).

- Documentació i prompts traslladats a l'arrel; instruccions unificades.
- Retirats el backend d'eco, els seus tests i dependències, el pla de converses/IA
  local, l'entorn virtual i la configuració de VS Code exclusiva de Python.
- Cap nova funcionalitat, dependència, servei, migració o desplegament.
- Arquitectura prevista: Claude interpreta → MCP autenticat → serveis de domini
  validen → BD conserva; PWA consulta/edita i jobs generen avisos per Telegram.
  Tot aquest flux continua pendent d'implementació i validació.

Abans de la conversió l'auditoria havia verificat 11 tests del prototip i
`pip check`. Aquests resultats són històrics i no validen el producte nou.
Ara no hi ha suite executable; la revisió de conversió comprova estructura,
enllaços Markdown i absència d'artefactes antics, sense serveis externs.

Conceptes pendents de confirmació: visió de producte vs implementació,
adaptador MCP vs domini, i decisió de stack vs retirada d'un prototip.

Preguntes de comprensió:
1. Quina responsabilitat té Claude i quina té Jarvis?
2. Per què retirar FastAPI no significa haver escollit Workers?
3. Què cal validar abans de confiar dades personals al MCP remot?

Cap concepte es marca com a après.

## 2026-11-09 — Client inicial Codex

D010 substitueix temporalment Claude per Codex perquè l'usuari no té accés a
Claude. S'han alineat README, visió, arquitectura, casos d'ús, contracte MCP,
automatitzacions, seguretat, instruccions i roadmap. Les mencions anteriors
a Claude en aquest registre descriuen el context històric de D009.

El canvi és documental: cap integració configurada ni validada. La disponibilitat
del client no acredita connexió al futur MCP de Jarvis ni credencials del backend.
No s'han executat proves funcionals perquè encara no hi ha aplicació executable.
Cap concepte es marca com a après.

## 2026-11-09 — Primer increment de projectes i documentació permanent

D011–D014 aproven stack i abast; D015 fixa la documentació com a font de veritat.
Implementats API i MCP amb el mateix servei, validació estricta, autenticació
temporal i propietari derivat del token. SQL explícit i migració d'una sola taula;
idempotència opcional amb clau única per propietari (D016).

Flux i alternatives a [ARCHITECTURE](../ARCHITECTURE.md), ordres exactes a
[DEVELOPMENT](../DEVELOPMENT.md), resultats i límits reals a
[CURRENT_STATE](../CURRENT_STATE.md). No es dupliquen aquí les guies.

Proves locals sense IA ni dades personals: contractes i client MCP oficial,
PostgreSQL dedicat amb concurrència/rollback i smoke workerd separat. Neon remot,
restauració operativa i clients conversacionals reals queden pendents.
Recursos externs i desplegament requereixen aprovació separada; no s'han executat.

Preguntes de comprensió:
1. Què canvia quan envies dues altes amb clau respecte a dues altes sense clau?
2. Per què el propietari no pot venir dels arguments MCP o del JSON HTTP?
3. Què demostren les proves locals i què falta comprovar amb Neon real?

Conceptes pendents de confirmació: transacció, UNIQUE amb NULL, idempotència,
adaptador vs servei, autenticació vs propietat i evidència vs pla.
Cap concepte es marca com a après.

## 2026-11-09 — Comprensió confirmada per l'usuari

L'usuari ha respost correctament i confirma aquests conceptes:

- Sense clau d'idempotència, dues peticions iguals poden crear projectes diferents;
  el contingut igual no permet deduir la intenció del client.
- Derivar el propietari del token evita que el client s'atribueixi arbitràriament
  la identitat d'un altre propietari.
- Les proves locals no validen Neon real, desplegament Cloudflare, CPU,
  disponibilitat remota, restauració de còpies ni compatibilitat amb els clients
  MCP finals. L'evidència operativa continua a [CURRENT_STATE](../CURRENT_STATE.md).

Només aquests conceptes es marquen com a compresos. Transaccions, UNIQUE amb NULL
i separació adaptador/servei continuen pendents de confirmació específica.
Aquesta resposta educativa no autoritza recursos externs ni desplegaments.

## 2026-11-09 — Preparació operativa Free

D017 autoritza recursos gratuïts de desenvolupament i verificació, sense publicar
Worker. D018–D019 concreten restauració lògica i privilegis mínims de BD.
S'han afegit scripts operatius amb secrets privats sense imprimir, migració
registrada amb checksum i restauració només a destí buit. La prova local real
verifica persistència, permisos negatius i recuperació inclosa idempotència.
Resultats i confirmacions remotes a [CURRENT_STATE](../CURRENT_STATE.md); guia
manual de panells i pla de CPU a [DEVELOPMENT](../DEVELOPMENT.md).

La confirmació de comptes de l'usuari no substitueix verificar la connexió real.
Conceptes encara pendents: rol SQL vs rol d'aplicació, còpia de dades vs recuperació
completa, checksum vs autenticitat i CPU vs latència. Cap concepte nou confirmat.

## 2026-11-09 — Neon real i prova end-to-end

L'usuari ha demanat CLI init/deploy i ha confirmat el projecte de Frankfurt de la
captura davant d'un ID divergent del prompt (D020). API confirma Free i regió UE.
Skill neon-postgres consultada; es preserven driver HTTP i SQL explícit aprovats.

Connexió, rols mínims, migració i restauració lògica en una altra BD verificats
sobre Neon real. Build correcte, Worker arrencat només a loopback i flux API/MCP
contra Neon verificat; servidor aturat després. Evidència a
[CURRENT_STATE](../CURRENT_STATE.md), procediment a [DEVELOPMENT](../DEVELOPMENT.md).
Cap Worker públic, servei de pagament, dades personals o commit/push.

Preguntes pendents de revisió educativa:
1. Per què la URL inicial baixada pel CLI no s'utilitza directament al Worker?
2. Què recupera la nostra còpia lògica i què queda fora?
3. Per què un temps de resposta de Wrangler no prova el consum de CPU de Cloudflare?

Cap concepte nou es marca com a après sense confirmació de l'usuari.

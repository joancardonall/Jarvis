# Jarvis

Plataforma personal de dades i seguiment. La [visió completa](docs/PRODUCT_VISION.md)
inclou memòria personal, projectes, tasques, universitat, entrenaments,
integracions i seguiment proactiu per Telegram. Són objectius; l'abast executable
es consulta exclusivament a [CURRENT_STATE](docs/CURRENT_STATE.md).

## Què fa ara

Cloudflare Worker JavaScript amb API HTTP i MCP Streamable HTTP, SQL explícit sobre Neon
PostgreSQL i autenticació OAuth 2.1 amb inici de sessió de GitHub (D023), pensat per
connectar Claude. Jarvis gestiona projectes (llistar, cercar, pausar, arxivar,
prioritzar), tasques amb venciment, notes de memòria explícita (decisions, preguntes
obertes, fets, preferències), la vista d'un projecte i un resum diari per regles que es pot
enviar per Telegram: 13 eines MCP i les rutes API equivalents, amb idempotència opcional i
aïllament per propietari. D027–D028 (versió 0.3.0) hi afegeix assignatures amb
grups i professorat, lliuraments com a tasques de l'assignatura, exportació de totes les
dades i operacions de política de dades per al desenvolupador (purga del que s'ha
descartat i gestió de connexions OAuth): 19 eines. Només dades fictícies.

Amb Node >=22.19.0 i npm:

```sh
npm ci
npm run check
npm test
npm run test:worker
npm run build
```

Les proves PostgreSQL dedicades i la configuració d'execució estan a la
[guia de desenvolupament](docs/DEVELOPMENT.md). **Estat:** desplegat = D023–D028 (19 eines,
migracions 003 i 004 a Neon, publicat el 2026-11-25); falta que Claude web/app i Claude Code
es reconnectin i provin les 19 eines, Telegram no està configurat i la política de dades
(D027) és una proposta pendent de confirmar, per això només dades fictícies. `npm run dev`
arrenca en loopback; sense secrets, només salut és operativa.

## Documents principals

- [Visió](docs/PRODUCT_VISION.md) i [casos d'ús](docs/USE_CASES.md).
- [Estat real](docs/CURRENT_STATE.md), [decisions](docs/DECISIONS.md) i [roadmap](docs/roadmap.md).
- [Arquitectura](docs/ARCHITECTURE.md) i [model de dades](docs/DATA_MODEL.md).
- [API](docs/API_CONTRACT.md) i [MCP](docs/MCP_CONTRACT.md).
- [Seguretat](docs/SECURITY_PRIVACY.md) i [automatitzacions](docs/AUTOMATIONS.md).
- [Execució i proves](docs/DEVELOPMENT.md), [aprenentatge](docs/learning/learning-log.md)
  i [normes de desenvolupament](AGENTS.md).

La documentació Markdown és la font de veritat del projecte i s'ha de mantenir
sincronitzada amb decisions, codi i proves. Es distingeixen proposat, aprovat,
implementat i verificat. Les integracions i els desplegaments requereixen
validació i permisos propis. Cap cost addicional sense autorització. Commits a la
branca de tasca permesos; merge i push amb aprovació segons el
[flux Git](docs/GIT_WORKFLOW.md).

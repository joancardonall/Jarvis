# Jarvis

Plataforma personal de dades i seguiment. La [visió completa](docs/PRODUCT_VISION.md)
inclou memòria personal, projectes, tasques, universitat, entrenaments,
integracions i seguiment proactiu per Telegram. Són objectius; l'abast executable
es consulta exclusivament a [CURRENT_STATE](docs/CURRENT_STATE.md).

## Primer increment

Cloudflare Worker JavaScript amb API HTTP i MCP Streamable HTTP per crear i
recuperar projectes, SQL explícit sobre Neon PostgreSQL i autenticació temporal.
Idempotència opcional i aïllament per propietari. Només dades fictícies.

Amb Node >=22.19.0 i npm:

```sh
npm ci
npm run check
npm test
npm run test:worker
npm run build
```

Les proves PostgreSQL dedicades i la configuració d'execució estan a la
[guia de desenvolupament](docs/DEVELOPMENT.md). Neon Frankfurt/Free, permisos, persistència i restauració de desenvolupament
estan verificats, inclòs Worker local→Neon. Worker publicat segons D021; HTTPS i circuit API/MCP→Neon remots verificats.
Validació conversacional amb Codex o Claude Code pendent. `npm run dev`
arrenca en loopback; sense secrets, només salut és operativa.

## Documents principals

- [Visió](docs/PRODUCT_VISION.md) i [casos d'ús futurs](docs/USE_CASES.md).
- [Estat real](docs/CURRENT_STATE.md), [decisions](docs/DECISIONS.md) i [roadmap](docs/roadmap.md).
- [Arquitectura](docs/ARCHITECTURE.md) i [model de dades](docs/DATA_MODEL.md).
- [API](docs/API_CONTRACT.md) i [MCP](docs/MCP_CONTRACT.md).
- [Seguretat](docs/SECURITY_PRIVACY.md) i [automatitzacions futures](docs/AUTOMATIONS.md).
- [Execució i proves](docs/DEVELOPMENT.md), [aprenentatge](docs/learning/learning-log.md)
  i [normes de desenvolupament](AGENTS.md).

La documentació Markdown és la font de veritat del projecte i s'ha de mantenir
sincronitzada amb decisions, codi i proves. Es distingeixen proposat, aprovat,
implementat i verificat. Les integracions i els desplegaments requereixen
validació i permisos propis. Cap cost addicional sense autorització. Commits a la
branca de tasca permesos; merge i push amb aprovació segons el
[flux Git](docs/GIT_WORKFLOW.md).

# Jarvis

Plataforma personal de dades i seguiment. La [visió completa](docs/PRODUCT_VISION.md)
inclou memòria personal, projectes, tasques, universitat, entrenaments,
integracions i seguiment proactiu per Telegram. Són objectius; l'abast executable
es consulta exclusivament a [CURRENT_STATE](docs/CURRENT_STATE.md).

## Què fa ara

Cloudflare Worker JavaScript amb API HTTP i MCP Streamable HTTP, SQL explícit sobre Neon
PostgreSQL i autenticació OAuth 2.1 amb inici de sessió de GitHub (D023), pensat per
connectar Claude. Al codi (D024–D026, versió 0.2.0) Jarvis gestiona projectes (llistar,
cercar, pausar, arxivar, prioritzar), tasques amb venciment, notes de memòria explícita
(decisions, preguntes obertes, fets, preferències), la vista d'un projecte i un resum diari
per regles que es pot enviar per Telegram. 13 eines MCP i les rutes API equivalents, amb
idempotència opcional i aïllament per propietari. Només dades fictícies.

Amb Node >=22.19.0 i npm:

```sh
npm ci
npm run check
npm test
npm run test:worker
npm run build
```

Les proves PostgreSQL dedicades i la configuració d'execució estan a la
[guia de desenvolupament](docs/DEVELOPMENT.md). **Estat:** la versió publicada és encara la
de D023 (2 eines: crear i recuperar projectes), verificada amb Claude web/app i Claude Code.
D024–D026 estan implementats i provats localment (simuladors i PostgreSQL local), però
**no desplegats**: la migració 003 no s'ha aplicat a Neon i Telegram i els clients Claude
reals no s'han provat amb les eines noves. `npm run dev` arrenca en loopback; sense
secrets, només salut és operativa.

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

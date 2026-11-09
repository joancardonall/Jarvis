# Jarvis — context del projecte

Jarvis és una plataforma personal de dades, seguiment i automatitzacions. **No és un chatbot nou**: Codex és la interfície conversacional; Jarvis conserva informació estructurada, ofereix eines MCP i executa processos fiables; una PWA permet gestionar dades directament; Telegram envia avisos.

## Estat actual — 2026-11-09

La visió procedent de `jarvis_starter` és l'únic projecte principal i substitueix
el pla anterior de chatbot, converses persistents i Ollama. El paquet s'ha
integrat a l'arrel; el prototip FastAPI, els seus tests i dependències s'han
retirat per autorització expressa de l'usuari. Vegeu D009 a
[decisions](docs/DECISIONS.md).

El repositori conté especificació i prompts; encara no hi ha aplicació executable,
endpoints, servidor MCP, BD, PWA, jobs ni integracions implementades. No hi ha
ordres d'instal·lació o tests de producte disponibles. El backend, la BD,
el hosting i l'autenticació continuen pendents de decisió.

## Com continuar

1. Llegir la [visió](docs/PRODUCT_VISION.md) i els [casos d'ús](docs/USE_CASES.md).
2. Revisar les decisions obertes i validar MCP, autenticació i costos.
3. Aprovar un únic circuit petit de projectes abans d'implementar-lo.
4. Utilitzar `prompts/02_FIRST_SLICE.md` quan l'abast estigui concretat i aprovat.

La conversió no autoritza implementar funcionalitats, contractar serveis ni desplegar.
El registre del canvi és a [docs/learning/learning-log.md](docs/learning/learning-log.md).

## Índex

- `docs/PRODUCT_VISION.md`: què és Jarvis, límits i criteris d'èxit.
- `docs/USE_CASES.md`: escenaris reals i criteris d'acceptació.
- `docs/DATA_MODEL.md`: model conceptual i regles de persistència.
- `docs/ARCHITECTURE.md`: components i alternatives encara obertes.
- `docs/MCP_CONTRACT.md`: eines i semàntica de les operacions.
- `docs/AUTOMATIONS.md`: resums, seguiment i Telegram.
- `docs/SECURITY_PRIVACY.md`: autorització, secrets i dades personals.
- `docs/roadmap.md`: fases i proves de validació.
- `docs/DECISIONS.md`: registre de decisions i preguntes obertes.
- `AGENTS.md`: instruccions operatives per a Codex.
- `prompts/01_REPO_AUDIT.md`: plantilla d'auditoria de només lectura.
- `prompts/02_FIRST_SLICE.md`: plantilla de tasca d'implementació, no executar encara.

## Regla de treball

Els documents descriuen **intenció**, no certifiquen funcionalitats implementades. La font de veritat del codi és el repositori i les proves. Les integracions externes s'han de validar amb experiments abans de considerar-les disponibles.

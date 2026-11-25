# Full de ruta orientat a experiments

## Estat actual — 2026-11-25

D023 (OAuth 2.1 amb GitHub per als connectors de Claude) està **desplegada i verificada**
amb Claude web/app i amb Claude Code: crear en un xat i recuperar en un altre funciona.

D024–D026 (gestió de projectes, tasques, notes, resum de projecte, resum diari, enviament
opcional per Telegram i còpia format 2) estan **implementades a la branca `feat/jarvis-core`
i provades localment** amb simuladors i PostgreSQL local. **Pendents de desplegament:** la
migració 003 no s'ha aplicat a Neon i Telegram real, el Cron Trigger real i els clients
Claude amb les 13 eines no s'han validat. La mesura de CPU continua pendent.

Ordre dels increments que queden (segons el pla de producte):

1. Desplegar D024–D026 i validar-les amb Claude web, Claude Code i Telegram reals (passos a
   [DEVELOPMENT](DEVELOPMENT.md#tasques-notes-i-resum-diari--d024d026)).
2. Política de dades personals i manteniment d'OAuth: neteja de connexions caducades i
   revocació sense SQL.
3. Model d'universitat i Google Calendar dins del resum diari.
4. Aplicació web (PWA) amb inici de sessió.
5. Entrenaments i importació de Hevy.
6. Garmin i Gmail, només si se'n verifica l'accés real.

Cada funcionalitat nova necessita aprovació del seu abast abans del codi.

Estat executable i verificacions a [CURRENT_STATE.md](CURRENT_STATE.md).

## Fase 0 — Decisions i experiments

- Auditoria i conversió completades.
- Arquitectura mínima i primer increment aprovats: D011–D014.
- Primer increment crear/recuperar implementat i verificat localment; evidència i
  límits a [CURRENT_STATE](CURRENT_STATE.md). Preparació Neon Free autoritzada
  a D017; connexió, migració, permisos i restauració Neon remots verificats,
  inclòs API/MCP via Worker local i públic. Publicació
  autoritzada a D021 i executada. La fase no es declara tancada per proves simulades.
- Validar Codex posteriorment sense bloquejar les proves MCP de desenvolupament.

## Fase 1 — Circuit complet de projectes

- Projectes, tasques i decisions persistents: **fet en codi** (D024: projectes amb estat i
  prioritat, tasques, notes de memòria, resum de projecte); **pendent de desplegar**.
- API i MCP autenticats (OAuth amb GitHub, D023, desplegat i verificat amb Claude web/app i
  Claude Code). D024 passa de 2 a 13 eines (més que les 4–8 previstes inicialment, per cobrir
  tasques i memòria); **pendent de desplegar**.
- Vista web mínima per comprovar dades (no dashboard extens): **pendent** (increment 4, PWA).
- Crear des d'un client, recuperar en xat nou, modificar i verificar persistència: fet amb
  projectes (D023); amb tasques i notes, **pendent** de validar amb clients reals.

**Sortida:** demostració de punta a punta i proves d'integritat.

## Fase 2 — Proactivitat

- Regles d'inactivitat, prioritats, projectes pausats i supressió de duplicats: **fet en
  codi** (D025: resum diari per regles, sense IA); pendent de desplegar.
- Cron i bot Telegram amb missatge diari real: **fet en codi i provat amb Telegram simulat**;
  bot, Cron Trigger real i missatge real **pendents**.
- Ajustar utilitat del resum amb ús durant 7 dies: **pendent** (després del desplegament).

**Sortida:** 7 resums sense pèrdues/duplicats injustificats i amb baix soroll.

## Fase 3 — Universitat i Calendar

- Model mínim d'assignatures, grups, professors i treballs.
- Accions conversacionals via connector Calendar; integració backend separada si cal per als resums.
- Gestió de dates ambigües i errors parcials.

## Fase 4 — Entrenaments

- PWA ràpida: exercicis, rutines, sessions i sèries.
- Importació inicial opcional de l'historial Hevy.
- Progressió i consulta per MCP.
- Validar ús real al gimnàs i xarxa intermitent.

## Fase 5 — Garmin i ampliacions

- Verificar accés real a API/dades de Garmin abans d'implementar.
- Integrar mètriques útils, sense duplicar funcions existents.
- Gmail, candidatures i coneixement documental segons demanda real.

## No fer fins que hi hagi necessitat demostrada

Chatbot propi, multiagents, RAG vectorial, sincronització genèrica universal, automatitzacions amb LLM sempre actiu.

Client inicial: Codex segons D010; Claude Code i Claude web/app amb OAuth
segons D023, tots dos verificats el 2026-11-25.

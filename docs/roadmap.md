# Full de ruta orientat a experiments

## Estat actual — 2026-11-11

D021 autoritza la publicació de desenvolupament i la preparació de Claude Code.
Worker publicat; HTTPS i circuit API/MCP→Neon remots verificats. Claude Code i CPU pendents.
La nova aprovació de publicació esmentada a la fase 0 ja s'ha rebut.

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

## Fase 1 — Circuit complet de projectes (objectiu futur)

- Projectes, tasques i decisions persistents.
- API i MCP autenticats amb 4–8 eines essencials.
- Vista web mínima per comprovar dades (no dashboard extens).
- Crear des de Codex, recuperar en xat nou, modificar i verificar persistència.

**Sortida:** demostració de punta a punta i proves d'integritat.

## Fase 2 — Proactivitat

- Regles d'inactivitat, prioritats, projectes pausats i supressió de duplicats.
- Cron i bot Telegram amb missatge diari real.
- Ajustar utilitat del resum amb ús durant 7 dies.

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

Client inicial: Codex segons D010; Claude Code disponible i preparat segons D021, pendent de validació real.

# Full de ruta orientat a experiments

## Estat actual — 2026-11-09

Auditoria del prototip completada: 11 tests passaven abans de la conversió.
Conversió autoritzada completada: documentació i prompts integrats a l'arrel;
prototip i pla anterior retirats. No hi ha funcionalitats implementades en la
nova direcció. Vegeu D009 a `DECISIONS.md`.

## Fase 0 — Decisions i experiments

- Auditoria i conversió documental completades; proves del prototip retirades.
- Pendent: concretar i aprovar el primer increment de projectes.
- Validar MCP i autenticació en el client Codex disponible; verificar separadament els dispositius objectiu.
- Triar backend/DB/hosting amb proves de cost, disponibilitat i auth.
- Documentar decisions a `DECISIONS.md`.

**Sortida:** proposta curta d'arquitectura amb riscos i primer canvi de codi autoritzat.

## Fase 1 — Circuit complet de projectes

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

Client inicial: Codex segons D010; Claude queda ajornat, sense bloquejar la fase 0.

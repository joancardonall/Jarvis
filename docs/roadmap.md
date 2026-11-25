# Full de ruta orientat a experiments

## Estat actual — 2026-11-25

D023 (OAuth 2.1 amb GitHub per als connectors de Claude) està **desplegada i verificada**
amb Claude web/app i amb Claude Code: crear en un xat i recuperar en un altre funciona.

D024–D026 (gestió de projectes, tasques, notes, resum de projecte, resum diari, enviament
opcional per Telegram i còpia format 2) estan **desplegades** des del 2026-11-25: migració 003
aplicada a Neon i Worker publicat amb 13 eines i el Cron Trigger. **Pendent:** que Claude
web/app i Claude Code es reconnectin i provin les 13 eines, i configurar i validar Telegram
(sense Telegram, el cron no envia res).

D027–D028 (política de dades amb exportació, purga i gestió de connexions OAuth, còpia
format 3, i assignatures amb grups, lliuraments i notes acadèmiques) estan **desplegades**
des del 2026-11-25 des de la branca `feat/data-policy-university` (no fusionada): migració
004 aplicada a Neon i Worker publicat amb 19 eines. **Pendents:** que Claude web/app i Claude
Code es reconnectin i provin les 19 eines, i que l'usuari confirmi la política de dades, que
ara és una proposta amb valors per defecte. Fins llavors, només dades fictícies.

Ordre dels increments que queden (segons el pla de producte):

1. Validar D027–D028 (ja desplegades) amb Claude web i Claude Code reals; confirmar la
   política de dades abans de posar-hi dades reals (passos a
   [DEVELOPMENT](DEVELOPMENT.md#política-de-dades-i-universitat--d027d028)).
2. Google Calendar dins del resum diari.
3. Aplicació web (PWA) amb inici de sessió.
4. Entrenaments i importació de Hevy.
5. Garmin i Gmail, només si se'n verifica l'accés real.

Petits pendents: límit de peticions (rate limiter), paginació real a les
llistes i mesura de CPU del Worker publicat.

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

- Projectes, tasques i decisions persistents: **fet i desplegat** (D024: projectes amb estat
  i prioritat, tasques, notes de memòria, resum de projecte); validació amb els clients reals
  **pendent**.
- API i MCP autenticats (OAuth amb GitHub, D023, desplegat i verificat amb Claude web/app i
  Claude Code). D024 passa de 2 a 13 eines (més que les 4–8 previstes inicialment, per cobrir
  tasques i memòria): **desplegades**. D027–D028 en porten 19: **fet en codi, pendent de
  desplegar**.
- Política de dades (D027: descartar a l'app, purga definitiva per part del desenvolupador,
  exportació, revocació de connexions sense SQL, còpia format 3): **fet en codi, pendent de
  desplegar i de la confirmació de l'usuari**.
- Vista web mínima per comprovar dades (no dashboard extens): **pendent** (increment 4, PWA).
- Crear des d'un client, recuperar en xat nou, modificar i verificar persistència: fet amb
  projectes (D023); amb tasques i notes, **pendent** de validar amb clients reals.

**Sortida:** demostració de punta a punta i proves d'integritat.

## Fase 2 — Proactivitat

- Regles d'inactivitat, prioritats, projectes pausats i supressió de duplicats: **fet en
  codi i desplegat** (D025: resum diari per regles, sense IA).
- Cron i bot Telegram amb missatge diari real: **fet en codi i provat amb Telegram simulat**;
  el Cron Trigger està desplegat, però el bot no està configurat i el missatge real
  **pendent**.
- Ajustar utilitat del resum amb ús durant 7 dies: **pendent** (després del desplegament).

**Sortida:** 7 resums sense pèrdues/duplicats injustificats i amb baix soroll.

## Fase 3 — Universitat i Calendar

- Model mínim d'assignatures, grups, professors i treballs: **fet** (D028:
  assignatures, grups per tipus i etiqueta, lliuraments i exàmens com a tasques, context
  acadèmic com a notes, al resum diari amb el nom de l'assignatura); **desplegat** el
  2026-11-25, pendent de validar amb clients reals.
  Sense horari estructurat ni qualificacions.
- Accions conversacionals via connector Calendar; integració backend separada si cal per als
  resums: **pendent** (següent increment).
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

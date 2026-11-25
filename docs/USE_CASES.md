# Casos d'ús i acceptació

Aquests casos descriuen la visió completa. Cada cas indica què cobreixen les eines MCP.
Les 13 de D023–D026 estan **desplegades** des del 2026-11-25, però cap client Claude real
les ha provat encara (falta reconnectar-los). Les 6 de D027–D028 (assignatures i
exportació) estan **implementades i provades localment, no desplegades**. Vegeu
[CURRENT_STATE](CURRENT_STATE.md) i el [contracte MCP](MCP_CONTRACT.md).

## UC-01 — Crear un projecte conversant

Usuari: «Crea un projecte per muntar una bicicleta. He de comparar rodes i transmissió.»

Esperat: Codex demana o infereix només les dades necessàries, crida MCP; Jarvis desa projecte i tasques amb identificadors estables; retorna confirmació real. Una petició repetida no crea duplicats accidentalment.

**Estat:** cobert (desplegat) per `create_project` i `create_task` amb `idempotency_key`.

## UC-02 — Continuar el projecte en un xat nou

Usuari: «Què vam decidir de la bici?»

Esperat: cerca de projectes/decisions, resposta amb dades persistides, distinció entre decisions confirmades i propostes pendents. No inventa informació absent.

**Estat:** cobert (desplegat) per `list_projects`, `get_project_overview` i `search_notes` (notes `decision` vs `open_question`).

## UC-03 — Seguiment sense data

Projecte actiu amb prioritat, una decisió pendent i diversos dies d'inactivitat.

Esperat: Jarvis selecciona com a màxim un recordatori útil del projecte al resum, amb motiu explícit. Un projecte pausat no apareix fins a la data de revisió o reactivació.

**Estat:** cobert (desplegat) per les regles de `get_daily_summary` (`follow_ups`) i `update_project` (`review_at`, `snoozed_until`).

## UC-04 — Agenda universitària

Usuari: «A Sistemes Operatius ens han posat una pràctica per al dia 20.»

Esperat: identifica l'assignatura si és inequívoca, crea tasca amb venciment, ofereix crear esdeveniment si la intenció d'agendar no és clara; si l'usuari demana explícitament agendar, utilitza Calendar i confirma resultat. En dates ambigües, pregunta.

**Estat:** cobert al codi sense Calendar, no desplegat. `list_courses` troba l'assignatura
(pel nom o el codi) i `create_task` amb `course_id` i `due_date` crea el lliurament, que
surt al resum diari amb el nom de l'assignatura. Falta Calendar (crear l'esdeveniment).

## UC-05 — Context acadèmic

Usuari: «Qui em fa el seminari de X?»

Esperat: consulta dades d'assignatures, grups i professorat. Si falta informació, ho diu i permet guardar-la.

**Estat:** cobert al codi, no desplegat. `list_courses` (o `get_course_overview`) retorna
els grups amb professor, horari i lloc; si falta, `save_course_group` el desa o
l'actualitza (seminari «S102»). El context acadèmic va a notes amb `course_id`.

## UC-06 — Registrar entrenament

Usuari obre PWA, escull rutina/exercicis, registra sèries, repeticions i pes, finalitza sessió.

Esperat: registre en pocs tocs, persistència robusta i historial consultable. Definir prova amb xarxa intermitent abans de donar per fet suport offline.

**Estat:** futur (entrenaments i PWA no implementats).

## UC-07 — Revisió de l'entrenament

Usuari: «Què tal ha anat avui?»

Esperat: MCP retorna sessió i progressió calculada; Codex explica tendències sense inventar conclusions mèdiques.

**Estat:** futur.

## UC-08 — Resum matinal

A l'hora configurada, un job genera resum d'agenda, tasques amb termini, projectes rellevants i entrenament planificat i l'envia per Telegram.

Esperat: contingut traçable a dades reals, no duplicar notificacions per reintents, indicar errors d'integració quan afectin el resum.

**Estat:** parcial. `get_daily_summary` i el cron de Telegram amb registre diari (sense duplicats) estan desplegats, però Telegram no està configurat i no s'ha verificat cap enviament real; falten agenda, entrenament i avís d'integracions caigudes.

## UC-09 — Canvi de prioritat

Usuari: «Aparca el projecte bici fins al gener i prioritza les candidatures.»

Esperat: actualitza estat i revisió de bici, canvia prioritats, registra canvi; següents resums ho reflecteixen.

**Estat:** cobert (desplegat) per `update_project` (estat, `review_at`, prioritat); el «registra canvi» només és `last_activity_at`, sense historial.

## UC-10 — Memòria explícita

Usuari: «Recorda que prefereixo X» / «Oblida X».

Esperat: operació MCP d'alta/actualització/desactivació amb confirmació; per a eliminacions destructives, confirmar segons política. Mai afirmar que s'ha desat sense resposta satisfactòria.

**Estat:** cobert per `save_note` (`preference`) i `update_note` (`status: inactive` per oblidar, reversible). L'esborrat real no el fa el model: passat el període de retenció (30 dies per defecte), el desenvolupador purga les notes oblidades amb `npm run data:purge` (D027, al codi, no provat contra Neon).

## Validació transversal

- Provar xats nous, no només la conversa que ha creat les dades.
- Provar duplicitats, permisos, errors de xarxa i dates amb zona horària Europe/Madrid.
- Registrar mètriques: operacions correctes, errors de crida MCP, recordatoris útils/sorollosos i temps de registre d'una sèrie.

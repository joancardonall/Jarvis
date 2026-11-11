# Casos d'ús i acceptació

Aquests casos descriuen la visió completa futura. L’increment aprovat és només
crear/recuperar projectes: vegeu [CURRENT_STATE](CURRENT_STATE.md) i els contractes.

## UC-01 — Crear un projecte conversant

Usuari: «Crea un projecte per muntar una bicicleta. He de comparar rodes i transmissió.»

Esperat: Codex demana o infereix només les dades necessàries, crida MCP; Jarvis desa projecte i tasques amb identificadors estables; retorna confirmació real. Una petició repetida no crea duplicats accidentalment.

## UC-02 — Continuar el projecte en un xat nou

Usuari: «Què vam decidir de la bici?»

Esperat: cerca de projectes/decisions, resposta amb dades persistides, distinció entre decisions confirmades i propostes pendents. No inventa informació absent.

## UC-03 — Seguiment sense data

Projecte actiu amb prioritat, una decisió pendent i diversos dies d'inactivitat.

Esperat: Jarvis selecciona com a màxim un recordatori útil del projecte al resum, amb motiu explícit. Un projecte pausat no apareix fins a la data de revisió o reactivació.

## UC-04 — Agenda universitària

Usuari: «A Sistemes Operatius ens han posat una pràctica per al dia 20.»

Esperat: identifica l'assignatura si és inequívoca, crea tasca amb venciment, ofereix crear esdeveniment si la intenció d'agendar no és clara; si l'usuari demana explícitament agendar, utilitza Calendar i confirma resultat. En dates ambigües, pregunta.

## UC-05 — Context acadèmic

Usuari: «Qui em fa el seminari de X?»

Esperat: consulta dades d'assignatures, grups i professorat. Si falta informació, ho diu i permet guardar-la.

## UC-06 — Registrar entrenament

Usuari obre PWA, escull rutina/exercicis, registra sèries, repeticions i pes, finalitza sessió.

Esperat: registre en pocs tocs, persistència robusta i historial consultable. Definir prova amb xarxa intermitent abans de donar per fet suport offline.

## UC-07 — Revisió de l'entrenament

Usuari: «Què tal ha anat avui?»

Esperat: MCP retorna sessió i progressió calculada; Codex explica tendències sense inventar conclusions mèdiques.

## UC-08 — Resum matinal

A l'hora configurada, un job genera resum d'agenda, tasques amb termini, projectes rellevants i entrenament planificat i l'envia per Telegram.

Esperat: contingut traçable a dades reals, no duplicar notificacions per reintents, indicar errors d'integració quan afectin el resum.

## UC-09 — Canvi de prioritat

Usuari: «Aparca el projecte bici fins al gener i prioritza les candidatures.»

Esperat: actualitza estat i revisió de bici, canvia prioritats, registra canvi; següents resums ho reflecteixen.

## UC-10 — Memòria explícita

Usuari: «Recorda que prefereixo X» / «Oblida X».

Esperat: operació MCP d'alta/actualització/desactivació amb confirmació; per a eliminacions destructives, confirmar segons política. Mai afirmar que s'ha desat sense resposta satisfactòria.

## Validació transversal

- Provar xats nous, no només la conversa que ha creat les dades.
- Provar duplicitats, permisos, errors de xarxa i dates amb zona horària Europe/Madrid.
- Registrar mètriques: operacions correctes, errors de crida MCP, recordatoris útils/sorollosos i temps de registre d'una sèrie.

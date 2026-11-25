# Automatitzacions i seguiment

**Estat:** el resum diari per regles i l'enviament per Telegram (D025) estan
**desplegats** des del 2026-11-25 (migració 003 a Neon i Cron Trigger registrat), provats
localment amb Telegram simulat. Encara **no hi ha bot creat ni secrets de Telegram
pujats**, de manera que el cron no envia res i no s'ha verificat cap enviament real. Els
lliuraments amb el nom de l'assignatura (D028) estan desplegats des del 2026-11-25, sense
validar encara amb un resum real. Estat real a
[CURRENT_STATE](CURRENT_STATE.md); mecànica del cron i del registre a
[ARCHITECTURE](ARCHITECTURE.md).

## Implementat: resum diari per regles (sense IA)

`src/summary.js` construeix el resum d'un dia (per defecte avui a Europe/Madrid) només amb
dades desades i plantilles fixes. No hi ha cap model d'IA ni cap servei de pagament.

Tasques obertes, en tres seccions:

- **Vençudes** (`overdue`): `due_date` anterior a avui.
- **Per avui** (`due_today`): `due_date` igual a avui.
- **Propers 7 dies** (`due_this_week`): `due_date` entre demà i d'aquí a 7 dies.

Les tasques sense data no surten al resum. Les fetes i cancel·lades tampoc. Cada tasca
mostra entre parèntesis el seu context: el nom de l'assignatura si és un lliurament
(`course_id`, D028) i, si no, el del projecte. A la resposta estructurada porta
`course_id` i `course_name`.

## Implementat: regles de seguiment de projectes

Com a màxim **3 seguiments** (`follow_ups`) i **un per projecte**. Per a cada projecte es
tria el primer motiu que compleixi, en aquest ordre:

1. `review_due`: projecte `paused` amb `review_at` avui o abans («Revisió prevista el …»).
2. `pending_decision`: projecte `active` amb alguna nota `open_question` activa (es mostra
   la més antiga, retallada a 120 caràcters).
3. `inactive`: projecte `active` sense activitat (`last_activity_at`) durant almenys
   **3 dies** si la prioritat és `high`, **7** si és `normal` i **14** si és `low`.

Si n'hi ha més de 3, s'ordenen per motiu (l'ordre de dalt), després per prioritat (alta
primer) i després per més dies d'inactivitat.

Mai apareixen: projectes pausats sense revisió vençuda, `completed`, `archived` ni
**posposats** (`snoozed_until` posterior a avui). Posposar és com l'usuari diu «no m'ho
recordis fins a X»: s'edita amb `update_project` (`snoozed_until`), i «això ja està fet»
amb `update_task` o canviant l'estat del projecte. Els llindars (3/7/14) són constants al
codi (`INACTIVITY_DAYS`), no configurables.

## Implementat: text del missatge

Text pla en català: capçalera amb la data («Resum de Jarvis — dimecres, 25 de novembre»),
una secció per grup, com a màxim **10 línies per secció** i «… i N més» si n'hi ha més.
Si no hi ha res, ho diu; si les tasques o els projectes consultats arriben al límit de 200,
avisa que el resum és parcial (`truncated`). Tot el text surt de dades desades.

## Implementat: Telegram de sortida

- **Programat:** Cron Trigger `30 5-8 * * *` (UTC). El Worker comprova si a Madrid ja són
  les `SUMMARY_HOUR` (6, 7 o 8; 7 per defecte) i reclama el dia a `summary_runs`. Com a
  màxim **un missatge al dia**; un dia sense res a dir queda `skipped` i no s'envia res. Si
  Telegram **rebutja** l'enviament queda `failed` i es reintenta en el despertar següent,
  **3 intents com a màxim**. Si no hi ha resposta (timeout) queda `unknown` i no es reintenta,
  perquè el missatge podria haver arribat. Si el
  Worker s'atura entre reclamar i enviar, aquell dia no s'envia (preferim cap missatge a
  un duplicat).
- **A demanda:** eina `send_daily_summary` o `POST /api/v1/daily-summary/send`. Envia el
  resum d'ara mateix, fora del registre diari (cada crida envia un missatge).
- Només envia a un `TELEGRAM_CHAT_ID` configurat; sense `TELEGRAM_BOT_TOKEN` i
  `TELEGRAM_CHAT_ID` vàlids, el cron no fa res ni toca la BD i l'enviament a demanda
  respon `telegram_not_configured`.
- Text pla (sense Markdown ni HTML, perquè cap dada desada pugui injectar format o
  enllaços), tallat a uns 3.900 caràcters, sense previsualització d'enllaços.
- El token del bot és un secret del Worker, mai al repositori. Configuració manual amb
  `npm run telegram:setup` i `npm run telegram:chat`; passos a [DEVELOPMENT](DEVELOPMENT.md).
- **Privacitat:** els títols de tasques i projectes viatgen a Telegram, un servei extern.
  No hi posem dades sensibles. Riscos a [SECURITY_PRIVACY](SECURITY_PRIVACY.md).

## Futur (no implementat)

- **Calendari** dins del resum: requereix accés backend autoritzat; no dependre del
  connector interactiu del xat.
- **Entrenaments** planificats al resum.
- **Telegram bidireccional**: ara el bot no llegeix ni respon missatges (no hi ha
  webhook). No es promet fins que s'implementi i s'autentiqui.
- **Llindars configurables** i període mínim entre avisos del mateix tema.
- **Vinculació verificada del chat**: ara el `chat_id` es desa a mà amb
  `telegram:chat` i l'usuari comprova que és el seu.
- Reintents amb espera creixent (*backoff*) i registre d'errors més enllà de l'estat de
  `summary_runs`; avisar de fonts no disponibles quan n'hi hagi més d'una.
- Diverses zones horàries (ara només Europe/Madrid).

## Sense IA de pagament

El resum es genera amb plantilles i regles. Una futura capa LLM és opcional, condicionada
a cost i execució realment disponible.

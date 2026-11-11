# Automatitzacions i seguiment — objectius futurs

No implementat ni inclòs en l’increment actual. Estat a [CURRENT_STATE](CURRENT_STATE.md).

## Canal

Telegram per a resums diaris i recordatoris. Conversa principal a Codex; app Jarvis per a registre i consulta visual.

## Resum matinal

Job diari a hora configurada, zona Europe/Madrid. Consulta:
- Calendari (si hi ha accés backend autoritzat; no dependre del connector interactiu de Codex).
- Tasques amb venciment i compromisos pròxims.
- Projectes actius amb pendents, decisions bloquejades o inactivitat significativa.
- Entrenament planificat, si hi ha dades.

Ordena per urgència, rellevància i varietat; limita longitud. Indica fonts no disponibles. Envia a Telegram i desa resultat/idempotency_key per evitar duplicats.

## Seguiment sense dates

Regles inicials transparents:
- No avisar de projectes `paused`, `completed` o `archived`.
- Prioritzar bloquejos i decisions pendents abans d'inactivitat genèrica.
- La inactivitat és relativa a prioritat i `last_activity_at`; llindars configurables, no constants universals.
- Respectar `snoozed_until` i un període mínim entre avisos del mateix tema.
- Com a màxim 1–3 seguiments no urgents al resum; no enviar alertes aïllades per cada tasca.
- Permetre «no m'ho recordis fins a X» i «això ja està fet» via Codex/MCP.

## Telegram

- Bot token com a secret; mai al repositori.
- Associar chat_id a l'usuari amb un procés de vinculació verificat.
- No incloure dades personals sensibles innecessàries en notificacions.
- Control de duplicats, reintents amb backoff i registre d'errors.
- No prometre missatgeria bidireccional fins que s'implementi i autentiqui.

## Sense IA de pagament

El primer resum es genera amb plantilles i regles. Una futura capa LLM és opcional, condicionada a cost i execució realment disponible.

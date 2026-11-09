# Visió de producte — Jarvis

Estat: **acordat funcionalment; arquitectura en validació**. Data: 2026-11-08.

## Missió

Un sistema personal que conserva el context de la vida quotidiana, organitza compromisos i projectes, registra dades pròpies i fa seguiment proactiu perquè l'usuari no hagi de recordar-ho tot ni repetir informació entre converses.

## Experiència desitjada

- Al matí arriba a **Telegram** un resum de l'agenda d'avui, venciments de la setmana, projectes que requereixen atenció i entrenament previst.
- L'usuari parla amb **Codex** per crear o modificar projectes, tasques, decisions, dades acadèmiques i esdeveniments del calendari.
- Un xat nou pot recuperar context exacte de Jarvis mitjançant **MCP**, sense confiar en la memòria interna del model.
- La **PWA Jarvis** permet registrar entrenaments com a substitut de Hevy i consultar/editar informació estructurada.
- Jarvis detecta pendents sense data concreta, però respecta projectes pausats i evita notificacions repetitives.

## Àmbits

1. Projectes personals: bicicleta, candidatures laborals, desenvolupament, viatges i altres.
2. Universitat: assignatures, professorat de teoria i seminari, treballs, lliuraments i context acadèmic.
3. Memòria explícita: fets, preferències, objectius, decisions i notes amb procedència.
4. Organització: tasques, terminis, estats, decisions pendents i seguiment.
5. Entrenaments: rutines, exercicis, sèries, repeticions, pesos, historial i progressió; Garmin en una fase posterior.
6. Integracions: Google Calendar, potencialment Gmail i Garmin, segons validació d'accés.

## No-objectius inicials

- No crear un chatbot competidor de Codex ni pagar una API LLM addicional.
- No implementar una base vectorial o multiagents sense un problema mesurat.
- No replicar Hevy al 100%; prioritzar el registre ràpid i fiable al mòbil.
- No copiar totes les dades de Google Calendar si es poden consultar com a font original.
- No prometre captura automàtica de totes les converses ni agents 24/7.

## Restriccions

- Cap cost recurrent nou com a objectiu; vigilar límits i suspensions dels serveis gratuïts.
- Sense ordinador personal encès permanentment.
- Accés web i iPhone.
- Aprenentatge real d'arquitectura, dades, backend, seguretat i integració IA.
- Preferència per JavaScript; backend i hosting pendents de validació i aprovació. El prototip anterior s'ha retirat segons D009.

## Criteris d'èxit del primer lliurable

Des d'un xat Codex: crear projecte i tasques via MCP; consultar-los en un xat nou; veure'ls a la PWA o una vista mínima; rebre a Telegram un resum programat amb un pendent real; editar una dada i observar el canvi en el següent resum. Sense intervenció manual de sincronització.

## Principi de disseny

**El model interpreta; el servidor valida; la base de dades conserva; els processos programats fan seguiment.**

# Arquitectura proposada — subjecta a validació

```text
Codex (conversa)
   | MCP remot autenticat
   v
Jarvis backend/API <----> BD (motor pendent)
   ^     |                  ^
   |     +--> jobs --> Telegram
   |     +--> integracions (segons accessos reals)
   |
PWA Jarvis (iPhone/web)

Google Calendar: integració conversacional pendent de validar al client Codex;
per als resums automàtics, el backend necessita un accés propi autoritzat
(o una altra via programable verificada). No assumir que el connector de
Codex és accessible des del cron de Jarvis.
```

## Candidats, no decisions tancades

- Frontend: React PWA.
- Backend: Cloudflare Workers (JS) **o** una nova implementació FastAPI. Avaluar segons dependències, desplegament, coneixement i manteniment.
- DB: PostgreSQL gestionat, possiblement Supabase Free; validar pauses, límits, backups i alternatives.
- Programació: cron serverless del proveïdor escollit.
- Avisos: Telegram Bot API, amb chat_id vinculat de manera segura.
- MCP: servidor remot autenticat amb eines acotades i comprovació de permisos.
- Codex: client inicial escollit; validar MCP, autenticació, permisos i límits en la modalitat i el compte utilitzats. No assumir accés API ni execució programada.

## Separació de responsabilitats

- Backend: validació, permisos, regles, idempotència i dades.
- MCP: adaptador semàntic de les mateixes operacions de domini; no segona lògica de negoci.
- PWA: UX d'edició i registre, no font de veritat.
- Scheduler: regles deterministes i notificacions, no necessitat de LLM.
- Codex: interpretació i planificació; no garantir execució automàtica de totes les eines.

## Riscos que cal provar aviat

1. Validar la connexió MCP des del client Codex disponible; accés web/iPhone pendent de comprovar.
2. Autenticació segura de l'usuari en MCP i PWA.
3. Hosting gratuït continuat sense pauses que trenquin el resum matinal.
4. Calendari per a cron: credencials pròpies i permisos, diferents del connector conversacional.
5. Resums fiables quan un proveïdor falla.
6. Cost real i límits de serveis gratuïts.

## Criteri d'elecció

Preferir la solució més simple que superi els experiments i no exigeixi reescriptura innecessària. Documentar alternatives descartades i motius.

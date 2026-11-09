# Registre de decisions (ADR lleuger)

## Acceptades funcionalment — 2026-11-08

- D001: Claude serà la interfície conversacional principal; Jarvis no tindrà chatbot propi a l'inici. **Substituïda temporalment per D010 pel que fa al client inicial.**
- D002: La informació estructurada de Jarvis persistirà en una BD pròpia i serà accessible per MCP.
- D003: La captura de memòria començarà amb ordres explícites de l'usuari.
- D004: Telegram serà el canal dels resums i recordatoris.
- D005: Jarvis farà seguiment de projectes i tasques fins i tot sense venciment, respectant pauses i evitant soroll.
- D006: L'app Jarvis substituirà Hevy per al registre futur d'entrenaments.
- D007: Objectiu de cap despesa recurrent nova i cap ordinador permanentment encès.
- D008: Primer validar el circuit conversa → persistència → recuperació → avís.

## D009 — Conversió del repositori — 2026-11-09

**Estat:** acceptada expressament per l'usuari.

**Context:** coexistien un pla de chatbot amb FastAPI/Ollama i la nova visió
centrada en Claude, dades estructurades, MCP, PWA i Telegram.

**Decisió:** la visió de `jarvis_starter` passa a ser l'únic projecte principal.
La documentació i els prompts es mouen a l'arrel. Es retiren el prototip de xat,
els seus tests, dependències, configuració Python local i el pla anterior.
No es manté un segon projecte ni una còpia d'arxiu dins del repositori.

**Conseqüències:** no hi ha aplicació executable ni stack escollit. La proposta
anterior de persistir converses deixa de ser el següent mòdul. Aquesta decisió
no aprova Workers, FastAPI, Supabase, OAuth ni cap implementació funcional.

**Validació:** estructura única, enllaços locals resolubles i absència del codi
retirat i de referències operatives al pla antic.

## D010 — Codex com a client inicial — 2026-11-09

**Estat:** acceptada expressament per l'usuari; substitueix temporalment D001
pel que fa a Claude com a interfície inicial.

**Context:** l'usuari no té accés a Claude i vol utilitzar Codex de moment.

**Decisió:** Codex és el client inicial de treball i la interfície prevista per
validar el circuit de projectes. Claude deixa de ser un requisit per començar.
Jarvis conserva el domini i el contracte MCP independents del client.

**Conseqüències:** validar la connexió MCP, autenticació i permisos en el client
Codex real abans de considerar el flux operatiu. No assumir disponibilitat web,
iPhone, Calendar, API facturable ni execució programada a partir de l'accés actual.
No es configuren integracions ni es reutilitzen credencials d'aquest xat.
Backend, BD i hosting continuen oberts. Una futura incorporació de Claude
requerirà validació pròpia, sense duplicar la lògica de domini.

**Validació pendent:** crear i recuperar un projecte persistent en una sessió
nova de Codex, amb permisos comprovats i confirmació real de l'eina.

## Proposades, NO decidides

- P001: React PWA.
- P002: Cloudflare Workers JS per backend i MCP.
- P003: PostgreSQL gestionat / Supabase Free.
- P004: Proveïdor de cron i mecanisme de consulta de Google Calendar des del backend.
- P005: Estratègia d'autenticació OAuth per MCP i PWA.
- P006: Escollir el backend: Workers JS o una nova implementació FastAPI. El prototip anterior ja està retirat per D009.

## Format per a decisions futures

`DXXX — Títol` / Data / Estat / Context / Opcions / Decisió / Motiu / Conseqüències / Prova que ho validaria.

No modificar silenciosament decisions acceptades: registrar canvi i justificació.

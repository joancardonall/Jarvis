# Registre d'aprenentatge

## 2026-11-09 — Conversió a la nova visió

L'usuari ha autoritzat que la visió de `jarvis_starter` sigui el projecte principal
i que es retiri el contingut anterior innecessari (D009).

- Documentació i prompts traslladats a l'arrel; instruccions unificades.
- Retirats el backend d'eco, els seus tests i dependències, el pla de converses/IA
  local, l'entorn virtual i la configuració de VS Code exclusiva de Python.
- Cap nova funcionalitat, dependència, servei, migració o desplegament.
- Arquitectura prevista: Claude interpreta → MCP autenticat → serveis de domini
  validen → BD conserva; PWA consulta/edita i jobs generen avisos per Telegram.
  Tot aquest flux continua pendent d'implementació i validació.

Abans de la conversió l'auditoria havia verificat 11 tests del prototip i
`pip check`. Aquests resultats són històrics i no validen el producte nou.
Ara no hi ha suite executable; la revisió de conversió comprova estructura,
enllaços Markdown i absència d'artefactes antics, sense serveis externs.

Conceptes pendents de confirmació: visió de producte vs implementació,
adaptador MCP vs domini, i decisió de stack vs retirada d'un prototip.

Preguntes de comprensió:
1. Quina responsabilitat té Claude i quina té Jarvis?
2. Per què retirar FastAPI no significa haver escollit Workers?
3. Què cal validar abans de confiar dades personals al MCP remot?

Cap concepte es marca com a après.

## 2026-11-09 — Client inicial Codex

D010 substitueix temporalment Claude per Codex perquè l'usuari no té accés a
Claude. S'han alineat README, visió, arquitectura, casos d'ús, contracte MCP,
automatitzacions, seguretat, instruccions i roadmap. Les mencions anteriors
a Claude en aquest registre descriuen el context històric de D009.

El canvi és documental: cap integració configurada ni validada. La disponibilitat
del client no acredita connexió al futur MCP de Jarvis ni credencials del backend.
No s'han executat proves funcionals perquè encara no hi ha aplicació executable.
Cap concepte es marca com a après.

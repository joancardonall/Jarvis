# Registre d'aprenentatge

## 2026-11-01 — Fase 1

Treball realitzat: inspecció del repositori, extracció del router, incorporació
de ChatResponse, tests HTTP, empaquetament i documentació.

Problemes trobats:
- El servei importava ChatResponse encara que no existia; l'aplicació no
  podia carregar. S'ha eliminat l'import innecessari i creat l'esquema
  a la capa corresponent.
- Hi havia bytecode versionat i no hi havia gitignore.
- El Python accessible era 3.9.6 sense dependències; el pip inicial 21.2.4
  no admetia aquesta instal·lació editable basada en pyproject.
  S'ha preparat un entorn aïllat i actualitzat pip.
- La xarxa restringida ha requerit autorització per descarregar dependències.

Conceptes introduïts, pendents de confirmar: monòlit modular, router,
Pydantic, contracte HTTP, ASGI, tests d'integració, instal·lació editable,
dependències directes i transitives.

No es marca cap concepte com a après. Cal revisar:
1. Per què el servei no necessita importar FastAPI?
2. On es detecta un message absent?
3. Què comprova TestClient i què queda fora del seu abast?

Verificació: 11 tests superats amb Python 3.9.6 i pytest 8.3.4, tant a
l'entorn de treball com en un segon entorn net instal·lat seguint el README.
pip check no ha detectat dependències incompatibles en cap dels dos.
Uvicorn és executable i informa de la versió 0.34.0.
No s'ha comprovat Windows ni s'ha fet una prova de xarxa TCP real.
Les sis cachés versionades s'han retirat de l'índex, conservant-les localment.
No s'han fet commits ni push.

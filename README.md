# JARVIS

Assistent personal d'IA i projecte educatiu d'Enginyeria de Dades. L'objectiu és aprendre arquitectura backend, APIs, testing, dades i sistemes d'IA mantenint el control de les dades.

## Estat actual

Fase 1: monòlit modular amb FastAPI, validació Pydantic i tests pytest.
`GET /health` retorna `{"status": "ok"}`; `POST /chat` retorna un eco fictici.
No hi ha cap model d'IA connectat, persistència, autenticació ni frontend.

En el futur es volen incorporar memòria permanent, preferències, estudis,
entrenaments, informes i integracions amb Calendar, Garmin i Hevy.
Aquestes funcionalitats encara no estan implementades.

Stack actual: Python, FastAPI, Pydantic, Uvicorn, pytest i HTTPX (per als tests).
Stack previst: Ollama, PostgreSQL + pgvector, React + TypeScript i Docker.
No cal instal·lar cap component futur ni contractar serveis de pagament.

## Preparar un ordinador nou

Després de clonar el repositori, obre un terminal a l'arrel.
Cal Python 3.9 o superior; aquesta fase s'ha verificat amb Python 3.9.6.
Per a un ordinador nou és preferible Python 3.11 o superior; cal executar-hi els tests.

macOS / Linux:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r backend/requirements-dev.lock
python -m pip install --no-deps -e "./backend[dev]"
```

Windows PowerShell (sense necessitat d'activar l'entorn):

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r backend/requirements-dev.lock
.\.venv\Scripts\python.exe -m pip install --no-deps -e "./backend[dev]"
```

`pyproject.toml` centralitza metadades, dependències directes i configuració de
pytest. L'extra `dev` afegeix les eines de tests. El mode editable (`-e`)
permet importar `app` mentre s'edita el codi, sense reinstal·lar cada canvi.
El fitxer `requirements-dev.lock` fixa també les dependències transitives;
no conté rutes locals. Quan s'actualitzin dependències cal regenerar-lo i
tornar a provar. No és una garantia de compatibilitat amb totes les versions
futures de Python o tots els sistemes operatius.

Per resoldre dependències de nou, sense utilitzar el lock:
`python -m pip install -e "./backend[dev]"`.

## Executar i provar

Des de l'arrel, amb l'entorn activat:

```sh
python -m uvicorn app.main:app --reload
python -m pytest backend/tests
python -m pip check
```

El servidor ocupa el terminal: executa els tests en un altre terminal amb el
mateix entorn. Atura'l amb Ctrl+C. A Windows, substitueix `python` per
`.\.venv\Scripts\python.exe` si no has activat l'entorn.

Obre http://127.0.0.1:8000/docs per provar els endpoints amb Swagger UI.
`GET /health` ha de retornar 200 i `{"status": "ok"}`.
Per al xat, envia aquest JSON a `POST /chat`:

```json
{"message": "Hola"}
```

Resposta esperada (200): `{"response": "Has dit: Hola"}`.
Sense `message`, o amb un número en lloc de text, la resposta és 422.
El servidor local escolta a localhost; no és un desplegament de producció.

## Documentació

- [Visió arquitectònica](docs/architecture/overview.md)
- [Backend i flux HTTP](docs/architecture/backend.md)
- [Mòdul de xat](docs/modules/chat.md)
- [Decisió Python + FastAPI](docs/decisions/001-backend-fastapi.md)
- [Roadmap](docs/roadmap.md)
- [Registre d'aprenentatge](docs/learning/learning-log.md)
- [Conceptes](docs/learning/concepts.md)
- [Normes de desenvolupament](AGENTS.md)

# Backend

FastAPI associa mètodes i rutes HTTP a funcions Python. Utilitza Pydantic per
validar les dades i descriu l'API amb OpenAPI. Uvicorn és el servidor ASGI que
rep les connexions i executa l'aplicació.

## Estructura

```text
backend/
├── app/
│   ├── main.py
│   ├── api/routes/chat.py
│   ├── schemas/chat.py
│   └── services/chat_service.py
├── tests/
│   ├── test_health.py
│   └── test_chat.py
├── pyproject.toml
└── requirements-dev.lock
```

Els `__init__.py` identifiquen els paquets Python. La instal·lació editable
permet resoldre imports com `from app.schemas.chat import ChatRequest`.

- `main.py`: crea `FastAPI()`, registra el router i manté salut.
- `api/routes/chat.py`: tradueix HTTP a una crida del servei.
- `schemas/chat.py`: defineix els contractes d'entrada i sortida.
- `services/chat_service.py`: genera el text sense dependre de FastAPI.
- `tests/`: verifica el contracte públic amb peticions simulades.

## Flux d'una petició

1. Uvicorn rep `POST /chat` i el lliura a FastAPI.
2. FastAPI construeix `ChatRequest` a partir del JSON. Si falla, retorna 422
   abans d'executar la funció de la ruta.
3. `chat()` passa `request.message` a `generate_response()`.
4. El servei retorna `Has dit: <missatge>`.
5. La ruta crea `ChatResponse`. FastAPI valida la sortida amb
   `response_model` i la serialitza a JSON amb estat 200.

`@router.post` registra una operació HTTP; `app.include_router` la incorpora
a l'aplicació. Sense aquest registre, la ruta no estaria disponible.
Les funcions són síncrones perquè aquesta fase no fa E/S externa asíncrona.
Quan es connecti un model caldrà revisar client, temps d'espera i concurrència.

## Verificació

`TestClient` executa peticions contra l'aplicació dins del procés, sense
engegar un servidor TCP. Els tests cobreixen també la integració entre capes,
però no comproven xarxa real, rendiment ni serveis futurs.

Fonts: [routers FastAPI](https://fastapi.tiangolo.com/tutorial/bigger-applications/),
[tests FastAPI](https://fastapi.tiangolo.com/tutorial/testing/),
[pyproject.toml](https://packaging.python.org/en/latest/guides/writing-pyproject-toml/).

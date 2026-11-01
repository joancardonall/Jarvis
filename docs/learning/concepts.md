# Conceptes per revisar

Tots els conceptes d'aquest document estan pendents de confirmació del
desenvolupador; llegir-los no implica haver-los après.

| Concepte | Responsabilitat | Exemple |
| --- | --- | --- |
| Framework | Organitza el tractament de peticions | FastAPI |
| Servidor ASGI | Escolta connexions i executa l'app | Uvicorn |
| Endpoint | Operació identificada per mètode i ruta | POST /chat |
| Router | Agrupa i registra operacions HTTP | APIRouter |
| Schema | Defineix i valida una estructura de dades | ChatRequest |
| Service | Executa lògica independent del transport | generate_response |

## Contracte i validació

Una anotació `message: str` en un model derivat de `BaseModel` permet que
Pydantic validi dades en temps d'execució. Una anotació en una funció Python
normal, per si sola, no valida automàticament els arguments.

`{"message": "Hola"}` és vàlid; `{"message": 42}` no ho és amb la versió
fixada de Pydantic. FastAPI transforma aquest error en HTTP 422.
El model de resposta descriu el JSON que l'API promet retornar.

## Separació de responsabilitats

El router coneix HTTP; el servei només rep i retorna text.
Si demà canvia com es genera la resposta, el contracte del client pot
continuar sent el mateix. Un monòlit modular separa codi sense separar
processos com farien els microserveis.

## Decoradors i imports

`@router.post("/chat", response_model=ChatResponse)` registra la funció que
hi ha a sota com a gestora de peticions. Importar el router i cridar
`include_router` fa que FastAPI el pugui utilitzar. Els imports absoluts
`app.*` funcionen perquè hem instal·lat el paquet.

## Tests i entorn

Un test comprova un comportament observable: estat HTTP i JSON.
`pytest.mark.parametrize` repeteix el mateix test amb entrades diferents.
TestClient simula el client HTTP sense obrir un port real.

L'entorn virtual aïlla paquets del Python del sistema. `pyproject.toml`
declara dependències directes; les transitives són paquets que aquestes
necessiten. Fixar versions facilita repetir una instal·lació; no substitueix
provar-la en una altra plataforma.

## Què és E/S i per què importa?

E/S és entrada/sortida: xarxa, disc o base de dades. Un LLM remot o local
pot trigar i fallar. Encara no fem aquesta E/S: no cal introduir ara
clients asíncrons, retries ni abstraccions de proveïdors.

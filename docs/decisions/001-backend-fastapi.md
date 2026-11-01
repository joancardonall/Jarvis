# ADR 001 — Backend amb Python i FastAPI

Data: 2026-11-01. Estat: adoptada per a la fase 1.

## Context i decisió

El projecte és educatiu, el desenvolupador coneix Python a nivell intermedi
i vol treballar amb dades i IA. Es manté Python amb FastAPI, ja presents al
codi inicial, en un monòlit modular.

## Alternatives considerades en aquesta documentació

- Flask: senzill i flexible, però requereix més decisions per integrar
  validació de models i documentació del contracte.
- Django: inclou ORM, administració i moltes convencions útils per a una
  aplicació completa; ara excedeix les necessitats de dos endpoints.
- Node.js amb TypeScript: podria compartir llenguatge amb el frontend futur,
  però afegeix un canvi de llenguatge respecte del coneixement actual.

No s'han implementat ni comparat amb benchmarks aquestes alternatives.

## Avantatges, inconvenients i conseqüències

FastAPI integra validació amb Pydantic i genera documentació OpenAPI.
Python facilita l'aprenentatge i l'ecosistema de dades. Separar rutes,
esquemes i serveis permet provar el contracte sense connectar un LLM.

Cal aprendre ASGI, tipus i validació; el framework no resol memòria,
seguretat ni concurrència del model per nosaltres. Els errors d'entrada
es retornen com a 422. Les dependències s'han de fixar i actualitzar
deliberadament amb tests.

Uvicorn executa l'aplicació. pytest i HTTPX només són necessaris per al
desenvolupament. No s'afegeix infraestructura futura.

# Visió general

JARVIS és un monòlit modular: un sol procés desplegable amb responsabilitats
separades en mòduls Python. Evita haver de gestionar xarxa, desplegaments i
errors distribuïts entre microserveis quan encara estem aprenent el domini.

## Implementat

FastAPI exposa salut i xat. El xat valida un missatge i genera un eco.
No desa missatges ni fa peticions externes.

```mermaid
flowchart LR
    Client["Client / Swagger UI"] --> Main["FastAPI"]
    Main --> Health["GET /health"]
    Main --> Route["POST /chat · router"]
    Route --> Schema["Pydantic · validació"]
    Schema --> Service["Servei · eco fictici"]
    Service --> Response["ChatResponse · JSON"]
    Response --> Client
```

## Planificat, sense implementar

```mermaid
flowchart LR
    UI["React · futur"] -.-> API["Backend"]
    API -.-> LLM["Ollama · futur PC servidor"]
    API -.-> DB["PostgreSQL + pgvector · futur"]
    API -.-> Integrations["Calendar / Garmin / Hevy · futur"]
    API -.-> Jobs["Informes i agents amb permisos · futur"]
```

Les línies discontínues representen plans, no connexions existents.
El Mac serveix per desenvolupar; el PC Windows podrà allotjar models locals.
La ubicació física dels serveis futurs no altera ara l'estructura del backend.

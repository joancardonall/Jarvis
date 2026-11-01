# Mòdul de xat

## Contracte actual

`POST /chat`, cos JSON, sense autenticació.

Entrada `ChatRequest`:

```json
{"message": "Hola, Jarvis!"}
```

Sortida `ChatResponse`, HTTP 200:

```json
{"response": "Has dit: Hola, Jarvis!"}
```

`message` és obligatori i de tipus `str`. Pydantic 2 rebutja números,
booleans, null, llistes i objectes amb HTTP 422. El detall de l'error indica
`["body", "message"]`. No s'afegeix una longitud mínima: una cadena buida
és vàlida i els espais es conserven. Els camps addicionals s'ignoren amb
el comportament per defecte de Pydantic.

No s'ha canviat el format de resposta ni el text de l'eco. Ara la sortida
té un esquema explícit, que també apareix a OpenAPI.

## Implementació i limitacions

La ruta valida i coordina; `generate_response(message: str) -> str` construeix
el text. El servei no importa esquemes HTTP: així la seva lògica es pot
entendre i reutilitzar sense servidor web.

No hi ha IA, historial, memòria, límits de mida específics ni streaming.
Els tests cobreixen text normal, buit, espais, camp absent i tipus invàlids.

## Evolució prevista

El proper objectiu és substituir l'eco per una primera connexió a un LLM,
amb autorització prèvia. Caldrà decidir el model i el client, tractar errors
i temps d'espera, i afegir tests sense dependre d'un model real en cada execució.
No introduïm encara classes abstractes: una funció és suficient.

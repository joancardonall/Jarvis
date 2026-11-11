# Contracte API — increment de projectes

Estat de verificació a [CURRENT_STATE](CURRENT_STATE.md). Seguretat i credencials a
[SECURITY_PRIVACY](SECURITY_PRIVACY.md); dades a [DATA_MODEL](DATA_MODEL.md).

| Mètode i ruta | Entrada | Resposta |
| --- | --- | --- |
| GET /health | Cap | 200 `{"status":"ok"}`; liveness, no comprova BD |
| POST /api/v1/projects | JSON amb `name`, `description?`; capçalera `Idempotency-Key?` | 201 projecte, també en replay |
| GET /api/v1/projects/{id} | UUID | 200 projecte; 404 si absent o d'un altre propietari |

`name`: text d'1–200 caràcters, no només espais; es conserva sense trim silenciós.
`description`: text de fins a 2.000, per defecte cadena buida. Camps desconeguts
rebutjats. `owner_id`, `id`, `status` i dates són exclusius del servidor.

La resposta conté `id`, `name`, `description`, `status: "active"`, `created_at` i
`updated_at` en ISO UTC. No exposa propietari, clau ni empremta.

## Idempotència opcional

Sense clau, cada POST crea un projecte nou, encara que contingui el mateix nom.
Amb clau, identificador ASCII `[A-Za-z0-9._:-]` d'1–128 caràcters, es garanteix
un únic projecte per propietari/clau. Mateix nom/descripció retorna el mateix
projecte; contingut diferent retorna 409. Ometre descripció equival a `""`.
La clau viu a la capçalera HTTP, no al JSON. La retenció dura tant com el projecte;
no hi ha eliminació ni expiració de claus en aquest increment.

No hi ha retries automàtics de POST sense clau. Si la connexió es talla o
caduca el timeout després del commit, el client pot rebre un error tot i haver-se
desat el projecte. Només reintentar amb la mateixa clau permet deduplicar-lo.

## Errors i límits

Cos HTTP d'error: `{"error":"code"}`. 400 JSON invàlid o HTTPS requerit,
401 credencial invàlida/caducada, 403 origen prohibit, 404 recurs/ruta absent,
409 conflicte d'idempotència, 413 cos >16 KiB, 415 Content-Type incorrecte,
422 dades/clau/UUID invàlids, 503 configuració incompleta o servei no disponible.
Errors inesperats es redueixen a 503 sense detall intern.

Totes les rutes privades requereixen Bearer token. Sense CORS habilitat per a
una app web; l'origen de desenvolupament MCP es pot autoritzar explícitament.
Respostes privades no emmagatzemables (`Cache-Control: no-store`).

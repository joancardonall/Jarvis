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

Sense CORS habilitat per a una app web; l'origen de desenvolupament MCP es pot
autoritzar explícitament. Respostes privades no emmagatzemables (`Cache-Control: no-store`).

## Autenticació

Totes les rutes privades (`/api/v1/projects…` i `/mcp`) requereixen
`Authorization: Bearer <token>`, amb una d'aquestes credencials:

- **Access token OAuth** (`jvs_at_…`, 1 h), obtingut amb el flux de D023. És la via
  principal; API i MCP accepten els mateixos tokens. Sense scopes funcionals: un token
  dona accés complet al propietari.
- **Token fix de desenvolupament** (D013/D022), opcional: només funciona si està configurat
  i vigent; serveix per a scripts i verificacions.

Tot 401 inclou la capçalera que indica als clients OAuth on començar (RFC 9728):
`WWW-Authenticate: Bearer realm="jarvis", resource_metadata="<origen>/.well-known/oauth-protected-resource"`.

## Endpoints OAuth (D023, desplegats; verificats amb Claude web/app)

Públics, sense token. Flux pas a pas a [ARCHITECTURE](ARCHITECTURE.md). Les respostes
porten `Cache-Control: no-store` i `Referrer-Policy: no-referrer` (les pàgines HTML,
`same-origin`: amb `no-referrer` el navegador enviaria `Origin: null` amb el formulari).

| Mètode i ruta | Entrada | Resposta |
| --- | --- | --- |
| GET /.well-known/oauth-protected-resource (i `…/mcp`) | Cap | 200 RFC 9728: `resource` = `<origen>/mcp`, `authorization_servers` = [`<origen>`] |
| GET /.well-known/oauth-authorization-server | Cap | 200 RFC 8414: `issuer`, endpoints, PKCE `S256`, auth `none`, scope `offline_access` |
| POST /oauth/register | JSON amb `redirect_uris` (1–5), `client_name?` | 201 amb `client_id` signat; no es desa res (DCR, RFC 7591) |
| GET /oauth/authorize | `client_id`, `redirect_uri`, `response_type=code`, `code_challenge`, `code_challenge_method=S256`, `state?`, `resource?` | 200 pantalla HTML de consentiment |
| POST /oauth/authorize | Formulari de la pantalla amb la casella `confirmed=yes`; capçalera `Origin` igual al propi origen | 303 cap a GitHub |
| GET /oauth/callback | `code` i `state` de GitHub | 302 al `redirect_uri` del client amb `code`, `state` i `iss` |
| POST /oauth/token | Formulari urlencoded: `grant_type`, `client_id`, `resource?` i `code` + `code_verifier` + `redirect_uri` o `refresh_token` | 200 `access_token`, `token_type: "Bearer"`, `expires_in: 3600`, `refresh_token`, `scope` |

Adreces de retorn admeses: els callbacks de Claude (`https://claude.ai/api/mcp/auth_callback`
i la variant `claude.com`) o loopback `http://localhost` / `http://127.0.0.1` (Claude Code). En loopback el port
pot ser diferent del registrat (RFC 8252); host, camí i la resta han de coincidir.
`resource`, si s'envia, ha de ser aquest servidor. Cada refresc retorna un refresh token nou.

Errors en format OAuth `{"error":"code"}`: `invalid_redirect_uri` (400, registre),
`invalid_client` (401, `client_id` no vàlid), `invalid_grant` (400, codi o refresh token
no vàlid, caducat, reutilitzat o d'un altre client), `invalid_target` (400, `resource`
aliè) i `unsupported_grant_type` (400). Els errors de `/oauth/authorize` i
`/oauth/callback` es mostren en una pàgina HTML (400/403, o 502 si GitHub no respon) i
mai es redirigeixen. Altres `/.well-known/*` → 404. Configuració OAuth incompleta →
503 `oauth_not_configured`. Límits de cos i Content-Type iguals que l'API.

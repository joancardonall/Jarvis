# Contracte inicial MCP — proposta

## Principis

Les eines són operacions de domini, no CRUD arbitrari ni SQL. Tenen esquemes d'entrada estrictes, errors clars, autorització i sortides compactes amb IDs. El model pot triar eines, però el backend valida.

## Primer conjunt mínim

- `jarvis.create_project({name, description?, priority?, idempotency_key?})` → `{id, name, status}`.
- `jarvis.list_projects({status?, query?})` → llista paginada.
- `jarvis.get_project({project_id})` → projecte, tasques i decisions rellevants.
- `jarvis.update_project({project_id, changes})` → estat resultant.
- `jarvis.create_task({project_id?, title, due_at?, priority?, idempotency_key?})` → tasca creada.
- `jarvis.update_task({task_id, changes})` → tasca actualitzada.
- `jarvis.save_decision({project_id?, summary, status?})` → decisió i procedència.
- `jarvis.search_context({query, limit?})` → resultats amb font, data i tipus.

## Segona etapa

- `jarvis.save_knowledge`, `jarvis.update_knowledge`, `jarvis.get_daily_brief`.
- Consultes d'entrenament: `jarvis.get_workout`, `jarvis.get_training_progress`.

## Regles de comportament per a Codex

- Si l'usuari diu explícitament «guarda», «recorda», «actualitza», «crea», utilitzar l'eina corresponent si està disponible.
- No afirmar que una escriptura s'ha completat fins que l'eina confirmi èxit.
- Si una referència és ambigua (dues assignatures/projectes similars), preguntar abans de modificar.
- Evitar desar cada comentari casual; per defecte captura explícita.
- Confirmar accions destructives o externes amb impacte important.
- En un xat nou, consultar Jarvis quan la resposta requereixi dades personals actualitzades; no confiar només en memòria del model.

## Integració amb Calendar

Calendar és un connector diferent del MCP de Jarvis. Per a una ordre que impliqui tasca i cita, Codex pot invocar ambdós connectors si el client els ofereix. Cal tractar èxits parcials: si es crea la tasca però falla Calendar, informar-ne i no dir que tot s'ha completat. No hi ha transacció distribuïda garantida.

## Validació

Provar 20 peticions reals, incloses ambigüitats, repeticions, errors i xats nous. Mesurar ús correcte d'eines i recuperació de dades; no assumir obediència perfecta a instruccions.

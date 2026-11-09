# Model de dades conceptual (no és encara un esquema SQL)

## Nucli proposat

- `projects`: id, name, description, status (`active|paused|completed|archived`), priority, review_after, created_at, updated_at.
- `tasks`: id, project_id nullable, title, status, priority, due_at nullable, next_review_at nullable, blocked_reason nullable, updated_at.
- `decisions`: id, project_id nullable, summary, status (`proposed|confirmed|superseded`), decided_at, source, supersedes_id nullable.
- `knowledge_items`: id, type, title nullable, content, source, confidence/status, valid_from/to nullable, created_at, updated_at.
- `activity_events`: id, entity_type, entity_id, action, timestamp, actor, correlation_id, sanitized_changes. Útil per seguiment i auditories.
- `reminder_state`: subject_type, subject_id, last_sent_at, snoozed_until, next_eligible_at. Evita soroll.
- `external_links`: provider, external_id, entity_type, entity_id, sync_timestamp. No duplicar calendaris sense necessitat.
- `notification_deliveries`: idempotency_key, channel, status, sent_at, error.

## Extensions posteriors

- Universitat: `courses`, `course_groups`, `instructors`, `course_instructors`, `assignments` (o tasques vinculades a assignatures).
- Entrenaments: `exercises`, `routines`, `routine_exercises`, `workout_sessions`, `workout_exercises`, `sets`. Conservar unitats, ordre, temps i historial; no sobreescriure sessions passades.
- Garmin: `external_activities` i mètriques tipades, amb timestamps i procedència; no definir fins a conèixer els camps realment disponibles.

## Regles

- Identificadors UUID/ULID; timestamps UTC i presentació en zona local.
- Tota dada procedent d'IA ha de tenir procedència i distingir fet, proposta i inferència.
- Operacions d'escriptura amb validació i idempotència quan correspongui.
- No modelar tot com a `memories` genèriques: les tasques, dates i estats necessiten estructura.
- No exposar SQL lliure via MCP.
- Definir política de còpies de seguretat, exportació i eliminació abans de dades sensibles.

## Pendent de decidir

Motor de DB, autentificació, migracions, estratègia de cerca, dades privades i política de retenció. Evitar comprometre taules definitives abans del primer circuit funcional.

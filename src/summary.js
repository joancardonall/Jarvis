import { z } from 'zod';
import { calendarDate, addDays, dateView, madridDate, parse, TIME_ZONE } from './validation.js';

export const summaryInput = z.object({ date: calendarDate.optional() }).strict();

// Days without activity before an active project is worth a reminder, by priority.
export const INACTIVITY_DAYS = { high: 3, normal: 7, low: 14 };
const MAX_FOLLOW_UPS = 3;
const MAX_LINES = 10;
const FETCH = 200;
const PRIORITY_RANK = { high: 0, normal: 1, low: 2 };
const DAY_MS = 86400000;

// Stored text becomes one short line: a title containing line breaks could otherwise imitate a
// whole section of the summary (relevant when an assistant saved text taken from untrusted content).
function shorten(value, max) {
  const line = Array.from(String(value).replace(/\s+/g, ' ').trim());
  return line.length > max ? `${line.slice(0, max - 1).join('')}…` : line.join('');
}
// Catalan names are written out here: the Workers runtime is not guaranteed to ship Catalan locale data.
const WEEKDAYS = ['diumenge', 'dilluns', 'dimarts', 'dimecres', 'dijous', 'divendres', 'dissabte'];
const MONTHS = ['de gener', 'de febrer', 'de març', 'd’abril', 'de maig', 'de juny', 'de juliol', 'd’agost',
  'de setembre', 'd’octubre', 'de novembre', 'de desembre'];
function longDate(date) {
  const value = new Date(`${date}T00:00:00Z`);
  return `${WEEKDAYS[value.getUTCDay()]}, ${value.getUTCDate()} ${MONTHS[value.getUTCMonth()]}`;
}

// Transparent follow-up rules (no AI): at most one reason per project, most useful first.
// Paused projects stay silent until their review date; snoozed ones until the snooze ends.
function followUps(projects, questions, today, now) {
  const candidates = [];
  for (const project of projects) {
    const snoozedUntil = dateView(project.snoozed_until);
    if (snoozedUntil && snoozedUntil > today) continue;
    const base = { project_id: project.id, project_name: project.name, priority: project.priority };
    const reviewAt = dateView(project.review_at);
    const idleDays = Math.floor((now - new Date(project.last_activity_at).getTime()) / DAY_MS);
    const question = questions.findLast(note => note.project_id === project.id);
    if (project.status === 'paused' && reviewAt && reviewAt <= today) {
      candidates.push({ ...base, rank: 0, reason: 'review_due', detail: `Revisió prevista el ${reviewAt}` });
    } else if (project.status === 'active' && question) {
      candidates.push({ ...base, rank: 1, reason: 'pending_decision', detail: shorten(question.content, 120) });
    } else if (project.status === 'active' && idleDays >= INACTIVITY_DAYS[project.priority]) {
      candidates.push({ ...base, rank: 2, reason: 'inactive', detail: `${idleDays} dies sense activitat`, idle: idleDays });
    }
  }
  return candidates
    .sort((a, b) => a.rank - b.rank || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (b.idle ?? 0) - (a.idle ?? 0))
    .slice(0, MAX_FOLLOW_UPS)
    .map(({ rank, idle, priority, ...item }) => item);
}

function section(title, lines) {
  if (!lines.length) return [];
  const shown = lines.slice(0, MAX_LINES).map(line => `• ${line}`);
  if (lines.length > MAX_LINES) shown.push(`… i ${lines.length - MAX_LINES} més`);
  return ['', title, ...shown];
}

// Plain text built from templates. Everything in it comes from stored data.
function render(summary) {
  // A deliverable shows its course; any other task shows its project.
  const context = item => item.course_name ?? item.project_name;
  const task = (item, withDate) => shorten(item.title, 120) + (context(item) ? ` (${shorten(context(item), 60)})` : '') +
    (withDate ? ` — ${item.due_date}` : '');
  const lines = [`Resum de Jarvis — ${longDate(summary.date)}`,
    ...section('Vençudes', summary.overdue.map(item => task(item, true))),
    ...section('Per avui', summary.due_today.map(item => task(item, false))),
    ...section('Propers 7 dies', summary.due_this_week.map(item => task(item, true))),
    ...section('Seguiment de projectes', summary.follow_ups.map(item => `${shorten(item.project_name, 60)}: ${shorten(item.detail, 120)}`))];
  if (summary.is_empty) lines.push('', 'Res pendent per avui ni cap projecte que demani atenció.');
  if (summary.truncated) lines.push('', 'Hi ha més elements dels que caben en aquest resum.');
  return lines.join('\n');
}

export function createSummaryService(repository, clock = Date.now) {
  return {
    async daily(owner, input = {}) {
      const requested = parse(summaryInput, input, 'invalid_summary_date').date;
      const today = requested ?? madridDate(clock());
      // For another day, inactivity is measured from noon of that day instead of from this instant.
      const now = requested && requested !== madridDate(clock()) ? Date.parse(`${requested}T12:00:00Z`) : clock();
      const [tasks, projects, questions, courses] = await Promise.all([
        repository.listTasks(owner, { project_id: null, status: 'open', due_before: addDays(today, 7), limit: FETCH + 1 }),
        repository.listProjects(owner, { status: null, query: null, limit: FETCH + 1 }),
        repository.searchNotes(owner, { query: null, kind: 'open_question', project_id: null, include_inactive: false, limit: FETCH + 1 }),
        repository.listCourses(owner, { status: 'active', query: null, limit: FETCH + 1 }),
      ]);
      // Beyond FETCH rows the summary is knowingly partial and says so.
      const truncated = [tasks, projects, questions, courses].some(rows => rows.length > FETCH);
      for (const rows of [tasks, projects, questions]) rows.length = Math.min(rows.length, FETCH);
      const names = new Map(projects.map(project => [project.id, project.name]));
      const courseNames = new Map(courses.map(course => [course.id, course.name]));
      const view = task => ({ id: task.id, title: task.title, due_date: dateView(task.due_date), priority: task.priority,
        project_id: task.project_id ?? null, project_name: names.get(task.project_id) ?? null,
        course_id: task.course_id ?? null, course_name: courseNames.get(task.course_id) ?? null });
      const dated = tasks.map(view);
      const summary = {
        date: today, time_zone: TIME_ZONE,
        overdue: dated.filter(task => task.due_date < today),
        due_today: dated.filter(task => task.due_date === today),
        due_this_week: dated.filter(task => task.due_date > today),
        follow_ups: followUps(projects, questions, today, now),
        truncated,
      };
      summary.is_empty = !summary.overdue.length && !summary.due_today.length && !summary.due_this_week.length &&
        !summary.follow_ups.length;
      return { ...summary, text: render(summary) };
    },
  };
}

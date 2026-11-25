import { createProjectService, projectLookup, projectView } from './projects.js';
import { createTaskService, taskView } from './tasks.js';
import { createNoteService, noteView } from './notes.js';
import { createCourseService, courseView, groupView } from './courses.js';
import { createSummaryService } from './summary.js';
import { parse } from './validation.js';

const EXPORT_LIMIT = 5000;
const EXPORT_VIEWS = { projects: projectView, tasks: taskView, notes: noteView, courses: courseView, course_groups: groupView };

// Builds every domain service on top of one repository. API and MCP both call these services
// directly, so the two transports can never disagree about rules or ownership.
export function createServices(repository, clock = Date.now) {
  const projects = createProjectService(repository, clock);
  return {
    projects,
    tasks: createTaskService(repository, clock),
    notes: createNoteService(repository, clock),
    courses: createCourseService(repository, clock),
    summary: createSummaryService(repository, clock),
    // Everything a new conversation needs about one project, in a single call.
    async overview(owner, input) {
      const { project_id } = parse(projectLookup, input, 'invalid_project_id');
      const project = await projects.get(owner, { project_id }); // throws 404 when missing or foreign
      const [tasks, notes] = await Promise.all([
        repository.listTasks(owner, { project_id, status: 'open', due_before: null, limit: 101 }),
        repository.searchNotes(owner, { query: null, kind: null, project_id, include_inactive: false, limit: 101 }),
      ]);
      return { project, open_tasks: tasks.slice(0, 100).map(taskView), notes: notes.slice(0, 100).map(noteView),
        truncated: tasks.length > 100 || notes.length > 100 };
    },
    // Portability: everything stored about the owner, including inactive, cancelled and archived
    // items, in the same public form the other operations return.
    async exportData(owner) {
      const result = { exported_at: new Date(clock()).toISOString(), truncated: false };
      for (const [table, view] of Object.entries(EXPORT_VIEWS)) {
        const rows = await repository.exportTable(owner, table, EXPORT_LIMIT + 1);
        if (rows.length > EXPORT_LIMIT) result.truncated = true;
        result[table] = rows.slice(0, EXPORT_LIMIT).map(view);
      }
      return result;
    },
  };
}

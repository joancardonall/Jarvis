import { AppError } from './errors.js';
import { createProjectService, projectLookup } from './projects.js';
import { createTaskService, taskView } from './tasks.js';
import { createNoteService, noteView } from './notes.js';
import { createSummaryService } from './summary.js';
import { parse } from './validation.js';

// Builds every domain service on top of one repository. API and MCP both call these services
// directly, so the two transports can never disagree about rules or ownership.
export function createServices(repository, clock = Date.now) {
  const projects = createProjectService(repository, clock);
  return {
    projects,
    tasks: createTaskService(repository, clock),
    notes: createNoteService(repository, clock),
    summary: createSummaryService(repository, clock),
    // Everything a new conversation needs about one project, in a single call.
    async overview(owner, input) {
      const { project_id } = parse(projectLookup, input, 'invalid_project_id');
      const project = await projects.get(owner, { project_id });
      const [tasks, notes] = await Promise.all([
        repository.listTasks(owner, { project_id, status: 'open', due_before: null, limit: 101 }),
        repository.searchNotes(owner, { query: null, kind: null, project_id, include_inactive: false, limit: 101 }),
      ]);
      if (!project) throw new AppError(404, 'project_not_found');
      return { project, open_tasks: tasks.slice(0, 100).map(taskView), notes: notes.slice(0, 100).map(noteView),
        truncated: tasks.length > 100 || notes.length > 100 };
    },
  };
}

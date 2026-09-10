/** Canonical action catalog. Chat tools and the UI should use the same names. */

export type ActionDomain =
  | 'tasks'
  | 'notes'
  | 'calendar'
  | 'kanban'
  | 'classhub'
  | 'grades'
  | 'pomodoro'
  | 'baon'
  | 'flashcards'
  | 'habits'
  | 'search'
  | 'meta';

export type ActionKind = 'read' | 'write';

export interface ActionOp {
  domain: ActionDomain;
  op: string;
  tool: string;
  kind: ActionKind;
  confirm?: boolean;
  page: string;
}

export const ACTION_CATALOG: ActionOp[] = [
  { domain: 'tasks', op: 'list', tool: 'get_todos', kind: 'read', page: 'todos' },
  { domain: 'tasks', op: 'create', tool: 'add_todo', kind: 'write', page: 'todos' },
  { domain: 'tasks', op: 'update', tool: 'update_todo', kind: 'write', page: 'todos' },
  { domain: 'notes', op: 'search', tool: 'get_notes', kind: 'read', page: 'notes' },
  { domain: 'notes', op: 'create', tool: 'add_note', kind: 'write', page: 'notes' },
  { domain: 'notes', op: 'vault', tool: 'search_vault', kind: 'read', page: 'notes' },
  { domain: 'calendar', op: 'list', tool: 'get_calendar', kind: 'read', page: 'calendar' },
  { domain: 'calendar', op: 'create', tool: 'add_calendar_event', kind: 'write', page: 'calendar' },
  { domain: 'kanban', op: 'create', tool: 'add_kanban_task', kind: 'write', page: 'kanban' },
  { domain: 'classhub', op: 'timetable', tool: 'get_timetable', kind: 'read', page: 'classhub' },
  { domain: 'classhub', op: 'update', tool: 'update_class_hub', kind: 'write', page: 'classhub' },
  { domain: 'classhub', op: 'add_link', tool: 'add_class_link', kind: 'write', page: 'classhub' },
  { domain: 'grades', op: 'list', tool: 'get_grades', kind: 'read', page: 'grades' },
  { domain: 'grades', op: 'add_score', tool: 'add_assessment', kind: 'write', page: 'grades' },
  { domain: 'pomodoro', op: 'stats', tool: 'get_focus_stats', kind: 'read', page: 'pomodoro' },
  { domain: 'pomodoro', op: 'start', tool: 'start_focus_session', kind: 'write', page: 'pomodoro' },
  { domain: 'baon', op: 'summary', tool: 'get_finance_summary', kind: 'read', page: 'finance' },
  { domain: 'baon', op: 'expense', tool: 'log_expense', kind: 'write', confirm: true, page: 'finance' },
  { domain: 'flashcards', op: 'list', tool: 'get_flashcards', kind: 'read', page: 'flashcards' },
  { domain: 'flashcards', op: 'create', tool: 'add_flashcard', kind: 'write', page: 'flashcards' },
  { domain: 'habits', op: 'list', tool: 'get_habits', kind: 'read', page: 'habits' },
  { domain: 'habits', op: 'check', tool: 'mark_habit', kind: 'write', page: 'habits' },
  { domain: 'search', op: 'web', tool: 'web_search', kind: 'read', page: 'dashboard' },
];

export function actionForTool(tool: string): ActionOp | undefined {
  return ACTION_CATALOG.find((a) => a.tool === tool);
}

export function writeTools(): string[] {
  return ACTION_CATALOG.filter((a) => a.kind === 'write').map((a) => a.tool);
}

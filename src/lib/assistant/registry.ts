import { DATA_TOOLS, SEARCH_TOOL, runTool, type ToolContext, type ToolDef } from '@/lib/aiTools';
import { EXTRA_TOOLS, runExtraTool } from '@/lib/assistant/extraTools';

/**
 * MCP-style connector registry.
 * Site tools live here today. Gmail / Google Calendar / etc. register the same way later:
 *   registerConnector({ id: 'gmail', label: 'Gmail', tools: [...], run })
 * without changing the chat loop.
 */
export type ConnectorId = 'site' | 'web' | 'mcp';

export interface ConnectorTool {
  connector: ConnectorId;
  name: string;
  write: boolean;
  def: ToolDef;
}

export interface Connector {
  id: ConnectorId;
  label: string;
  enabled: boolean;
  tools: ConnectorTool[];
}

const WRITE_NAMES = new Set([
  'add_todo', 'update_todo', 'add_note', 'add_calendar_event', 'add_kanban_task',
  'add_flashcard', 'add_assessment', 'log_expense', 'mark_habit',
  'update_class_hub', 'add_class_link', 'start_focus_session',
]);

function wrap(def: ToolDef, connector: ConnectorId): ConnectorTool {
  return { connector, name: def.function.name, write: WRITE_NAMES.has(def.function.name), def };
}

const extras: Connector[] = [];

export function registerConnector(connector: Connector) {
  extras.push(connector);
}

export function listConnectors(opts: { webSearch: boolean }): Connector[] {
  const site: Connector = {
    id: 'site',
    label: 'epicure',
    enabled: true,
    tools: [...EXTRA_TOOLS, ...DATA_TOOLS].map((d) => wrap(d, 'site')),
  };
  const web: Connector = {
    id: 'web',
    label: 'Web search',
    enabled: opts.webSearch,
    tools: opts.webSearch ? [wrap(SEARCH_TOOL, 'web')] : [],
  };
  return [site, web, ...extras.filter((c) => c.enabled)];
}

export function listToolDefs(opts: { webSearch: boolean; writes: boolean }): ToolDef[] {
  const tools: ToolDef[] = [];
  for (const c of listConnectors(opts)) {
    for (const t of c.tools) {
      if (!opts.writes && t.write) continue;
      tools.push(t.def);
    }
  }
  return tools;
}

export function isWriteTool(name: string) {
  return WRITE_NAMES.has(name);
}

export async function dispatchTool(name: string, args: Record<string, unknown>, ctx: ToolContext) {
  for (const c of extras) {
    const hit = c.tools.find((t) => t.name === name);
    if (hit && typeof (c as Connector & { run?: typeof runTool }).run === 'function') {
      return (c as Connector & { run: typeof runTool }).run(name, args, ctx);
    }
  }
  const extra = await runExtraTool(name, args);
  if (extra !== undefined) return extra;
  return runTool(name, args, ctx);
}

export function writeSummary(name: string, args: Record<string, unknown>) {
  if (name === 'add_todo' || name === 'update_todo') return `Task · ${String(args.title ?? 'Untitled')}${args.due_date ? ` · ${args.due_date}` : ''}`;
  if (name === 'add_note') return `Note · ${String(args.title ?? 'Untitled')}`;
  if (name === 'add_calendar_event') return `Event · ${String(args.title ?? 'Untitled')}${args.start_date ? ` · ${args.start_date}` : ''}`;
  if (name === 'add_kanban_task') return `Board task · ${String(args.title ?? 'Untitled')}`;
  if (name === 'add_flashcard') return `Flashcard · ${String(args.front ?? args.title ?? 'New card')}`;
  if (name === 'add_assessment') return `Grade · ${String(args.name ?? 'Assessment')}`;
  if (name === 'log_expense') return `Expense · ₱${String(args.amount ?? '')} · ${String(args.category ?? '')}`;
  if (name === 'mark_habit') return `Habit · ${String(args.name ?? '')}`;
  if (name === 'update_class_hub') return `Class info · ${String(args.subject_key ?? '')}`;
  if (name === 'add_class_link') return `Class link · ${String(args.title ?? '')}`;
  if (name === 'start_focus_session') return 'Start a focus session';
  return name.replaceAll('_', ' ');
}

export const PAGE_FOR_WRITE: Record<string, string> = {
  add_todo: 'todos',
  update_todo: 'todos',
  add_note: 'notes',
  add_calendar_event: 'calendar',
  add_kanban_task: 'kanban',
  add_flashcard: 'flashcards',
  add_assessment: 'grades',
  log_expense: 'finance',
  mark_habit: 'habits',
  update_class_hub: 'classhub',
  add_class_link: 'classhub',
  start_focus_session: 'pomodoro',
};

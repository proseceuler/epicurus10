import { DATA_TOOLS, SEARCH_TOOL, runTool, type ToolContext, type ToolDef } from '@/lib/aiTools';
import { EXTRA_TOOLS, runExtraTool } from '@/lib/assistant/extraTools';
import { MORE_TOOLS, runMoreTool } from '@/lib/assistant/moreTools';
import { actionForTool, writeTools } from '@/lib/assistant/actions';
import { pushUndo } from '@/lib/assistant/undo';
import { notifyDataChanged } from '@/lib/assistant/sync';
import { ingestNote } from '@/lib/assistant/rag';

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

const EXTRA_WRITES = [
  'delete_todo',
  'delete_kanban_task',
  'update_kanban_task',
  'update_calendar_event',
  'delete_calendar_event',
  'update_note',
  'delete_note',
  'mark_habits',
  'update_savings_goal',
  'stop_focus_session',
  'navigate_page',
];

const WRITE_NAMES = new Set([...writeTools(), ...EXTRA_WRITES]);

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
    tools: [...EXTRA_TOOLS, ...MORE_TOOLS, ...DATA_TOOLS].map((d) => wrap(d, 'site')),
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

export const AUTO_APPLY_WRITES = new Set([
  'add_todo',
  'update_todo',
  'delete_todo',
  'mark_habit',
  'mark_habits',
  'add_habit',
  'add_calendar_event',
  'update_calendar_event',
  'delete_calendar_event',
  'add_kanban_task',
  'move_kanban_task',
  'update_kanban_task',
  'delete_kanban_task',
  'mark_attendance',
  'update_class_hub',
  'add_class_link',
  'add_assessment',
  'add_note',
  'update_note',
  'delete_note',
  'add_flashcard',
  'update_flashcard',
  'delete_flashcard',
  'start_focus_session',
  'stop_focus_session',
  'navigate_page',
  'update_savings_goal',
]);

export async function dispatchTool(name: string, args: Record<string, unknown>, ctx: ToolContext) {
  for (const c of extras) {
    const hit = c.tools.find((t) => t.name === name);
    if (hit && typeof (c as Connector & { run?: typeof runTool }).run === 'function') {
      return (c as Connector & { run: typeof runTool }).run(name, args, ctx);
    }
  }
  const more = await runMoreTool(name, args, {
    navigate: ctx.navigate,
    pauseFocus: ctx.pauseFocus,
  });
  if (more !== undefined) {
    if (WRITE_NAMES.has(name) && name !== 'navigate_page') {
      pushUndo(name, args, more, writeSummary(name, args));
      notifyDataChanged(actionForTool(name)?.page);
    }
    return more;
  }
  const extra = await runExtraTool(name, args);
  const result = extra !== undefined ? extra : await runTool(name, args, ctx);
  if (WRITE_NAMES.has(name)) {
    pushUndo(name, args, result, writeSummary(name, args));
    notifyDataChanged(actionForTool(name)?.page);
    if (name === 'add_note' && result && typeof result === 'object') {
      const note = (result as { note?: unknown }).note ?? result;
      void ingestNote(note);
    }
  }
  return result;
}

export function writeSummary(name: string, args: Record<string, unknown>) {
  if (name === 'add_todo' || name === 'update_todo' || name === 'delete_todo')
    return `Task · ${String(args.title ?? 'Untitled')}`;
  if (name === 'add_note' || name === 'update_note' || name === 'delete_note')
    return `Note · ${String(args.title ?? 'Untitled')}`;
  if (name === 'add_calendar_event' || name === 'update_calendar_event' || name === 'delete_calendar_event')
    return `Event · ${String(args.title ?? 'Untitled')}`;
  if (name === 'add_kanban_task' || name === 'update_kanban_task' || name === 'delete_kanban_task')
    return `Board · ${String(args.title ?? 'Untitled')}`;
  if (name === 'move_kanban_task') return `Move card · ${String(args.title ?? '')} -> ${String(args.status ?? '')}`;
  if (name === 'mark_attendance') return `${args.status === 'skipped' ? 'Skip' : 'Attend'} · ${String(args.subject_key ?? '')}`;
  if (name === 'add_flashcard') return `Flashcard · ${String(args.front ?? args.title ?? 'New card')}`;
  if (name === 'update_flashcard') return `Edit card · ${String(args.front ?? args.title ?? '')}`;
  if (name === 'delete_flashcard') return `Delete card · ${String(args.front ?? args.title ?? '')}`;
  if (name === 'add_assessment') return `Grade · ${String(args.name ?? 'Assessment')}`;
  if (name === 'log_expense') return `Expense · P${String(args.amount ?? '')}`;
  if (name === 'set_allowance') return `Allowance · P${String(args.amount ?? '')}`;
  if (name === 'add_savings_goal' || name === 'update_savings_goal')
    return `Savings · ${String(args.name ?? '')}`;
  if (name === 'mark_habit' || name === 'mark_habits') return `Habit · ${String(args.name ?? args.names ?? '')}`;
  if (name === 'add_habit') return `New habit · ${String(args.name ?? '')}`;
  if (name === 'update_class_hub') return `Class info · ${String(args.subject_key ?? '')}`;
  if (name === 'add_class_link') return `Class link · ${String(args.title ?? '')}`;
  if (name === 'start_focus_session') return 'Start focus';
  if (name === 'stop_focus_session') return 'Stop focus';
  if (name === 'navigate_page') return `Open · ${String(args.page ?? '')}`;
  return name.replaceAll('_', ' ');
}

export const PAGE_FOR_WRITE: Record<string, string> = Object.fromEntries(
  writeTools().map((tool) => [tool, actionForTool(tool)?.page ?? 'dashboard']),
);

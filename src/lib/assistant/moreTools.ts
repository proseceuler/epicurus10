import { supabase } from '@/lib/supabase';
import { deleteCalendarEvent, updateCalendarEvent, getCalendarEvents } from '@/lib/calendarStore';
import type { ToolDef } from '@/lib/aiTools';
import type { PageId } from '@/components/AppLayout';

const obj = (props: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties: props,
  required,
});
const str = (description: string, enumValues?: readonly string[]) =>
  enumValues ? { type: 'string', description, enum: [...enumValues] } : { type: 'string', description };

const PAGES = [
  'dashboard', 'grades', 'classhub', 'todos', 'kanban', 'calendar', 'notes',
  'pomodoro', 'habits', 'finance', 'flashcards', 'settings', 'analytics',
] as const;

export const MORE_TOOLS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'delete_todo',
      description: 'Delete a to-do task by title match or id.',
      parameters: obj({ title: str('Task title or part of it'), id: str('Exact task id if known') }, []),
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_kanban_task',
      description: 'Delete a Kanban card by title match or id.',
      parameters: obj({ title: str('Card title or part of it'), id: str('Exact card id if known') }, []),
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_kanban_task',
      description: 'Edit a Kanban card title or description.',
      parameters: obj({
        title: str('Current card title or part of it'),
        new_title: str('New title'),
        description: str('New description'),
        id: str('Exact card id if known'),
      }, ['title']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_calendar_event',
      description: 'Edit an existing calendar event by title match.',
      parameters: obj({
        title: str('Current event title or part of it'),
        new_title: str('New title'),
        start_date: str('YYYY-MM-DD'),
        end_date: str('YYYY-MM-DD'),
        description: str('Details'),
      }, ['title']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_calendar_event',
      description: 'Delete a calendar event by title match.',
      parameters: obj({ title: str('Event title or part of it') }, ['title']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_note',
      description: 'Edit an existing note by title match.',
      parameters: obj({
        title: str('Current note title or part of it'),
        new_title: str('New title'),
        content: str('New body markdown'),
        folder: str('Folder name'),
      }, ['title']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_note',
      description: 'Delete a note by title match.',
      parameters: obj({ title: str('Note title or part of it') }, ['title']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'navigate_page',
      description: 'Open another page in the app (todos, kanban, calendar, classhub, grades, notes, habits, finance, pomodoro, flashcards, settings, dashboard).',
      parameters: obj({ page: str('Page id', PAGES) }, ['page']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'stop_focus_session',
      description: 'Pause or stop the focus / pomodoro timer.',
      parameters: obj({}),
    },
  },
  {
    type: 'function',
    function: {
      name: 'mark_habits',
      description: 'Check or uncheck one or more habits for a given date (default today).',
      parameters: obj({
        names: { type: 'array', items: { type: 'string' }, description: 'Habit names (partial match ok)' },
        name: str('Single habit name if not using names[]'),
        date: str('YYYY-MM-DD, default today'),
        completed: { type: 'boolean', description: 'true=check, false=uncheck, default true' },
      }, []),
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_savings_goal',
      description: 'Edit a savings goal by name match.',
      parameters: obj({
        name: str('Goal name or part of it'),
        target_amount: { type: 'number', description: 'New target' },
        current_amount: { type: 'number', description: 'Amount saved so far' },
        new_name: str('Rename goal'),
      }, ['name']),
    },
  },
];

export type MoreToolContext = {
  navigate?: (page: PageId) => void;
  pauseFocus?: () => void;
};

export async function runMoreTool(
  name: string,
  args: Record<string, unknown>,
  ctx: MoreToolContext = {},
): Promise<unknown | undefined> {
  switch (name) {
    case 'delete_todo': {
      if (args.id) {
        const { error } = await supabase.from('todos').delete().eq('id', String(args.id));
        if (error) throw error;
        return { ok: true, deleted_id: args.id };
      }
      const title = String(args.title || '').toLowerCase();
      const { data } = await supabase.from('todos').select('id,title').limit(80);
      const hit = (data ?? []).find((t) => String(t.title).toLowerCase().includes(title));
      if (!hit) return { ok: false, error: 'Task not found' };
      const { error } = await supabase.from('todos').delete().eq('id', hit.id);
      if (error) throw error;
      return { ok: true, deleted: hit };
    }
    case 'delete_kanban_task': {
      if (args.id) {
        const { error } = await supabase.from('kanban_tasks').delete().eq('id', String(args.id));
        if (error) throw error;
        return { ok: true, deleted_id: args.id };
      }
      const title = String(args.title || '').toLowerCase();
      const { data } = await supabase.from('kanban_tasks').select('id,title').limit(80);
      const hit = (data ?? []).find((t) => String(t.title).toLowerCase().includes(title));
      if (!hit) return { ok: false, error: 'Card not found' };
      const { error } = await supabase.from('kanban_tasks').delete().eq('id', hit.id);
      if (error) throw error;
      return { ok: true, deleted: hit };
    }
    case 'update_kanban_task': {
      const title = String(args.title || '').toLowerCase();
      let id = args.id ? String(args.id) : '';
      if (!id) {
        const { data } = await supabase.from('kanban_tasks').select('id,title,description').limit(80);
        const hit = (data ?? []).find((t) => String(t.title).toLowerCase().includes(title));
        if (!hit) return { ok: false, error: 'Card not found' };
        id = hit.id;
      }
      const patch: Record<string, unknown> = {};
      if (args.new_title) patch.title = args.new_title;
      if (args.description != null) patch.description = args.description;
      const { data, error } = await supabase.from('kanban_tasks').update(patch).eq('id', id).select().single();
      if (error) throw error;
      return { ok: true, task: data };
    }
    case 'update_calendar_event': {
      const title = String(args.title || '').toLowerCase();
      const events = getCalendarEvents();
      const hit = events.find((e) => e.title.toLowerCase().includes(title));
      if (!hit) return { ok: false, error: 'Event not found' };
      const patch: Record<string, unknown> = {};
      if (args.new_title) patch.title = args.new_title;
      if (args.start_date) patch.start = String(args.start_date);
      if (args.end_date) patch.end = String(args.end_date);
      if (args.description != null) patch.description = args.description;
      const updated = updateCalendarEvent(hit.id, patch as never);
      return { ok: true, event: updated };
    }
    case 'delete_calendar_event': {
      const title = String(args.title || '').toLowerCase();
      const events = getCalendarEvents();
      const hit = events.find((e) => e.title.toLowerCase().includes(title));
      if (!hit) return { ok: false, error: 'Event not found' };
      deleteCalendarEvent(hit.id);
      return { ok: true, deleted: hit.title };
    }
    case 'update_note': {
      const title = String(args.title || '').toLowerCase();
      const { data: rows } = await supabase.from('notes').select('id,title,content,folder').limit(60);
      const hit = (rows ?? []).find((n) => String(n.title).toLowerCase().includes(title));
      if (!hit) return { ok: false, error: 'Note not found' };
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (args.new_title) patch.title = args.new_title;
      if (args.content != null) patch.content = args.content;
      if (args.folder) patch.folder = args.folder;
      const { data, error } = await supabase.from('notes').update(patch).eq('id', hit.id).select().single();
      if (error) throw error;
      return { ok: true, note: data, previous: hit };
    }
    case 'delete_note': {
      const title = String(args.title || '').toLowerCase();
      const { data: rows } = await supabase.from('notes').select('id,title').limit(60);
      const hit = (rows ?? []).find((n) => String(n.title).toLowerCase().includes(title));
      if (!hit) return { ok: false, error: 'Note not found' };
      const { error } = await supabase.from('notes').delete().eq('id', hit.id);
      if (error) throw error;
      return { ok: true, deleted: hit };
    }
    case 'navigate_page': {
      const page = String(args.page || 'dashboard') as PageId;
      ctx.navigate?.(page);
      return { ok: true, page };
    }
    case 'stop_focus_session': {
      ctx.pauseFocus?.();
      return { ok: true, paused: true };
    }
    case 'mark_habits': {
      const date = String(args.date || new Date().toLocaleDateString('en-CA'));
      const completed = args.completed !== false;
      const names: string[] = Array.isArray(args.names)
        ? (args.names as string[])
        : args.name
          ? [String(args.name)]
          : [];
      if (!names.length) return { ok: false, error: 'Provide habit name(s)' };
      const { data: habits } = await supabase.from('habits').select('id,name');
      const results: unknown[] = [];
      for (const n of names) {
        const hit = (habits ?? []).find((h) => h.name.toLowerCase().includes(n.toLowerCase()));
        if (!hit) {
          results.push({ name: n, ok: false, error: 'not found' });
          continue;
        }
        if (completed) {
          const { error } = await supabase.from('habit_completions').upsert(
            { habit_id: hit.id, completion_date: date },
            { onConflict: 'habit_id,completion_date' },
          );
          if (error) results.push({ name: hit.name, ok: false, error: error.message });
          else results.push({ name: hit.name, ok: true, date, completed: true });
        } else {
          const { error } = await supabase
            .from('habit_completions')
            .delete()
            .eq('habit_id', hit.id)
            .eq('completion_date', date);
          if (error) results.push({ name: hit.name, ok: false, error: error.message });
          else results.push({ name: hit.name, ok: true, date, completed: false });
        }
      }
      return { ok: true, results };
    }
    case 'update_savings_goal': {
      const name = String(args.name || '').toLowerCase();
      const { data: goals } = await supabase.from('finance_goals').select('*').limit(40);
      const hit = (goals ?? []).find((g) => String(g.name || g.title || '').toLowerCase().includes(name));
      if (!hit) return { ok: false, error: 'Goal not found' };
      const patch: Record<string, unknown> = {};
      if (args.new_name) {
        if ('name' in hit) patch.name = args.new_name;
        else patch.title = args.new_name;
      }
      if (args.target_amount != null) patch.target_amount = args.target_amount;
      if (args.current_amount != null) patch.current_amount = args.current_amount;
      const { data, error } = await supabase.from('finance_goals').update(patch).eq('id', hit.id).select().single();
      if (error) throw error;
      return { ok: true, goal: data, previous: hit };
    }
    default:
      return undefined;
  }
}

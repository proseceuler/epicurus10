import { supabase } from '@/lib/supabase';
import { deleteCalendarEvent } from '@/lib/calendarStore';
import { notifyDataChanged } from '@/lib/assistant/sync';

export interface UndoRecord {
  id: string;
  tool: string;
  summary: string;
  at: string;
}

interface InternalEntry extends UndoRecord {
  revert: () => Promise<boolean>;
}

const MAX = 10;
const stack: InternalEntry[] = [];

function idOf(value: unknown, keys: string[]): string | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  for (const key of keys) {
    const inner = row[key];
    if (inner && typeof inner === 'object' && 'id' in (inner as object)) {
      return String((inner as { id: unknown }).id);
    }
  }
  if ('id' in row) return String(row.id);
  return null;
}

async function del(table: string, id: string) {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw error;
  return true;
}

export function pushUndo(tool: string, args: Record<string, unknown>, result: unknown, summary: string) {
  const ok = result && typeof result === 'object' && (result as { ok?: boolean }).ok !== false;
  if (!ok) return;

  const revert = buildRevert(tool, args, result);
  if (!revert) return;

  stack.push({
    id: `undo_${Date.now()}_${stack.length}`,
    tool,
    summary,
    at: new Date().toISOString(),
    revert,
  });
  if (stack.length > MAX) stack.shift();
}

function buildRevert(
  tool: string,
  args: Record<string, unknown>,
  result: unknown,
): (() => Promise<boolean>) | null {
  const row = result as Record<string, unknown>;

  if (tool === 'add_todo') {
    const id = idOf(result, ['todo']);
    return id ? () => del('todos', id) : null;
  }
  if (tool === 'add_note') {
    const id = idOf(result, ['note']);
    return id ? () => del('notes', id) : null;
  }
  if (tool === 'add_calendar_event') {
    const id = idOf(result, ['event']);
    return id
      ? async () => {
          deleteCalendarEvent(id);
          return true;
        }
      : null;
  }
  if (tool === 'add_kanban_task') {
    const id = idOf(result, ['task']);
    return id ? () => del('kanban_tasks', id) : null;
  }
  if (tool === 'move_kanban_task') {
    const id = idOf(result, ['task']);
    const previous = String(row.previous_status || '');
    return id && previous
      ? async () => {
          const { error } = await supabase.from('kanban_tasks').update({ status: previous }).eq('id', id);
          if (error) throw error;
          return true;
        }
      : null;
  }
  if (tool === 'mark_attendance') {
    const id = idOf(result, ['attendance']);
    const previous = row.previous ? String(row.previous) : null;
    return id
      ? async () => {
          if (previous) {
            const { error } = await supabase.from('class_attendance').update({ status: previous }).eq('id', id);
            if (error) throw error;
          } else {
            await del('class_attendance', id);
          }
          return true;
        }
      : null;
  }
  if (tool === 'add_flashcard') {
    const id = idOf(result, ['card']);
    return id ? () => del('flashcards', id) : null;
  }
  if (tool === 'add_assessment') {
    const id = idOf(result, ['assessment']);
    return id ? () => del('assessments', id) : null;
  }
  if (tool === 'log_expense') {
    const id = idOf(result, ['transaction']);
    return id ? () => del('finance_transactions', id) : null;
  }
  if (tool === 'set_allowance') {
    const settings = row.settings as { id?: string } | undefined;
    const previous = row.previous as { allowance_amount?: number; allowance_period?: string } | undefined;
    const created = Boolean(row.created);
    if (created && settings?.id) {
      return () => del('finance_settings', String(settings.id));
    }
    if (settings?.id && previous) {
      return async () => {
        const { error } = await supabase
          .from('finance_settings')
          .update({
            allowance_amount: previous.allowance_amount,
            allowance_period: previous.allowance_period,
            updated_at: new Date().toISOString(),
          })
          .eq('id', settings.id);
        if (error) throw error;
        return true;
      };
    }
    return null;
  }
  if (tool === 'add_savings_goal') {
    const id = idOf(result, ['goal']);
    return id ? () => del('finance_goals', id) : null;
  }
  if (tool === 'add_class_link') {
    const id = idOf(result, ['link']);
    return id ? () => del('class_hub_links', id) : null;
  }
  if (tool === 'mark_habit') {
    const habit = String(row.habit ?? args.name ?? '');
    const date = String(row.date ?? args.date ?? '');
    return async () => {
      const { data: habits } = await supabase.from('habits').select('id,name');
      const match = (habits ?? []).find((h: { name: string }) =>
        h.name.toLowerCase().includes(habit.toLowerCase()),
      );
      if (!match) return false;
      const { error } = await supabase
        .from('habit_completions')
        .delete()
        .eq('habit_id', match.id)
        .eq('completion_date', date);
      if (error) throw error;
      return true;
    };
  }
  if (tool === 'update_todo' && row.todo && typeof row.todo === 'object') {
    return null;
  }
  return null;
}

export function peekUndo(): UndoRecord | null {
  const last = stack[stack.length - 1];
  if (!last) return null;
  const { id, tool, summary, at } = last;
  return { id, tool, summary, at };
}

export async function undoLastWrite(): Promise<{ ok: boolean; summary?: string; error?: string }> {
  const last = stack.pop();
  if (!last) return { ok: false, error: 'Nothing to undo.' };
  try {
    await last.revert();
    notifyDataChanged();
    return { ok: true, summary: last.summary };
  } catch (e) {
    return { ok: false, error: (e as Error).message || 'Undo failed.' };
  }
}

import { supabase } from '@/lib/supabase';
import { SUBJECTS, type SubjectKey } from '@/lib/types';
import { parseNaturalWhen } from '@/lib/parseWhen';
import { lastNDays, todayIso } from '@/lib/habit-stats';
import { upsertLinkedCalendarEvent } from '@/lib/calendarStore';

const SUBJECT_HINTS: Array<{ keys: string[]; subject: SubjectKey }> = [
  { keys: ['chem', 'chemistry', 'bio', 'biology', 'physics', 'sci'], subject: 'science' },
  { keys: ['math', 'algebra', 'geometry', 'calc'], subject: 'math' },
  { keys: ['english', 'eng'], subject: 'english' },
  { keys: ['filipino', 'fil'], subject: 'filipino' },
  { keys: ['research'], subject: 'research' },
  { keys: ['values'], subject: 'values' },
  { keys: ['mapeh', 'pe', 'music', 'arts'], subject: 'mapeh' },
  { keys: ['ap', 'araling'], subject: 'ap' },
];

export function inferSubject(text: string, explicit?: string): SubjectKey | null {
  if (explicit && SUBJECTS.some((s) => s.key === explicit)) return explicit as SubjectKey;
  const t = text.toLowerCase();
  for (const hint of SUBJECT_HINTS) {
    if (hint.keys.some((k) => new RegExp(`\\b${k}\\b`, 'i').test(t))) return hint.subject;
  }
  return null;
}

export async function addTaskFromChat(args: Record<string, unknown>) {
  const rawTitle = String(args.title || '').trim();
  if (!rawTitle) return { ok: false, error: 'Need a task title.' };
  const parsed = parseNaturalWhen(rawTitle);
  const title = parsed.title || rawTitle;
  const due = String(args.due_date || parsed.start_date || '') || null;
  const subject_key = inferSubject(`${rawTitle} ${args.subject_key || ''}`, args.subject_key ? String(args.subject_key) : undefined);
  const { data, error } = await supabase
    .from('todos')
    .insert({
      title,
      subject_key,
      due_date: due,
      priority: args.priority || 'not_urgent_important',
      completed: false,
      all_day: parsed.all_day,
      start_time: parsed.start_time,
      end_time: parsed.end_time,
    })
    .select()
    .single();
  if (error) throw error;
  if (data?.due_date) {
    const eventId = upsertLinkedCalendarEvent({
      title: data.title,
      date: data.due_date,
      subject_key: data.subject_key,
      kind: 'deadline',
      linked_todo_id: data.id,
    });
    if (eventId) await supabase.from('todos').update({ calendar_event_id: eventId }).eq('id', data.id);
  }
  return { ok: true, todo: data, resolved: { title, due, subject_key } };
}

export async function completeTaskFromChat(args: Record<string, unknown>) {
  const needle = String(args.title || '').toLowerCase();
  const { data: todos } = await supabase.from('todos').select('*');
  const match = (todos ?? []).find((t: { title: string }) => String(t.title).toLowerCase().includes(needle));
  if (!match) return { ok: false, error: `No task matching "${args.title}".` };
  const completed = typeof args.completed === 'boolean' ? args.completed : true;
  const patch: Record<string, unknown> = { completed };
  if (typeof args.new_title === 'string' && args.new_title.trim()) patch.title = args.new_title.trim();
  if (args.due_date) patch.due_date = args.due_date;
  const { data, error } = await supabase.from('todos').update(patch).eq('id', match.id).select().single();
  if (error) throw error;
  return { ok: true, todo: data };
}

function matchHabit(habits: Array<{ id: string; name: string }>, name: string) {
  const needle = name.toLowerCase().trim();
  return (
    habits.find((h) => h.name.toLowerCase() === needle) ||
    habits.find((h) => h.name.toLowerCase().includes(needle)) ||
    habits.find((h) => needle.includes(h.name.toLowerCase().split(' ')[0])) ||
    habits.find((h) => /read/.test(needle) && /read/.test(h.name.toLowerCase()))
  );
}

export async function checkHabitFromChat(args: Record<string, unknown>) {
  const { data: habits } = await supabase.from('habits').select('*');
  const match = matchHabit(habits ?? [], String(args.name || ''));
  if (!match) {
    return { ok: false, error: `No habit matching "${args.name}".`, habits: (habits ?? []).map((h: { name: string }) => h.name) };
  }
  const date = String(args.date || todayIso());
  const { data: existing } = await supabase
    .from('habit_completions')
    .select('id')
    .eq('habit_id', match.id)
    .eq('completion_date', date)
    .maybeSingle();
  if (existing?.id) return { ok: true, habit: match.name, date, already: true };
  const { error } = await supabase.from('habit_completions').insert({ habit_id: match.id, completion_date: date });
  if (error) throw error;
  return { ok: true, habit: match.name, date };
}

export async function habitStatsFromChat() {
  const [{ data: habits }, { data: done }] = await Promise.all([
    supabase.from('habits').select('*'),
    supabase.from('habit_completions').select('*'),
  ]);
  const list = habits ?? [];
  const completions = done ?? [];
  const today = todayIso();
  const week = lastNDays(7);
  return {
    today,
    habits: list.map((h: { id: string; name: string }) => {
      const dates = completions.filter((c: { habit_id: string }) => c.habit_id === h.id).map((c: { completion_date: string }) => c.completion_date);
      const doneToday = dates.includes(today);
      let streak = 0;
      const cursor = new Date(`${today}T00:00:00`);
      while (dates.includes(
        `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`,
      )) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
      }
      const weekCount = week.filter((d) => dates.includes(d)).length;
      return { id: h.id, name: h.name, done_today: doneToday, streak, done_last_7: weekCount };
    }),
  };
}

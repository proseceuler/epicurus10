import { supabase } from '@/lib/supabase';
import { addCalendarEvent } from '@/lib/calendarStore';
import { loadLists } from '@/lib/kanban';
import { parseNaturalWhen } from '@/lib/parseWhen';
import { inferSubject } from '@/lib/assistant/taskHabits';
import type { SubjectKey } from '@/lib/types';

const COL_ALIASES: Record<string, string> = {
  todo: 'todo',
  'to do': 'todo',
  backlog: 'todo',
  doing: 'in_progress',
  progress: 'in_progress',
  'in progress': 'in_progress',
  in_progress: 'in_progress',
  review: 'review',
  checking: 'review',
  done: 'done',
  finished: 'done',
  complete: 'done',
};

function todayIso() {
  return new Date().toLocaleDateString('en-CA');
}

export async function addEventFromChat(args: Record<string, unknown>) {
  const raw = String(args.title || '').trim();
  if (!raw) return { ok: false, error: 'Need an event title.' };
  const parsed = parseNaturalWhen(`${raw} ${args.start_date || ''} ${args.start_time || ''}`);
  const title = parsed.title || raw;
  const start_date = String(args.start_date || parsed.start_date || todayIso());
  const end_date = String(args.end_date || start_date);
  const subject_key = inferSubject(`${raw} ${args.subject_key || ''}`, args.subject_key ? String(args.subject_key) : undefined);
  const all_day = typeof args.all_day === 'boolean' ? args.all_day : parsed.all_day;
  const event = addCalendarEvent({
    title,
    description: String(args.description || ''),
    start_date,
    end_date,
    all_day,
    start_time: args.start_time ? String(args.start_time) : parsed.start_time,
    end_time: args.end_time ? String(args.end_time) : parsed.end_time,
    kind: (args.kind as 'event' | 'deadline' | 'exam' | 'reminder' | 'holiday') || (/quiz|exam|test/i.test(raw) ? 'exam' : 'event'),
    subject_key,
    linked_todo_id: null,
    linked_note_id: null,
    linked_habit_id: null,
    linked_kanban_id: null,
  });
  return { ok: true, event };
}

function resolveColumn(status: string) {
  const needle = status.toLowerCase().trim();
  if (COL_ALIASES[needle]) return COL_ALIASES[needle];
  const lists = loadLists();
  const hit = lists.find((l) => l.id === needle || l.label.toLowerCase() === needle || l.label.toLowerCase().includes(needle));
  return hit?.id || needle.replace(/\s+/g, '_');
}

export async function listKanbanFromChat(args: Record<string, unknown>) {
  const { data } = await supabase.from('kanban_tasks').select('id,title,status,subject_key,due_date').order('sort_order');
  let rows = data ?? [];
  if (args.status) {
    const col = resolveColumn(String(args.status));
    rows = rows.filter((r: { status: string }) => r.status === col);
  }
  return { cards: rows, columns: loadLists().map((l) => ({ id: l.id, label: l.label })) };
}

export async function addKanbanFromChat(args: Record<string, unknown>) {
  const title = String(args.title || '').trim();
  if (!title) return { ok: false, error: 'Need a card title.' };
  const parsed = parseNaturalWhen(title);
  const status = resolveColumn(String(args.status || 'todo'));
  const subject_key = inferSubject(`${title} ${args.subject_key || ''}`, args.subject_key ? String(args.subject_key) : undefined);
  const { data, error } = await supabase.from('kanban_tasks').insert({
    title: parsed.title || title,
    description: String(args.description || ''),
    status,
    subject_key,
    due_date: args.due_date ? String(args.due_date) : parsed.start_date,
    sort_order: 0,
  }).select().single();
  if (error) throw error;
  return { ok: true, task: data };
}

export async function moveKanbanFromChat(args: Record<string, unknown>) {
  const needle = String(args.title || '').toLowerCase();
  const status = resolveColumn(String(args.status || ''));
  if (!needle || !status) return { ok: false, error: 'Need a card title and a column.' };
  const { data: cards } = await supabase.from('kanban_tasks').select('*');
  const match = (cards ?? []).find((c: { title: string }) => String(c.title).toLowerCase().includes(needle));
  if (!match) return { ok: false, error: `No card matching "${args.title}".` };
  const previous = match.status;
  const { data, error } = await supabase.from('kanban_tasks').update({ status }).eq('id', match.id).select().single();
  if (error) throw error;
  return { ok: true, task: data, previous_status: previous };
}

export async function markAttendanceFromChat(args: Record<string, unknown>, status: 'attended' | 'skipped') {
  const subject = inferSubject(`${args.subject_key || ''} ${args.subject || ''} ${args.name || ''}`, args.subject_key ? String(args.subject_key) : undefined);
  if (!subject) return { ok: false, error: 'Which subject? e.g. math, science, MAPEH.' };
  const parsed = parseNaturalWhen(String(args.date || args.when || 'today'));
  const date = parsed.start_date || todayIso();
  const weekday = new Date(`${date}T12:00:00`).getDay();
  const { data: entries } = await supabase.from('timetable_entries').select('*').eq('subject_key', subject).eq('day_of_week', weekday);
  const list = entries ?? [];
  if (!list.length) {
    const { data: anyDay } = await supabase.from('timetable_entries').select('*').eq('subject_key', subject);
    return {
      ok: false,
      error: `No ${subject} class on ${date}.`,
      other_periods: anyDay ?? [],
    };
  }
  const entry = list[0];
  const existing = await supabase.from('class_attendance').select('*').eq('timetable_entry_id', entry.id).eq('class_date', date).maybeSingle();
  if (existing.data?.id) {
    const { data, error } = await supabase.from('class_attendance').update({ status }).eq('id', existing.data.id).select().single();
    if (error) throw error;
    return { ok: true, attendance: data, subject, date, previous: existing.data.status };
  }
  const { data, error } = await supabase.from('class_attendance').insert({
    timetable_entry_id: entry.id,
    class_date: date,
    status,
  }).select().single();
  if (error) throw error;
  return { ok: true, attendance: data, subject, date };
}

function inferComponent(text: string, explicit?: string) {
  if (explicit === 'ww' || explicit === 'pt' || explicit === 'ex') return explicit;
  const t = text.toLowerCase();
  if (/\b(pt|performance|project|lab)\b/.test(t)) return 'pt';
  if (/\b(exam|quiz|test|st1|st2|summative)\b/.test(t)) return 'ex';
  return 'ww';
}

export async function addScoreFromChat(args: Record<string, unknown>) {
  const blob = `${args.name || ''} ${args.subject_key || ''} ${args.component || ''}`;
  const subject_key = inferSubject(blob, args.subject_key ? String(args.subject_key) : undefined) as SubjectKey | null;
  if (!subject_key) return { ok: false, error: 'Need a subject (math, science, …).' };
  const name = String(args.name || '').trim();
  if (!name) return { ok: false, error: 'Need an assessment name.' };
  const score = Number(args.score);
  const max_score = Number(args.max_score);
  if (!Number.isFinite(score) || !Number.isFinite(max_score) || max_score <= 0) {
    return { ok: false, error: 'Need score and max_score, e.g. 18 and 20.' };
  }
  const quarter = Math.min(3, Math.max(1, Number(args.quarter || 1)));
  const component = inferComponent(blob, args.component ? String(args.component) : undefined);
  const ex_type = component === 'ex'
    ? (args.ex_type === 'st2' || args.ex_type === 'te' ? args.ex_type : 'st1')
    : null;
  const { data, error } = await supabase.from('assessments').insert({
    subject_key,
    quarter,
    component,
    ex_type,
    name,
    score,
    max_score,
  }).select().single();
  if (error) throw error;
  return { ok: true, assessment: data };
}

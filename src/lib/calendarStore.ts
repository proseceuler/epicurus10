import type { SubjectKey } from '@/lib/types';

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  all_day: boolean;
  start_time: string | null;
  end_time: string | null;
  kind: 'event' | 'deadline' | 'exam' | 'reminder' | 'holiday';
  subject_key: SubjectKey | null;
  linked_todo_id: string | null;
  linked_note_id: string | null;
  linked_habit_id: string | null;
  linked_kanban_id: string | null;
  created_at: string;
}

const KEY = 'calendar_events';

export const CALENDAR_EVENTS_UPDATED = 'calendar-events-updated';

const isBrowser = () => typeof window !== 'undefined';

export function getCalendarEvents(): CalendarEvent[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as CalendarEvent[]) : [];
    return Array.isArray(parsed) ? parsed.sort((a, b) => a.start_date.localeCompare(b.start_date)) : [];
  } catch {
    return [];
  }
}

function persist(events: CalendarEvent[]) {
  if (!isBrowser()) return;
  window.localStorage.setItem(KEY, JSON.stringify(events));
  window.dispatchEvent(new CustomEvent(CALENDAR_EVENTS_UPDATED));
}

export function addCalendarEvent(
  input: Omit<CalendarEvent, 'id' | 'created_at'>,
): CalendarEvent {
  const event: CalendarEvent = {
    ...input,
    id:
      isBrowser() && window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    created_at: new Date().toISOString(),
  };
  persist([...getCalendarEvents(), event]);
  return event;
}

export function deleteCalendarEvent(id: string) {
  persist(getCalendarEvents().filter((e) => e.id !== id));
}

export function updateCalendarEvent(id: string, patch: Partial<CalendarEvent>): CalendarEvent | null {
  const events = getCalendarEvents();
  const idx = events.findIndex((e) => e.id === id);
  if (idx < 0) return null;
  const next = { ...events[idx], ...patch, id: events[idx].id, created_at: events[idx].created_at };
  events[idx] = next;
  persist(events);
  return next;
}

export function upsertLinkedCalendarEvent(opts: {
  existingId?: string | null;
  title: string;
  date: string | null;
  all_day?: boolean;
  start_time?: string | null;
  end_time?: string | null;
  subject_key?: SubjectKey | null;
  kind?: CalendarEvent['kind'];
  linked_todo_id?: string | null;
  linked_kanban_id?: string | null;
  linked_note_id?: string | null;
  linked_habit_id?: string | null;
}): string | null {
  if (!opts.date) {
    if (opts.existingId) deleteCalendarEvent(opts.existingId);
    return null;
  }
  const payload: Omit<CalendarEvent, 'id' | 'created_at'> = {
    title: opts.title,
    description: '',
    start_date: opts.date,
    end_date: opts.date,
    all_day: opts.all_day ?? !(opts.start_time || opts.end_time),
    start_time: opts.start_time ?? null,
    end_time: opts.end_time ?? null,
    kind: opts.kind ?? 'deadline',
    subject_key: opts.subject_key ?? null,
    linked_todo_id: opts.linked_todo_id ?? null,
    linked_note_id: opts.linked_note_id ?? null,
    linked_habit_id: opts.linked_habit_id ?? null,
    linked_kanban_id: opts.linked_kanban_id ?? null,
  };
  if (opts.existingId) {
    const updated = updateCalendarEvent(opts.existingId, payload);
    if (updated) return updated.id;
  }
  return addCalendarEvent(payload).id;
}

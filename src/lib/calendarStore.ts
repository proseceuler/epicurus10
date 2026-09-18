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
  color?: string | null;
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

const DEPED_SEED_KEY = 'calendar_deped_sy2026_seeded_v1';

type SeedSpec = {
  title: string;
  start_date: string;
  end_date: string;
  kind: CalendarEvent['kind'];
  description?: string;
};

/** DepEd Order No. 009, s. 2026 — School Year 2026–2027 three-term calendar */
const DEPED_SY2026: SeedSpec[] = [
  { title: 'Brigada Eskwela / Enrollment Period', start_date: '2026-06-01', end_date: '2026-06-05', kind: 'event' },
  { title: 'Opening Block / Start of Term 1', start_date: '2026-06-08', end_date: '2026-06-11', kind: 'event' },
  { title: 'Term 1 begins', start_date: '2026-06-08', end_date: '2026-06-08', kind: 'event', description: 'Start: June 8, 2026 · End: Sept 15, 2026' },
  { title: 'Independence Day', start_date: '2026-06-12', end_date: '2026-06-12', kind: 'holiday', description: 'Regular Holiday' },
  { title: 'First Teacher-made Summative Test (T1)', start_date: '2026-07-06', end_date: '2026-07-06', kind: 'exam' },
  { title: 'Second Teacher-made Summative Test (T1)', start_date: '2026-07-28', end_date: '2026-07-28', kind: 'exam' },
  { title: 'Ninoy Aquino Day', start_date: '2026-08-21', end_date: '2026-08-21', kind: 'holiday', description: 'Non-Working Holiday' },
  { title: 'Term 1 Examination', start_date: '2026-08-21', end_date: '2026-08-21', kind: 'exam' },
  { title: 'National Heroes Day', start_date: '2026-08-31', end_date: '2026-08-31', kind: 'holiday', description: 'Regular Holiday' },
  { title: 'Term 1 Examination', start_date: '2026-09-01', end_date: '2026-09-01', kind: 'exam' },
  { title: 'End-of-Term Block (T1)', start_date: '2026-09-02', end_date: '2026-09-15', kind: 'event' },
  { title: 'ARAL Program / Reports & Co-Curricular', start_date: '2026-09-02', end_date: '2026-09-05', kind: 'event', description: 'ARAL Program, Computation of Reports, Accomplishment of School Forms, & Co-Extra-Curricular Activities' },
  { title: 'PTA Meeting & Distribution of Report Cards (T1)', start_date: '2026-09-09', end_date: '2026-09-09', kind: 'event' },
  { title: 'INSET (T1)', start_date: '2026-09-10', end_date: '2026-09-11', kind: 'event' },
  { title: 'Wellness Break of Learners (T1)', start_date: '2026-09-10', end_date: '2026-09-15', kind: 'holiday', description: 'Guided asynchronous learning experiences' },
  { title: 'Wellness Break of Teachers (T1)', start_date: '2026-09-14', end_date: '2026-09-15', kind: 'holiday' },
  { title: 'End of Term 1', start_date: '2026-09-15', end_date: '2026-09-15', kind: 'deadline' },
  { title: 'Start of Term 2', start_date: '2026-09-16', end_date: '2026-09-16', kind: 'event', description: 'Start: Sept 16, 2026 · End: Dec 18, 2026' },
  { title: 'First Teacher-made Summative Test (T2)', start_date: '2026-10-07', end_date: '2026-10-07', kind: 'exam' },
  { title: 'Second Teacher-made Summative Test (T2)', start_date: '2026-10-29', end_date: '2026-10-29', kind: 'exam' },
  { title: "All Saints' Day", start_date: '2026-11-01', end_date: '2026-11-01', kind: 'holiday', description: 'Special Non-Working Holiday' },
  { title: "All Souls' Day", start_date: '2026-11-02', end_date: '2026-11-02', kind: 'holiday', description: 'Special Non-Working Holiday' },
  { title: 'Bonifacio Day', start_date: '2026-11-30', end_date: '2026-11-30', kind: 'holiday', description: 'Regular Holiday' },
  { title: 'Term 2 Examination', start_date: '2026-12-03', end_date: '2026-12-04', kind: 'exam' },
  { title: 'End-of-Term Block (T2)', start_date: '2026-12-07', end_date: '2026-12-18', kind: 'event' },
  { title: 'Feast of the Immaculate Conception of Mary', start_date: '2026-12-08', end_date: '2026-12-08', kind: 'holiday', description: 'Special Non-Working Holiday' },
  { title: 'PTA Meeting & Distribution of Report Cards (T2)', start_date: '2026-12-15', end_date: '2026-12-15', kind: 'event' },
  { title: 'Year-End Activity', start_date: '2026-12-15', end_date: '2026-12-15', kind: 'event' },
  { title: 'INSET / Wellness Break of Learners (T2)', start_date: '2026-12-16', end_date: '2026-12-16', kind: 'event' },
  { title: 'End of Term 2', start_date: '2026-12-17', end_date: '2026-12-18', kind: 'deadline' },
  { title: 'Year-End Break / Vacation', start_date: '2026-12-19', end_date: '2026-12-31', kind: 'holiday', description: 'Wellness Break of Learners & Teachers' },
  { title: 'Start of Term 3', start_date: '2027-01-04', end_date: '2027-01-04', kind: 'event', description: 'Start: Jan 4, 2027 · End: April 8, 2027' },
  { title: 'First Teacher-made Summative Test (T3)', start_date: '2027-01-25', end_date: '2027-01-25', kind: 'exam' },
  { title: 'Chinese New Year', start_date: '2027-02-06', end_date: '2027-02-06', kind: 'holiday', description: 'Additional Special Non-Working Holiday' },
  { title: 'Second Teacher-made Summative Test (T3)', start_date: '2027-02-16', end_date: '2027-02-16', kind: 'exam' },
  { title: 'Examination (Moving up / Graduating Learners)', start_date: '2027-03-15', end_date: '2027-03-16', kind: 'exam' },
  { title: 'Examination (Other Grade Levels)', start_date: '2027-03-22', end_date: '2027-03-23', kind: 'exam' },
  { title: 'End-of-Term Block (T3)', start_date: '2027-03-24', end_date: '2027-03-24', kind: 'event' },
  { title: 'End-of-Term Block (T3)', start_date: '2027-03-29', end_date: '2027-03-31', kind: 'event' },
  { title: 'Maundy Thursday', start_date: '2027-03-25', end_date: '2027-03-25', kind: 'holiday', description: 'Regular Holiday' },
  { title: 'Good Friday', start_date: '2027-03-26', end_date: '2027-03-26', kind: 'holiday', description: 'Regular Holiday' },
  { title: 'Black Saturday', start_date: '2027-03-27', end_date: '2027-03-27', kind: 'holiday', description: 'Additional Special Non-Working Holiday' },
  { title: 'End-of-Term Block (T3)', start_date: '2027-04-01', end_date: '2027-04-08', kind: 'event' },
  { title: 'INSET (T3)', start_date: '2027-04-02', end_date: '2027-04-02', kind: 'event' },
  { title: 'INSET (T3)', start_date: '2027-04-06', end_date: '2027-04-06', kind: 'event' },
  { title: 'EOSY Rites', start_date: '2027-04-06', end_date: '2027-04-07', kind: 'event' },
  { title: 'PTA Meeting & Distribution of Report Cards / End of Term 3', start_date: '2027-04-08', end_date: '2027-04-08', kind: 'deadline' },
];

export function seedDepEdCalendarIfNeeded(): number {
  if (!isBrowser()) return 0;
  try {
    if (window.localStorage.getItem(DEPED_SEED_KEY) === '1') return 0;
  } catch {
    return 0;
  }
  const existing = getCalendarEvents();
  const existingKeys = new Set(existing.map((e) => `${e.title}|${e.start_date}|${e.end_date}`));
  const blank = {
    all_day: true as const,
    start_time: null,
    end_time: null,
    subject_key: null,
    linked_todo_id: null,
    linked_note_id: null,
    linked_habit_id: null,
    linked_kanban_id: null,
  };
  const toAdd: CalendarEvent[] = [];
  for (const spec of DEPED_SY2026) {
    const key = `${spec.title}|${spec.start_date}|${spec.end_date}`;
    if (existingKeys.has(key)) continue;
    toAdd.push({
      ...blank,
      id:
        window.crypto?.randomUUID?.() ??
        `deped_${spec.start_date}_${Math.random().toString(36).slice(2, 7)}`,
      title: spec.title,
      description: spec.description || 'DepEd SY 2026–2027 (Order No. 009, s. 2026)',
      start_date: spec.start_date,
      end_date: spec.end_date,
      kind: spec.kind,
      created_at: new Date().toISOString(),
    });
  }
  if (toAdd.length) persist([...existing, ...toAdd]);
  try {
    window.localStorage.setItem(DEPED_SEED_KEY, '1');
  } catch {
    /* ignore */
  }
  return toAdd.length;
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { MotionCollapse, MotionOverlay } from '@/components/MotionUI';
import { DateField, TimeField } from '@/components/fields';
import { supabase } from '@/lib/supabase';
import { SUBJECTS, type Todo, type KanbanTask, type SubjectKey, type Note, type Habit, type HabitCompletion } from '@/lib/types';
import {
  getCalendarEvents,
  addCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
  seedDepEdCalendarIfNeeded,
  CALENDAR_EVENTS_UPDATED,
  type CalendarEvent,
} from '@/lib/calendarStore';
import { parseNaturalWhen } from '@/lib/parseWhen';
import { confirmDelete } from '@/lib/confirm';
import { pushScheduleToLinked, scheduleTodo, scheduleKanban } from '@/lib/calendarSync';
import { Card, PageHeader, EmptyState, Button, Input, Select } from '@/components/kit';
import { KINDS, KIND_STYLE, SOURCE_STYLE } from '@/lib/calendarTheme';
import {
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, X, Trash2,
  Link2, CheckSquare, FolderTree, Sparkles,
} from 'lucide-react';

export type { CalendarEvent };

type CalView = 'month' | 'week' | 'day';
type Density = 'compact' | 'comfortable';
type DragPayload =
  | { kind: 'event'; id: string }
  | { kind: 'todo'; id: string }
  | { kind: 'kanban'; id: string }
  | { kind: 'note'; id: string }
  | { kind: 'habit'; id: string };

const iso = (d: Date) => d.toLocaleDateString('en-CA');
const parse = (s: string) => new Date(s + 'T00:00:00');
const pad = (n: number) => String(n).padStart(2, '0');
const hm = (h: number, m = 0) => `${pad(h)}:${pad(m)}`;
const addOneHour = (label: string) => {
  const [hs, ms] = label.split(':').map(Number);
  const total = (hs || 0) * 60 + (ms || 0) + 60;
  return hm(Math.min(23, Math.floor(total / 60)), total % 60);
};
const labelToMinutes = (label: string) => {
  const [hs, ms] = label.split(':').map(Number);
  return (hs || 0) * 60 + (ms || 0);
};

function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

const emptyDraft = (date: string) => ({
  id: '' as string,
  title: '',
  description: '',
  start_date: date,
  end_date: date,
  all_day: true,
  start_time: '',
  end_time: '',
  kind: 'event',
  subject_key: '',
  linked_todo_id: '',
  linked_note_id: '',
  linked_habit_id: '',
  linked_kanban_id: '',
});

type Draft = ReturnType<typeof emptyDraft>;

function applyTitleParse(current: Draft, raw: string): Draft {
  const parsed = parseNaturalWhen(raw);
  const extracted = parsed.title.trim() !== raw.trim() || !parsed.all_day;
  if (!extracted) return { ...current, title: raw };
  return {
    ...current,
    title: raw,
    start_date: parsed.start_date || current.start_date,
    end_date: parsed.end_date || parsed.start_date || current.end_date,
    all_day: parsed.all_day,
    start_time: parsed.all_day ? current.start_time : (parsed.start_time || current.start_time),
    end_time: parsed.all_day ? current.end_time : (parsed.end_time || current.end_time),
  };
}

function detectedHint(title: string) {
  const parsed = parseNaturalWhen(title);
  if (parsed.title.trim() === title.trim() && parsed.all_day) return '';
  const time = parsed.all_day ? 'all day' : `${parsed.start_time || ''}${parsed.end_time ? `-${parsed.end_time}` : ''}`;
  return `Detected ${parsed.start_date} · ${time}`;
}

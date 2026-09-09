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

const KINDS = [
  { value: 'event', label: 'Event' },
  { value: 'deadline', label: 'Deadline' },
  { value: 'exam', label: 'Exam' },
  { value: 'reminder', label: 'Reminder' },
  { value: 'holiday', label: 'Holiday / No class' },
];

const KIND_STYLE: Record<string, string> = {
  event: 'bg-zinc-800 text-white',
  deadline: 'bg-zinc-700 text-white',
  exam: 'bg-zinc-900 text-white',
  reminder: 'bg-zinc-600 text-white',
  holiday: 'bg-zinc-500 text-white',
};

const SOURCE_STYLE = {
  event: 'bg-zinc-800 text-white',
  todo: 'border border-zinc-300 bg-zinc-100 text-zinc-800',
  kanban: 'border border-zinc-300 bg-zinc-50 text-zinc-700',
  note: 'border border-zinc-300 bg-zinc-100 text-zinc-700',
  habit: 'border border-zinc-300 bg-zinc-50 text-zinc-700',
};

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

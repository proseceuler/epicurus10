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

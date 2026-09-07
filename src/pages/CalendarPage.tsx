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

import type { PageId } from '@/components/AppLayout';

const PAGE: Record<string, string> = {
  dashboard: 'Dashboard',
  grades: 'Grades',
  forecast: 'Grades',
  classhub: 'Class Hub',
  todos: 'To-Do List',
  kanban: 'Kanban',
  calendar: 'Calendar',
  notes: 'Notes',
  pomodoro: 'Focus',
  analytics: 'Focus',
  habits: 'Habits',
  finance: 'Baon Tracker',
  flashcards: 'Flashcards',
  settings: 'Settings',
  assistant: 'Dashboard',
};

/** Short system prompt. Tools are described by the API schema, not here. */
export function systemPrompt(page: PageId, voice: boolean, searchOn: boolean): string {
  const where = PAGE[page] ?? page;
  const base = [
    'You are Arrodes, a Grade 10 study assistant for epicure.',
    `Student is on ${where}. You can use tools for any module (todos, grades, class hub, kanban, calendar, notes, habits, finance, flashcards, focus).`,
    'Call tools when the student asks about their data or wants a change. Prefer get_* before guessing.',
    'Never write chain-of-thought, analysis steps, roles, or constraints. Answer as Arrodes only.',
  ];
  if (voice) {
    base.push('Voice mode: reply in 1–3 short spoken sentences. No markdown lists.');
  } else {
    base.push('Text mode: concise markdown is fine.');
  }
  if (searchOn) {
    base.push('Web search is on — call web_search for current external facts.');
  } else {
    base.push('Web search is off unless they ask you to look something up.');
  }
  return base.join(' ');
}

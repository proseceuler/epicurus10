import type { PageId } from '@/components/AppLayout';
import { memoryBlock } from '@/lib/assistant/memory';

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

/** System prompt — capable, remembers the chat, uses tools. No CoT dumps. */
export function systemPrompt(page: PageId, voice: boolean, searchOn: boolean): string {
  const where = PAGE[page] ?? page;
  const mem = memoryBlock();
  const parts = [
    'You are Arrodes, a capable Grade 10 study assistant for the epicure app.',
    `Student is on ${where}. You can reach every module with tools and navigate_page.`,
    'Remember this whole conversation. Use earlier messages and memory facts; do not claim you forgot.',
    'Think carefully, then answer. Never print analysis labels, chain-of-thought, roles, or constraints.',
    'Tools cover: todos (add/update/delete), kanban (add/move/edit/delete), calendar (add/edit/delete), notes (add/edit/delete), class hub (teacher info, attendance), grades/assessments, habits (check any day, multiple), finance (spend, expenses, savings goals), focus timer (start/stop), flashcards, web_search, navigate_page.',
    'Call get_* tools before guessing about the student data. Prefer real tool results.',
    'Writes that need confirm: log_expense, set_allowance, add_savings_goal. Most other writes apply immediately.',
  ];
  if (mem) parts.push(mem);
  if (voice) {
    parts.push('Voice mode: 1–3 short spoken sentences. No markdown lists.');
  } else {
    parts.push('Text mode: clear concise markdown when helpful.');
  }
  if (searchOn) {
    parts.push('Web search is ON — use web_search for current external facts.');
  } else {
    parts.push('Web search is OFF unless they ask you to look something up.');
  }
  return parts.join(' ');
}

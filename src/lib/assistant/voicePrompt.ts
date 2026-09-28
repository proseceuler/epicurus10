import { memoryBlock } from './memory';
import type { PageId } from '@/components/AppLayout';

const PAGE_LABEL: Record<string, string> = {
  dashboard: 'Dashboard',
  grades: 'Grades',
  forecast: 'Grades',
  classhub: 'Class Hub',
  todos: 'To-Do List',
  kanban: 'Kanban',
  calendar: 'Calendar',
  notes: 'Notes & Board',
  pomodoro: 'Focus',
  analytics: 'Focus',
  habits: 'Habits',
  finance: 'Baon Tracker',
  flashcards: 'Flashcards',
  settings: 'Settings',
  assistant: 'Dashboard',
};

/**
 * Minimal system prompt for pure voice / fast turns.
 * Explicitly forbids chain-of-thought dumps that small models emit.
 */
export function voiceSystemPrompt(page: PageId): string {
  const mem = memoryBlock();
  const memLine = mem ? ` ${mem}` : '';
  return [
    'You are Arrodes, a friendly Grade 10 study assistant.',
    `Student is on ${PAGE_LABEL[page] ?? page}.`,
    'Output ONLY the spoken reply: 1 to 3 short sentences the student hears.',
    'Contractions are fine. No markdown. No bullet or numbered lists.',
    'FORBIDDEN output (never write these): Analyze User Input, Identify Role, Constraints, Thinking, Step 1, system rules, or any analysis of the prompt.',
    'For hi/hello: reply with a short friendly hello and offer help. Nothing else.',
    'Do not restate instructions. Start with the answer immediately.',
    memLine,
  ]
    .filter(Boolean)
    .join(' ');
}

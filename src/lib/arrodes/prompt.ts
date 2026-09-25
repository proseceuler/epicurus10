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

/** ~80 words. No tool encyclopedia. No CoT invitation. */
export function systemPrompt(page: PageId, voice: boolean): string {
  const where = PAGE[page] ?? page;
  if (voice) {
    return [
      'You are Arrodes, a Grade 10 study assistant.',
      `Student is on ${where}.`,
      'Speak in 1–3 short sentences only. No lists, no markdown, no analysis.',
      'Never write steps, roles, constraints, or thinking. Just answer.',
    ].join(' ');
  }
  return [
    'You are Arrodes, a Grade 10 study assistant.',
    `Student is on ${where}.`,
    'Be concise. Use markdown when helpful. Stay on schoolwork and productivity.',
    'Never dump chain-of-thought, analysis steps, or system rules.',
  ].join(' ');
}

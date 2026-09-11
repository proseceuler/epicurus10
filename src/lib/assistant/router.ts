import { OPENROUTER_URL, LAYER_MODELS, LAYER_FALLBACKS, VISION_MODELS, type AssistantLayer } from './models';
import { listToolDefs, isWriteTool, dispatchTool, AUTO_APPLY_WRITES } from './registry';
import { attachmentPrompt, visionParts, type ChatAttachment } from './media';
import type { ToolContext } from '@/lib/aiTools';
import type { PageId } from '@/components/AppLayout';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  attachments?: ChatAttachment[];
}

export interface PendingWrite {
  name: string;
  args: Record<string, unknown>;
  done?: boolean;
}

export interface RouterReply {
  content: string;
  pending?: PendingWrite;
  usedLayers: AssistantLayer[];
  sources?: { title: string; url: string }[];
}

const PAGE_LABEL: Record<string, string> = {
  dashboard: 'Dashboard', grades: 'Grades', forecast: 'Grades', classhub: 'Class Hub',
  todos: 'To-Do List', kanban: 'Kanban', calendar: 'Calendar', notes: 'Notes & Board',
  pomodoro: 'Focus', analytics: 'Focus', habits: 'Habits', finance: 'Baon Tracker',
  flashcards: 'Flashcards', settings: 'Settings', assistant: 'Dashboard',
};

function systemPrompt(page: PageId, search: boolean) {
  return [
    'You are the epicure study assistant for a Grade 10 student.',
    'Stay on schoolwork and productivity. Do not write or edit app code.',
    `The student is currently on ${PAGE_LABEL[page] ?? page}.`,
    'Use tools to read their real tasks, notes, grades, habits, timetable and spending when the question is about their data.',
    'Call search_epicure for how a page works and for semantic search over notes. Prefer that over guessing.',
    'If they say "to do list", "todos", "my tasks", or "what is due", call get_todos. Voice arrives as text — never say you cannot hear audio.',
    'These writes apply immediately (do not ask to confirm): add_todo, update_todo, mark_habit, add_habit, add_calendar_event, add_kanban_task, move_kanban_task, mark_attendance, update_class_hub, add_class_link, add_assessment, add_note, add_flashcard, update_flashcard, delete_flashcard, start_focus_session.',
    '"I attended math today" -> mark_attendance. "Move lab report to review" -> move_kanban_task. "Log science written work 18/20 term 1" -> add_assessment.',
    '"Save a note titled titration: used 0.1M HCl" -> add_note. "Add flashcard in Science, front mitochondria, back powerhouse" -> add_flashcard. "Change the mitochondria card back to energy organelle" -> update_flashcard. "Delete the mitochondria card" -> delete_flashcard. "Add a habit called read 20 pages" -> add_habit. "Start focus for math" -> start_focus_session.',
    'For Friday/tomorrow leave the date in the title or pass YYYY-MM-DD. Chem maps to science.',
    'Money writes still wait for confirm: log_expense, set_allowance, add_savings_goal.',
    '"Set weekly allowance to 500" -> set_allowance. "Savings goal: earphones 1500" -> add_savings_goal.',
    'Reply in markdown. Use $...$ or $$...$$ for math. Keep answers concise.',
    search ? 'Web search is ON. Call web_search when the answer needs current or external facts, then cite titles.' : 'Web search is OFF unless they explicitly ask you to look something up.',
  ].join(' ');
}

export function classifyIntent(text: string, hasMedia: boolean, searchOn: boolean): AssistantLayer[] {
  const t = text.toLowerCase();
  const layers = new Set<AssistantLayer>(['chat']);
  const actionVerb = /\b(add|create|make|schedule|log|mark|update|set|fill|record|start|complete|finish|save|edit|did|done|attend|attended|skip|skipped|move|delete|remove|check|show|list|open)\b/.test(t);
  const actionNoun = /\b(task|tasks|todo|todos|to-do|to do|note|habit|event|calendar|flashcard|grade|assessment|expense|baon|allowance|savings?|goal|class|teacher|room|office hours|kanban|card|focus|pomodoro|link|worksheet|homework|assignment|reading|read|quiz|exam|score|attendance|period|column|board)\b/.test(t);
  const vault = /\b(my notes?|vault|archive|what did i (write|save|note)|search my|from my (notes|projects?|history)|project history|how (does|do i)|where is|what is classhub|baon tracker)\b/.test(t);
  const live = searchOn || /\b(search the web|look up|latest|current|according to|news|cite|source)\b/.test(t);
  if (actionVerb && actionNoun) layers.add('execute');
  if (/\b(attended|skipped|attend|skip)\b/.test(t)) layers.add('execute');
  if (vault || /\b(my (grades|tasks|habits|schedule|timetable|spending|baon|todos?|to-?dos?))\b/.test(t)) layers.add('data');
  if (guessReadTools(t).length) layers.add('data');
  if (hasMedia) layers.add('chat');
  if (live) layers.add('chat');
  return [...layers];
}

function guessReadTools(text: string): Array<{ name: string; args: Record<string, unknown> }> {
  const t = text.toLowerCase();
  const tools: Array<{ name: string; args: Record<string, unknown> }> = [];
  if (/\b(to\s*do|to-do|todos?|tasks?)\b/.test(t) && !/\b(add|create|make|complete|finish|edit)\b/.test(t)) {
    tools.push({ name: 'get_todos', args: { only_pending: true } });
  }
  if (/\b(habit|habits|streak)\b/.test(t) && !/\b(add|create|mark|check)\b/.test(t)) {
    tools.push({ name: 'get_habits', args: {} });
    tools.push({ name: 'get_habit_stats', args: {} });
  }
  if (/\b(grade|grades|score|gpa)\b/.test(t) && !/\b(add|log|record)\b/.test(t)) {
    tools.push({ name: 'get_grades', args: {} });
  }
  if (/\b(calendar|schedule|due|deadline|event)\b/.test(t) && !/\b(add|create|make)\b/.test(t)) {
    tools.push({ name: 'get_calendar', args: {} });
  }
  if (/\b(flashcard|cards?|deck)\b/.test(t) && !/\b(add|create|delete|edit)\b/.test(t)) {
    tools.push({ name: 'get_flashcards', args: {} });
  }
  if (/\b(baon|allowance|spent|spending|budget)\b/.test(t) && !/\b(log|set|add)\b/.test(t)) {
    tools.push({ name: 'get_finance_summary', args: {} });
  }
  if (/\b(timetable|class hub|classhub|today'?s class)\b/.test(t)) {
    tools.push({ name: 'get_timetable', args: {} });
  }
  if (/\b(note|notes|vault)\b/.test(t) && !/\b(add|save|create)\b/.test(t)) {
    tools.push({ name: 'get_notes', args: { query: text } });
  }
  return tools;
}

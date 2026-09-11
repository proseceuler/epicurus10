import { supabase } from '@/lib/supabase';
import { SUBJECTS } from '@/lib/types';
import { searchEpicure } from '@/lib/assistant/rag';
import {
  addTaskFromChat,
  checkHabitFromChat,
  completeTaskFromChat,
  habitStatsFromChat,
} from '@/lib/assistant/taskHabits';
import {
  addEventFromChat,
  addKanbanFromChat,
  addScoreFromChat,
  listKanbanFromChat,
  markAttendanceFromChat,
  moveKanbanFromChat,
} from '@/lib/assistant/school';
import {
  addHabitFromChat,
  deleteFlashcardFromChat,
  updateFlashcardFromChat,
} from '@/lib/assistant/cardsHabits';

type ToolDef = {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

const SUBJECT_KEYS = SUBJECTS.map((s) => s.key);
const obj = (props: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties: props,
  required,
});
const str = (description: string, enumValues?: readonly string[]) =>
  enumValues ? { type: 'string', description, enum: [...enumValues] } : { type: 'string', description };

export const EXTRA_TOOLS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'update_todo',
      description: 'Update or complete an existing to-do by title match.',
      parameters: obj(
        {
          title: str('Current task title or part of it'),
          new_title: str('Replacement title'),
          completed: { type: 'boolean', description: 'Mark complete or incomplete' },
          due_date: str('Due date YYYY-MM-DD'),
        },
        ['title'],
      ),
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_habit_stats',
      description: 'Read habit streaks and what is still open today.',
      parameters: obj({}),
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_habit',
      description: 'Create a new habit in the tracker.',
      parameters: obj(
        {
          name: str('Habit name'),
          emoji: str('Optional emoji'),
          goal_target: { type: 'number', description: 'Days per month goal, default 30' },
        },
        ['name'],
      ),
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_kanban',
      description: 'List Kanban cards, optionally filtered by column.',
      parameters: obj({ status: str('Column: todo, in_progress, review, done, or a custom list name') }),
    },
  },
  {
    type: 'function',
    function: {
      name: 'move_kanban_task',
      description: 'Move a Kanban card to another column by title match.',
      parameters: obj(
        {
          title: str('Card title or part of it'),
          status: str('Target column: todo, in_progress, review, done'),
        },
        ['title', 'status'],
      ),
    },
  },
  {
    type: 'function',
    function: {
      name: 'mark_attendance',
      description: 'Mark a class period attended or skipped for a date (defaults to today).',
      parameters: obj(
        {
          subject_key: str('Subject', SUBJECT_KEYS),
          status: str('attended or skipped', ['attended', 'skipped']),
          date: str('Class date YYYY-MM-DD or today/tomorrow'),
        },
        ['subject_key', 'status'],
      ),
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_class_hub',
      description: 'Fill or update Class Hub fields for a subject (teacher, office hours, room, notes).',
      parameters: obj(
        {
          subject_key: str('Subject', SUBJECT_KEYS),
          teacher_name: str('Teacher name'),
          office_hours: str('Office hours'),
          room: str('Room'),
          notes: str('Extra class notes'),
        },
        ['subject_key'],
      ),
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_class_link',
      description: 'Add a quick link to Class Hub for a subject (Classroom, modules, etc.).',
      parameters: obj(
        {
          subject_key: str('Subject', SUBJECT_KEYS),
          title: str('Link title'),
          url: str('URL'),
        },
        ['subject_key', 'title', 'url'],
      ),
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_flashcard',
      description: 'Edit an existing flashcard by matching the current front text.',
      parameters: obj(
        {
          front: str('Current front / question, or part of it'),
          new_front: str('Replacement front text'),
          new_back: str('Replacement back text'),
          back: str('Alias for new_back'),
        },
        ['front'],
      ),
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_flashcard',
      description: 'Delete a flashcard by matching the front text.',
      parameters: obj({ front: str('Front / question, or part of it') }, ['front']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_vault',
      description: 'Search the student archive: notes, tasks, kanban cards and habits by keyword.',
      parameters: obj({ query: str('Keyword or phrase') }, ['query']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_epicure',
      description: 'Semantic search over epicure help pages and the student notes vault.',
      parameters: obj(
        {
          query: str('Search query'),
          namespace: str('Which corpus', ['site', 'notes', 'all']),
        },
        ['query'],
      ),
    },
  },
];

export async function runExtraTool(name: string, args: Record<string, any>): Promise<unknown | undefined> {
  switch (name) {
    case 'add_todo':
      return addTaskFromChat(args);
    case 'update_todo':
      return completeTaskFromChat(args);
    case 'mark_habit':
      return checkHabitFromChat(args);
    case 'add_habit':
      return addHabitFromChat(args);
    case 'get_habit_stats':
      return habitStatsFromChat();
    case 'add_calendar_event':
      return addEventFromChat(args);
    case 'add_kanban_task':
      return addKanbanFromChat(args);
    case 'get_kanban':
      return listKanbanFromChat(args);
    case 'move_kanban_task':
      return moveKanbanFromChat(args);
    case 'add_assessment':
      return addScoreFromChat(args);
    case 'mark_attendance':
      return markAttendanceFromChat(args, args.status === 'skipped' ? 'skipped' : 'attended');
    case 'update_flashcard':
      return updateFlashcardFromChat(args);
    case 'delete_flashcard':
      return deleteFlashcardFromChat(args);
    case 'update_class_hub': {
      const existing = await supabase.from('class_hub').select('*').eq('subject_key', args.subject_key).maybeSingle();
      const patch = {
        teacher_name: args.teacher_name ?? existing.data?.teacher_name ?? '',
        office_hours: args.office_hours ?? existing.data?.office_hours ?? '',
        room: args.room ?? existing.data?.room ?? '',
        notes: args.notes ?? existing.data?.notes ?? '',
      };
      if (existing.data?.id) {
        const { data, error } = await supabase.from('class_hub').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', existing.data.id).select().single();
        if (error) throw error;
        return { ok: true, hub: data, previous: existing.data };
      }
      const { data, error } = await supabase.from('class_hub').insert({ subject_key: args.subject_key, ...patch }).select().single();
      if (error) throw error;
      return { ok: true, hub: data, created: true };
    }
    case 'add_class_link': {
      const { data, error } = await supabase.from('class_hub_links').insert({
        subject_key: args.subject_key,
        title: args.title,
        url: args.url,
      }).select().single();
      if (error) throw error;
      return { ok: true, link: data };
    }
    case 'search_vault': {
      const q = String(args.query || '').trim();
      const [notes, todos, kanban, habits] = await Promise.all([
        supabase.from('notes').select('id,title,content,folder,updated_at').limit(30),
        supabase.from('todos').select('id,title,due_date,completed').limit(40),
        supabase.from('kanban_tasks').select('id,title,description,status').limit(40),
        supabase.from('habits').select('id,name').limit(40),
      ]);
      const hit = (text: string) => text.toLowerCase().includes(q.toLowerCase());
      return {
        query: q,
        notes: (notes.data ?? []).filter((n: any) => hit(`${n.title} ${n.content}`)).slice(0, 8),
        todos: (todos.data ?? []).filter((t: any) => hit(String(t.title))).slice(0, 8),
        kanban: (kanban.data ?? []).filter((t: any) => hit(`${t.title} ${t.description}`)).slice(0, 8),
        habits: (habits.data ?? []).filter((h: any) => hit(String(h.name))).slice(0, 8),
      };
    }
    case 'search_epicure': {
      const namespace = args.namespace === 'site' || args.namespace === 'notes' ? args.namespace : 'all';
      return searchEpicure(String(args.query || ''), namespace);
    }
    default:
      return undefined;
  }
}

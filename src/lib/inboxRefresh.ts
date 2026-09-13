import { getCalendarEvents } from '@/lib/calendarStore';
import { pushInbox } from '@/lib/inbox';
import { getLoop } from '@/lib/loop';
import { isDue } from '@/lib/sm2';
import { supabase } from '@/lib/supabase';
import { todayIso } from '@/lib/xp';
import type { PageId } from '@/components/AppLayout';

const TOUCH_KEY = 'epicure:inbox-touch:v1';

function touched(page: string) {
  if (typeof window === 'undefined') return true;
  try {
    const map = JSON.parse(localStorage.getItem(TOUCH_KEY) || '{}') as Record<string, string>;
    const today = todayIso();
    if (map[page] === today) return true;
    map[page] = today;
    localStorage.setItem(TOUCH_KEY, JSON.stringify(map));
    return false;
  } catch {
    return false;
  }
}

export async function refreshInboxFromData() {
  if (typeof window === 'undefined') return;

  const today = new Date();
  const iso = (d: Date) => d.toLocaleDateString('en-CA');
  const todayStr = iso(today);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomStr = iso(tomorrow);

  try {
    const { data: todos } = await supabase.from('todos').select('id,title,due_date,priority,completed').limit(100);
    for (const t of todos || []) {
      if (t.completed) continue;
      if (!t.due_date) continue;
      if (t.due_date === todayStr) {
        pushInbox({
          kind: 'due',
          title: `Due today: ${t.title}`,
          body: 'Task deadline',
          href: 'todos',
          priority: t.priority === 'urgent_important' || t.priority === 'high' ? 'high' : 'normal',
        });
      } else if (t.due_date === tomStr) {
        pushInbox({
          kind: 'due',
          title: `Due tomorrow: ${t.title}`,
          body: 'Upcoming deadline',
          href: 'todos',
          priority: 'normal',
        });
      } else if (t.due_date < todayStr) {
        pushInbox({
          kind: 'due',
          title: `Overdue: ${t.title}`,
          body: `Was due ${t.due_date}`,
          href: 'todos',
          priority: 'high',
        });
      }
    }
  } catch {
    /* offline */
  }

  try {
    for (const e of getCalendarEvents()) {
      if (e.start_date === todayStr || (e.start_date <= todayStr && e.end_date >= todayStr)) {
        pushInbox({
          kind: e.kind === 'exam' ? 'exam' : 'notice',
          title: e.title,
          body: e.kind === 'exam' ? 'Exam / assessment today' : e.description || 'Calendar',
          href: 'calendar',
          priority: e.kind === 'exam' || e.kind === 'deadline' ? 'high' : 'normal',
        });
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const { data: cards } = await supabase.from('flashcards').select('id,front,due_date').limit(200);
    const due = (cards || []).filter((c) => isDue(c.due_date));
    if (due.length) {
      pushInbox({
        kind: 'notice',
        title: `${due.length} flashcard${due.length === 1 ? '' : 's'} due`,
        body: 'Spaced-repetition reviews waiting',
        href: 'flashcards',
        priority: due.length > 10 ? 'high' : 'normal',
      });
    }
  } catch {
    /* ignore */
  }

  const loop = getLoop();
  if (loop.streak >= 3) {
    pushInbox({
      kind: 'streak',
      title: `${loop.streak}-day streak`,
      body: loop.freezeReady ? 'A freeze is ready.' : loop.paused ? 'Streak is paused.' : 'Floor ring keeps this alive.',
      href: 'habits',
      priority: 'low',
    });
  }
}

export function announcePage(page: PageId) {
  if (touched(page)) return;
  const loop = getLoop();
  const rings = loop.days[todayIso()];
  const open = [
    !rings?.floor ? 'floor' : null,
    !rings?.focus ? 'focus' : null,
    !rings?.school ? 'school' : null,
  ].filter(Boolean);

  const table: Partial<Record<PageId, { title: string; body: string; kind: 'notice' | 'loop' | 'due' | 'streak' | 'system' }>> = {
    dashboard: {
      kind: 'loop',
      title: open.length ? `${open.length} ring${open.length === 1 ? '' : 's'} still open` : 'Day complete',
      body: open.length ? `Still open: ${open.join(', ')}.` : 'Floor, focus, and school are closed.',
    },
    grades: { kind: 'notice', title: 'Grades', body: 'Log a WW, PT, or EX to close the school ring.' },
    classhub: { kind: 'notice', title: 'Class Hub', body: 'Mark attend to close floor and school.' },
    todos: { kind: 'due', title: 'To-Do List', body: 'Finishing a task closes the floor ring.' },
    kanban: { kind: 'notice', title: 'Kanban', body: 'Moving a card to done pays XP once.' },
    calendar: { kind: 'notice', title: 'Calendar', body: "Today's events also land in Inbox." },
    notes: { kind: 'notice', title: 'Notes', body: 'A new note counts once per day toward XP.' },
    drive: { kind: 'notice', title: 'Cloud Drive', body: 'Files stay here. Progress lives in the level chip.' },
    pomodoro: { kind: 'loop', title: 'Focus', body: 'A session of 15 minutes or more closes the focus ring.' },
    habits: { kind: 'streak', title: 'Habits', body: loop.streak ? `Streak ${loop.streak}d.` : 'Checking a habit today closes the floor ring.' },
    finance: { kind: 'notice', title: 'Baon', body: 'Saving leftover baon into a goal pays XP. Spending does not.' },
    flashcards: { kind: 'notice', title: 'Flashcards', body: 'Each due card pays XP once per due date.' },
    settings: { kind: 'system', title: 'Settings', body: 'Shortcuts and data live here. No XP on this tab.' },
  };

  const msg = table[page];
  if (!msg) return;
  pushInbox({
    kind: msg.kind,
    title: msg.title,
    body: msg.body,
    href: page,
    priority: 'low',
  });
}

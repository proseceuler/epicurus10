import { getCalendarEvents } from '@/lib/calendarStore';
import { pushInbox } from '@/lib/inbox';
import { isDue } from '@/lib/sm2';
import { supabase } from '@/lib/supabase';

/** Scan due todos, calendar, and flashcards; push inbox notices (deduped). */
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
          kind: e.kind === 'exam' ? 'exam' : e.kind === 'holiday' ? 'notice' : 'notice',
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
}

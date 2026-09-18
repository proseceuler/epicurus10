import { supabase } from '@/lib/supabase';
import type { CalendarEvent } from '@/lib/calendarStore';
import { upsertLinkedCalendarEvent } from '@/lib/calendarStore';

/** Push a calendar event's title/date/time back to the linked to-do or kanban card. */
export async function pushScheduleToLinked(event: CalendarEvent) {
  if (event.linked_todo_id) {
    await supabase.from('todos').update({
      title: event.title,
      due_date: event.start_date,
      all_day: event.all_day,
      start_time: event.all_day ? null : event.start_time,
      end_time: event.all_day ? null : event.end_time,
      calendar_event_id: event.id,
    }).eq('id', event.linked_todo_id);
  }
  if (event.linked_kanban_id) {
    await supabase.from('kanban_tasks').update({
      title: event.title,
      due_date: event.start_date,
      linked_event_id: event.id,
    }).eq('id', event.linked_kanban_id);
  }
}

export async function scheduleTodo(
  todoId: string,
  title: string,
  date: string,
  allDay: boolean,
  startTime: string | null,
  endTime: string | null,
  existingEventId?: string | null,
  subjectKey?: CalendarEvent['subject_key'],
) {
  const eventId = upsertLinkedCalendarEvent({
    existingId: existingEventId,
    title,
    date,
    all_day: allDay,
    start_time: startTime,
    end_time: endTime,
    subject_key: subjectKey ?? null,
    kind: 'deadline',
    linked_todo_id: todoId,
  });
  await supabase.from('todos').update({
    due_date: date,
    all_day: allDay,
    start_time: allDay ? null : startTime,
    end_time: allDay ? null : endTime,
    calendar_event_id: eventId,
  }).eq('id', todoId);
  return eventId;
}

export async function scheduleKanban(
  cardId: string,
  title: string,
  date: string,
  existingEventId?: string | null,
  subjectKey?: CalendarEvent['subject_key'],
) {
  const eventId = upsertLinkedCalendarEvent({
    existingId: existingEventId,
    title,
    date,
    all_day: true,
    kind: 'deadline',
    subject_key: subjectKey ?? null,
    linked_kanban_id: cardId,
  });
  await supabase.from('kanban_tasks').update({
    due_date: date,
    linked_event_id: eventId,
  }).eq('id', cardId);
  return eventId;
}

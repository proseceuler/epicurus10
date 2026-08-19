-- Run this once in your Supabase project (SQL Editor) to enable the Calendar.

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  start_date date not null,
  end_date date not null,
  all_day boolean not null default true,
  start_time text,
  end_time text,
  kind text not null default 'event',
  color text not null default 'zinc',
  subject_key text,
  linked_todo_id uuid,
  linked_note_id uuid,
  linked_habit_id uuid,
  linked_kanban_id uuid,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.calendar_events to anon;
grant select, insert, update, delete on public.calendar_events to authenticated;
grant all on public.calendar_events to service_role;

alter table public.calendar_events enable row level security;

drop policy if exists "calendar_events open access" on public.calendar_events;
create policy "calendar_events open access"
  on public.calendar_events for all
  using (true) with check (true);

create index if not exists calendar_events_start_idx on public.calendar_events (start_date);

-- Required for the AI Announcement Importer upsert (onConflict: 'title,start_date')
create unique index if not exists calendar_events_title_start_key
  on public.calendar_events (title, start_date);

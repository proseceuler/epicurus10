export type CalView = 'month' | 'week' | 'day';
export type Density = 'compact' | 'comfortable';
export type DragPayload =
  | { kind: 'event'; id: string }
  | { kind: 'todo'; id: string }
  | { kind: 'kanban'; id: string }
  | { kind: 'note'; id: string }
  | { kind: 'habit'; id: string };

export const iso = (d: Date) => d.toLocaleDateString('en-CA');
export const parse = (s: string) => new Date(s + 'T00:00:00');
export const pad = (n: number) => String(n).padStart(2, '0');
export const hm = (h: number, m = 0) => `${pad(h)}:${pad(m)}`;
export const addOneHour = (label: string) => {
  const [hs, ms] = label.split(':').map(Number);
  const total = (hs || 0) * 60 + (ms || 0) + 60;
  return hm(Math.min(23, Math.floor(total / 60)), total % 60);
};
export const labelToMinutes = (label: string) => {
  const [hs, ms] = label.split(':').map(Number);
  return (hs || 0) * 60 + (ms || 0);
};

export function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}
export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export const emptyDraft = (date: string) => ({
  id: '' as string,
  title: '',
  description: '',
  start_date: date,
  end_date: date,
  all_day: true,
  start_time: '',
  end_time: '',
  kind: 'event',
  subject_key: '',
  linked_todo_id: '',
  linked_note_id: '',
  linked_habit_id: '',
  linked_kanban_id: '',
});

export type Draft = ReturnType<typeof emptyDraft>;

export type TimedBlock = {
  id: string;
  title: string;
  start_time?: string | null;
  end_time?: string | null;
  kind: string;
  col: number;
  cols: number;
  startMin: number;
  endMin: number;
};

export function packTimed<T extends { id: string; title: string; start_time?: string | null; end_time?: string | null; kind: string }>(events: T[]): TimedBlock[] {
  const items = events.map((e) => {
    const startMin = labelToMinutes((e.start_time || '06:00').slice(0, 5));
    const rawEnd = e.end_time ? labelToMinutes(e.end_time.slice(0, 5)) : startMin + 60;
    const endMin = rawEnd <= startMin ? startMin + 60 : rawEnd;
    return { id: e.id, title: e.title, start_time: e.start_time, end_time: e.end_time, kind: e.kind, startMin, endMin, col: 0, cols: 1 };
  }).sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  const colEnds: number[] = [];
  for (const item of items) {
    let col = colEnds.findIndex((end) => end <= item.startMin);
    if (col < 0) { col = colEnds.length; colEnds.push(item.endMin); }
    else colEnds[col] = item.endMin;
    item.col = col;
  }
  const groups: TimedBlock[][] = [];
  for (const item of items) {
    const hit = groups.find((g) => g.some((x) => x.startMin < item.endMin && item.startMin < x.endMin));
    if (hit) hit.push(item);
    else groups.push([item]);
  }
  for (const g of groups) {
    const cols = Math.max(1, ...g.map((x) => x.col + 1));
    for (const x of g) x.cols = cols;
  }
  return items;
}

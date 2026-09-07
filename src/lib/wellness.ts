/** Sleep / mood daily logs for habit tracker curves */

export type WellnessDay = {
  date: string; // YYYY-MM-DD
  sleep: number | null; // hours 0–14
  mood: number | null; // 1–5
};

const KEY = 'epicure:wellness:v1';

function isBrowser() {
  return typeof window !== 'undefined';
}

export function getWellness(): WellnessDay[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as WellnessDay[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function getWellnessMap(): Map<string, WellnessDay> {
  const m = new Map<string, WellnessDay>();
  for (const d of getWellness()) m.set(d.date, d);
  return m;
}

export function setWellnessDay(date: string, patch: Partial<Omit<WellnessDay, 'date'>>) {
  if (!isBrowser()) return;
  const list = getWellness();
  const idx = list.findIndex((d) => d.date === date);
  const base: WellnessDay = idx >= 0 ? list[idx] : { date, sleep: null, mood: null };
  const next = { ...base, ...patch, date };
  if (idx >= 0) list[idx] = next;
  else list.push(next);
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent('epicure-wellness-changed'));
}

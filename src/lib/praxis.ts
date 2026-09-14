/** Praxis loop prefs, seasons, sigils, reflections, vigils. */

import { mondayIso, type LoopState } from '@/lib/loop';
import { todayIso, type LedgerEntry } from '@/lib/xp';

export type Intensity = 'light' | 'full';

export type PraxisPrefs = {
  freezeEnabled: boolean;
  vigilsEnabled: boolean;
};

export type SeasonArchive = {
  index: number;
  start: string;
  end: string;
  xp: number;
  entries: number;
};

export type PraxisState = {
  prefs: PraxisPrefs;
  seasonStart: string;
  seasonIndex: number;
  archives: SeasonArchive[];
  reflections: Record<string, string>;
  vigilClaimedWeek: string | null;
  sigils: string[];
};

const KEY = 'epicure:praxis:v1';
export const PRAXIS_CHANGED = 'epicure-praxis-changed';
export const SEASON_DAYS = 90;

const EMPTY: PraxisState = {
  prefs: { freezeEnabled: true, vigilsEnabled: false },
  seasonStart: todayIso(),
  seasonIndex: 1,
  archives: [],
  reflections: {},
  vigilClaimedWeek: null,
  sigils: [],
};

function isBrowser() {
  return typeof window !== 'undefined';
}

function load(): PraxisState {
  if (!isBrowser()) return { ...EMPTY };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY, seasonStart: todayIso() };
    const p = JSON.parse(raw) as Partial<PraxisState>;
    return {
      prefs: {
        freezeEnabled: p.prefs?.freezeEnabled !== false,
        vigilsEnabled: !!p.prefs?.vigilsEnabled,
      },
      seasonStart: typeof p.seasonStart === 'string' ? p.seasonStart : todayIso(),
      seasonIndex: Math.max(1, Math.floor(Number(p.seasonIndex) || 1)),
      archives: Array.isArray(p.archives) ? p.archives : [],
      reflections: p.reflections && typeof p.reflections === 'object' ? p.reflections : {},
      vigilClaimedWeek: typeof p.vigilClaimedWeek === 'string' ? p.vigilClaimedWeek : null,
      sigils: Array.isArray(p.sigils) ? p.sigils.filter((s) => typeof s === 'string') : [],
    };
  } catch {
    return { ...EMPTY, seasonStart: todayIso() };
  }
}

function save(state: PraxisState) {
  if (!isBrowser()) return;
  localStorage.setItem(KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent(PRAXIS_CHANGED));
}

export function getPraxis(): PraxisState {
  return reconcileSeason(load());
}

export function getPraxisPrefs(): PraxisPrefs {
  return getPraxis().prefs;
}

export function setPraxisPrefs(patch: Partial<PraxisPrefs>) {
  const state = getPraxis();
  const next = { ...state, prefs: { ...state.prefs, ...patch } };
  save(next);
  return next;
}

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return todayIso(d);
}

function daysBetween(a: string, b: string) {
  const aa = new Date(`${a}T12:00:00`).getTime();
  const bb = new Date(`${b}T12:00:00`).getTime();
  return Math.floor((bb - aa) / 86400000);
}

function reconcileSeason(state: PraxisState): PraxisState {
  const today = todayIso();
  let next = state;
  while (daysBetween(next.seasonStart, today) >= SEASON_DAYS) {
    const end = addDays(next.seasonStart, SEASON_DAYS - 1);
    next = {
      ...next,
      archives: [
        ...next.archives,
        { index: next.seasonIndex, start: next.seasonStart, end, xp: 0, entries: 0 },
      ].slice(-12),
      seasonIndex: next.seasonIndex + 1,
      seasonStart: addDays(next.seasonStart, SEASON_DAYS),
    };
  }
  if (next !== state) save(next);
  return next;
}

export function archiveSeasonXp(xp: number, entries: number) {
  const state = getPraxis();
  if (!state.archives.length) return;
  const last = state.archives[state.archives.length - 1];
  if (last.xp || last.entries) return;
  const archives = state.archives.slice();
  archives[archives.length - 1] = { ...last, xp, entries };
  save({ ...state, archives });
}

export function seasonLedger(entries: LedgerEntry[]): LedgerEntry[] {
  const { seasonStart } = getPraxis();
  return entries.filter((e) => e.date >= seasonStart);
}

export function saveReflection(text: string, date = todayIso()) {
  const state = getPraxis();
  const reflections = { ...state.reflections, [date]: text.slice(0, 180) };
  if (!text.trim()) delete reflections[date];
  save({ ...state, reflections });
}

export function reflectionFor(date = todayIso()) {
  return getPraxis().reflections[date] || '';
}

export const SIGIL_CATALOG: { id: string; glyph: string; label: string }[] = [
  { id: 'first-ring', glyph: '◦', label: 'First ring' },
  { id: 'perfect-day', glyph: '◎', label: 'Closed day' },
  { id: 'streak-7', glyph: '✶', label: 'Seven-day thread' },
  { id: 'streak-30', glyph: '✹', label: 'Thirty-day thread' },
  { id: 'perfect-week', glyph: '◉', label: 'Full week' },
  { id: 'season-2', glyph: '▣', label: 'Second season' },
  { id: 'vigil', glyph: '⌁', label: 'Vigil kept' },
];

export function earnedSigils(loop: LoopState, ledger: LedgerEntry[]): string[] {
  const praxis = getPraxis();
  const have = new Set(praxis.sigils);
  const days = Object.values(loop.days);
  if (days.some((d) => d.floor || d.focus || d.school)) have.add('first-ring');
  if (days.some((d) => d.floor && d.focus && d.school)) have.add('perfect-day');
  if (loop.streak >= 7) have.add('streak-7');
  if (loop.streak >= 30) have.add('streak-30');
  const week = mondayIso();
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const perfectWeek = weekDays.every((iso) => {
    const d = loop.days[iso];
    return !!(d && d.floor && d.focus && d.school);
  });
  if (perfectWeek) have.add('perfect-week');
  if (praxis.seasonIndex >= 2) have.add('season-2');
  if (praxis.vigilClaimedWeek) have.add('vigil');
  const list = [...have];
  if (list.length !== praxis.sigils.length || list.some((id) => !praxis.sigils.includes(id))) {
    save({ ...praxis, sigils: list });
  }
  void ledger;
  return list;
}

export function weekFocusMinutes(ledger: LedgerEntry[]) {
  const week = mondayIso();
  return ledger
    .filter((e) => e.type === 'focus_session' && e.date >= week)
    .reduce((s, e) => s + (e.minutes || 0), 0);
}

export function formatMinutes(total: number) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function vigilProgress(loop: LoopState) {
  const week = mondayIso();
  const today = todayIso();
  let closed = 0;
  for (let i = 0; i < 7; i++) {
    const iso = addDays(week, i);
    if (iso > today) break;
    const d = loop.days[iso];
    if (d && d.floor && d.focus && d.school) closed += 1;
  }
  return { closed, goal: 5, week };
}

export function claimVigilIfReady(loop: LoopState): boolean {
  const state = getPraxis();
  if (!state.prefs.vigilsEnabled) return false;
  const { closed, week } = vigilProgress(loop);
  if (closed < 5) return false;
  if (state.vigilClaimedWeek === week) return false;
  save({ ...state, vigilClaimedWeek: week, sigils: Array.from(new Set([...state.sigils, 'vigil'])) });
  return true;
}

export function gradeWeight(subject?: string): 'easy' | 'core' | 'hard' {
  if (subject === 'math' || subject === 'science' || subject === 'research') return 'hard';
  if (subject === 'values' || subject === 'mapeh') return 'easy';
  return 'core';
}

export function titleForLevel(level: number) {
  if (level >= 16) return 'Praxis';
  if (level >= 12) return 'Craft';
  if (level >= 8) return 'Discipline';
  if (level >= 4) return 'Practice';
  return 'Seed';
}

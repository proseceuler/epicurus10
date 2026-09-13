/** XP / level ledger. Event log is source of truth; raw xp cannot be inflated. */

export type XPType =
  | 'habit_complete'
  | 'todo_complete'
  | 'focus_session'
  | 'flashcard_review'
  | 'grade_log'
  | 'class_attend'
  | 'kanban_done'
  | 'note_write'
  | 'finance_save'
  | 'calendar_add'
  | 'streak_bonus';

export type AwardRequest = {
  type: XPType;
  key?: string;
  label?: string;
  minutes?: number;
  date?: string;
  href?: string;
};

export type XPEvent =
  | { type: 'habit_complete'; date: string }
  | { type: 'todo_complete' }
  | { type: 'focus_session'; minutes: number }
  | { type: 'flashcard_review' }
  | { type: 'streak_bonus'; days: number };

export type AwardResult = {
  awarded: boolean;
  reason?: string;
  delta: number;
  xp: number;
  level: number;
  prevLevel: number;
  leveledUp: boolean;
  label: string;
  type: XPType;
};

export type LedgerEntry = {
  type: XPType;
  key: string;
  delta: number;
  date: string;
  at: number;
  label: string;
};

export type XPState = { xp: number; level: number };

const STATE_KEY = 'epicure:xp:v1';
const LEDGER_KEY = 'epicure:xp-ledger:v2';
const RATE_KEY = 'epicure:xp-rate:v1';
export const XP_CHANGED = 'epicure-xp-changed';

const PAYOUT: Record<XPType, number> = {
  habit_complete: 8,
  todo_complete: 12,
  focus_session: 0,
  flashcard_review: 4,
  grade_log: 10,
  class_attend: 4,
  kanban_done: 10,
  note_write: 6,
  finance_save: 8,
  calendar_add: 4,
  streak_bonus: 0,
};

const DAILY_COUNT: Record<XPType, number> = {
  habit_complete: 8,
  todo_complete: 10,
  focus_session: 6,
  flashcard_review: 25,
  grade_log: 8,
  class_attend: 8,
  kanban_done: 8,
  note_write: 4,
  finance_save: 3,
  calendar_add: 6,
  streak_bonus: 1,
};

const DAILY_XP_CAP = 280;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 8;
const MIN_FOCUS_MIN = 15;
const MAX_FOCUS_MIN = 90;

function isBrowser() {
  return typeof window !== 'undefined';
}

export function todayIso(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function levelFromXp(xp: number) {
  const safe = Math.max(0, Math.floor(Number(xp) || 0));
  let level = 1;
  let need = 0;
  while (level < 99) {
    need += Math.round(80 * Math.pow(level, 1.35));
    if (safe < need) break;
    level += 1;
  }
  const prevNeed = need - Math.round(80 * Math.pow(Math.max(1, level - 1), 1.35));
  const into = Math.max(0, safe - prevNeed);
  const span = Math.max(1, need - prevNeed);
  return { level, into, span, progress: Math.min(1, into / span) };
}

function readLedger(): LedgerEntry[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(LEDGER_KEY);
    const list = raw ? (JSON.parse(raw) as LedgerEntry[]) : [];
    if (!Array.isArray(list)) return [];
    return list.filter((e) => e && typeof e.key === 'string' && typeof e.delta === 'number' && e.delta > 0 && e.delta <= 50);
  } catch {
    return [];
  }
}

function writeLedger(list: LedgerEntry[]) {
  if (!isBrowser()) return;
  const trimmed = list.slice(-400);
  localStorage.setItem(LEDGER_KEY, JSON.stringify(trimmed));
  const xp = trimmed.reduce((s, e) => s + e.delta, 0);
  const { level } = levelFromXp(xp);
  localStorage.setItem(STATE_KEY, JSON.stringify({ xp, level }));
  window.dispatchEvent(new CustomEvent(XP_CHANGED, { detail: { xp, level } }));
}

export function getXP(): XPState {
  const xp = readLedger().reduce((s, e) => s + e.delta, 0);
  const { level } = levelFromXp(xp);
  return { xp, level };
}

export function xpForNextLevel(state = getXP()) {
  return levelFromXp(state.xp);
}

export function recentAwards(limit = 5): LedgerEntry[] {
  return readLedger().slice(-limit).reverse();
}

function rateOk(now: number) {
  if (!isBrowser()) return false;
  try {
    const stamps = (JSON.parse(localStorage.getItem(RATE_KEY) || '[]') as number[]).filter((t) => now - t < RATE_WINDOW_MS);
    if (stamps.length >= RATE_MAX) return false;
    stamps.push(now);
    localStorage.setItem(RATE_KEY, JSON.stringify(stamps));
    return true;
  } catch {
    return true;
  }
}

function payoutFor(type: XPType, minutes?: number): number {
  if (type === 'focus_session') {
    const mins = Math.min(MAX_FOCUS_MIN, Math.max(0, Math.round(Number(minutes) || 0)));
    if (mins < MIN_FOCUS_MIN) return 0;
    return Math.min(40, Math.round(mins / 5) * 3);
  }
  if (type === 'streak_bonus') {
    const days = Math.min(60, Math.max(0, Math.round(Number(minutes) || 0)));
    return Math.min(50, days * 3);
  }
  return PAYOUT[type] || 0;
}

export function awardXP(req: AwardRequest | XPEvent): AwardResult {
  const type = req.type as XPType;
  const extra = req as AwardRequest & { minutes?: number; days?: number };
  const cur = getXP();
  const blank: AwardResult = {
    awarded: false,
    delta: 0,
    xp: cur.xp,
    level: cur.level,
    prevLevel: cur.level,
    leveledUp: false,
    label: extra.label || type,
    type,
  };

  if (!isBrowser()) return { ...blank, reason: 'ssr' };
  let key = String(extra.key || '').trim().slice(0, 120);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(extra.date || '') ? extra.date! : todayIso();
  if (!key) {
    const n = readLedger().filter((e) => e.date === date && e.type === type).length;
    key = `legacy:${type}:${date}:${n}`;
  }
  if (date > todayIso()) return { ...blank, reason: 'future' };

  const ledger = readLedger();
  if (ledger.some((e) => e.key === key)) return { ...blank, reason: 'duplicate' };

  const minutes = extra.minutes ?? extra.days;
  const delta = payoutFor(type, minutes);
  if (delta <= 0) return { ...blank, reason: 'no-payout' };

  const today = todayIso();
  const todayRows = ledger.filter((e) => e.date === today);
  if (todayRows.filter((e) => e.type === type).length >= DAILY_COUNT[type]) {
    return { ...blank, reason: 'daily-count' };
  }
  const todayXp = todayRows.reduce((s, e) => s + e.delta, 0);
  if (todayXp + delta > DAILY_XP_CAP) return { ...blank, reason: 'daily-cap' };
  if (!rateOk(Date.now())) return { ...blank, reason: 'rate' };

  const entry: LedgerEntry = {
    type,
    key,
    delta,
    date,
    at: Date.now(),
    label: (extra.label || type).slice(0, 80),
  };
  writeLedger([...ledger, entry]);
  const next = getXP();
  return {
    awarded: true,
    delta,
    xp: next.xp,
    level: next.level,
    prevLevel: cur.level,
    leveledUp: next.level > cur.level,
    label: entry.label,
    type,
  };
}

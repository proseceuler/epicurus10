/** Lightweight XP / level system (local). */

export type XPEvent =
  | { type: 'habit_complete'; date: string }
  | { type: 'todo_complete' }
  | { type: 'focus_session'; minutes: number }
  | { type: 'flashcard_review' }
  | { type: 'streak_bonus'; days: number };

const KEY = 'epicure:xp:v1';
const LOG_KEY = 'epicure:xp-log:v1';

export type XPState = {
  xp: number;
  level: number;
};

function isBrowser() {
  return typeof window !== 'undefined';
}

export function levelFromXp(xp: number) {
  // Level N requires ~100 * N^1.4 total XP
  let level = 1;
  let need = 0;
  while (level < 99) {
    need += Math.round(80 * Math.pow(level, 1.35));
    if (xp < need) break;
    level += 1;
  }
  const prevNeed = need - Math.round(80 * Math.pow(Math.max(1, level - 1), 1.35));
  const into = xp - prevNeed;
  const span = Math.max(1, need - prevNeed);
  return { level, into, span, progress: Math.min(1, into / span) };
}

export function getXP(): XPState {
  if (!isBrowser()) return { xp: 0, level: 1 };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as XPState;
      const { level } = levelFromXp(p.xp || 0);
      return { xp: p.xp || 0, level };
    }
  } catch {
    /* ignore */
  }
  return { xp: 0, level: 1 };
}

function persist(state: XPState) {
  if (!isBrowser()) return;
  localStorage.setItem(KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent('epicure-xp-changed'));
}

export function awardXP(event: XPEvent): XPState {
  const cur = getXP();
  let delta = 0;
  if (event.type === 'habit_complete') delta = 8;
  else if (event.type === 'todo_complete') delta = 12;
  else if (event.type === 'focus_session') delta = Math.min(40, Math.round(event.minutes / 5) * 3);
  else if (event.type === 'flashcard_review') delta = 4;
  else if (event.type === 'streak_bonus') delta = Math.min(50, event.days * 3);

  // de-dupe habit complete per day lightly
  if (event.type === 'habit_complete' && isBrowser()) {
    try {
      const log = JSON.parse(localStorage.getItem(LOG_KEY) || '{}') as Record<string, number>;
      const key = `habit:${event.date}`;
      if ((log[key] || 0) >= 20) return cur; // cap daily habit XP awards
      log[key] = (log[key] || 0) + 1;
      localStorage.setItem(LOG_KEY, JSON.stringify(log));
    } catch {
      /* ignore */
    }
  }

  const xp = cur.xp + delta;
  const { level } = levelFromXp(xp);
  const next = { xp, level };
  persist(next);
  return next;
}

export function xpForNextLevel(state = getXP()) {
  return levelFromXp(state.xp);
}

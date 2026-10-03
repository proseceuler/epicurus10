/** User prefs that sit above OS defaults. */

const REDUCE_MOTION_KEY = 'epicure-reduce-motion';

export type ReduceMotionPref = 'system' | 'on' | 'off';

export function getReduceMotionPref(): ReduceMotionPref {
  if (typeof window === 'undefined') return 'system';
  try {
    const v = localStorage.getItem(REDUCE_MOTION_KEY);
    if (v === 'on' || v === 'off') return v;
  } catch { /* */ }
  return 'system';
}

export function setReduceMotionPref(pref: ReduceMotionPref) {
  if (typeof window === 'undefined') return;
  try {
    if (pref === 'system') localStorage.removeItem(REDUCE_MOTION_KEY);
    else localStorage.setItem(REDUCE_MOTION_KEY, pref);
  } catch { /* */ }
  applyReduceMotionPref(pref);
  window.dispatchEvent(new CustomEvent('epicure-prefs-changed', { detail: { reduceMotion: pref } }));
}

/** Effective reduce-motion after combining OS + user override. */
export function effectiveReduceMotion(pref = getReduceMotionPref()): boolean {
  if (pref === 'on') return true;
  if (pref === 'off') return false;
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function applyReduceMotionPref(pref = getReduceMotionPref()) {
  if (typeof document === 'undefined') return;
  const on = effectiveReduceMotion(pref);
  document.documentElement.classList.toggle('epic-reduce-motion', on);
  document.documentElement.dataset.reduceMotion = on ? '1' : '0';
}

/** Call once on app boot. */
export function initPrefs() {
  applyReduceMotionPref();
}

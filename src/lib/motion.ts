import type { Transition } from 'motion/react';

export const easeSoft: [number, number, number, number] = [0.4, 0, 0.2, 1];

export const dur = {
  micro: 0.15,
  ui: 0.2,
  sheet: 0.28,
} as const;

export const pageMotion = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
};

export const sheetMotion = {
  initial: { opacity: 0, y: 10, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 8, scale: 0.98 },
};

export const fadeMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export function motionTransition(reduce: boolean | null | undefined, seconds = dur.ui): Transition {
  if (reduce) return { duration: 0 };
  return { duration: seconds, ease: easeSoft };
}

import type { Transition } from 'motion/react';

export const easeSoft: [number, number, number, number] = [0.32, 0.72, 0, 1];

export const dur = {
  micro: 0.2,
  ui: 0.28,
  sheet: 0.36,
} as const;

export const pageMotion = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
};

export const sheetMotion = {
  initial: { opacity: 0, y: 24, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 16, scale: 0.97 },
};

export const fadeMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export const listItemMotion = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

export function motionTransition(reduce: boolean | null | undefined, seconds = dur.ui): Transition {
  if (reduce) return { duration: 0 };
  return { duration: seconds, ease: easeSoft };
}

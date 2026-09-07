/** SuperMemo SM-2 spaced-repetition scheduler */

export type SM2Rating = 'again' | 'hard' | 'good' | 'easy';

export type SM2Card = {
  interval_days: number;
  ease_factor: number;
  review_count: number;
  /** consecutive successful reps; falls back to review_count when absent */
  repetitions?: number;
};

export type SM2Result = {
  interval_days: number;
  ease_factor: number;
  review_count: number;
  repetitions: number;
  due_date: string;
};

const QUALITY: Record<SM2Rating, number> = {
  again: 1,
  hard: 2,
  good: 3,
  easy: 5,
};

function isoPlusDays(days: number) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + Math.max(0, Math.round(days)));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Classic SM-2. Maps Again/Hard/Good/Easy → quality 1/2/3/5.
 * Cards rated < 3 reset the repetition streak and schedule a near-term review.
 */
export function scheduleSM2(card: SM2Card, rating: SM2Rating): SM2Result {
  const q = QUALITY[rating];
  let ef = card.ease_factor || 2.5;
  let reps = card.repetitions ?? Math.max(0, card.review_count || 0);
  let interval = Math.max(0, card.interval_days || 0);

  ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (ef < 1.3) ef = 1.3;

  if (q < 3) {
    reps = 0;
    interval = rating === 'again' ? 0 : 1;
  } else {
    if (reps === 0) interval = 1;
    else if (reps === 1) interval = 6;
    else interval = Math.round(interval * ef);
    if (rating === 'easy') interval = Math.max(interval, Math.round(interval * 1.15));
    if (rating === 'hard') interval = Math.max(1, Math.round(interval * 0.85));
    reps += 1;
  }

  return {
    interval_days: Math.max(0, interval),
    ease_factor: Math.round(ef * 100) / 100,
    review_count: (card.review_count || 0) + 1,
    repetitions: reps,
    due_date: isoPlusDays(interval),
  };
}

export function isDue(dueDate: string | null | undefined, today = new Date()) {
  if (!dueDate) return true;
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  const d = new Date(dueDate + 'T00:00:00');
  return d.getTime() <= t.getTime();
}

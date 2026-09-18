/** Single write path: XP + rings + inbox. Pages and assistant both call this. */

import { awardXP, todayIso, type AwardRequest, type AwardResult, type XPType } from '@/lib/xp';
import { closeRing, getLoop, ringForType, type RingId } from '@/lib/loop';
import { claimVigilIfReady, titleForLevel } from '@/lib/praxis';
import { pushInbox, type InboxKind } from '@/lib/inbox';

const FLOOR_TYPES: XPType[] = ['habit_complete', 'todo_complete', 'flashcard_review', 'kanban_done', 'class_attend'];

export type ProgressInput = AwardRequest & {
  inboxTitle?: string;
  inboxBody?: string;
  kind?: InboxKind;
};

export function recordProgress(input: ProgressInput): AwardResult {
  const result = awardXP(input);
  if (!result.awarded) return result;

  const rings: RingId[] = [];
  const primary = ringForType(input.type);
  if (primary) rings.push(primary);
  if (input.type === 'class_attend' && !rings.includes('floor')) rings.push('floor');
  if (FLOOR_TYPES.includes(input.type) && !rings.includes('floor')) rings.push('floor');

  let dayComplete = false;
  for (const ring of rings) {
    const closed = closeRing(ring, input.date || todayIso());
    if (closed.first) {
      const label = ring === 'floor' ? 'Floor closed' : ring === 'focus' ? 'Focus closed' : 'School closed';
      pushInbox({
        kind: 'loop',
        title: label,
        body: "One of today's three rings is filled.",
        href: 'dashboard',
        priority: 'low',
      });
    }
    if (closed.dayComplete) dayComplete = true;
  }
  if (dayComplete) {
    pushInbox({
      kind: 'loop',
      title: 'Day complete',
      body: 'Floor, focus, and school are closed.',
      href: 'dashboard',
      priority: 'normal',
    });
  }

  pushInbox({
    kind: input.kind || 'xp',
    title: input.inboxTitle || `+${result.delta} ${input.label || input.type}`,
    body: input.inboxBody || `${result.delta} XP \u00b7 ${input.type.replace(/_/g, ' ')}`,
    href: input.href,
    priority: 'low',
  });

  if (result.leveledUp) {
    pushInbox({
      kind: 'xp',
      title: `Level ${result.level} · ${titleForLevel(result.level)}`,
      body: 'Quiet mark. The bar moved.',
      href: 'dashboard',
      priority: 'low',
    });
  }

  const loop = getLoop();
  if (claimVigilIfReady(loop)) {
    awardXP({ type: 'streak_bonus', key: `vigil:${new Date().toISOString().slice(0, 10)}`, minutes: 8, label: 'Vigil' });
  }

  return result;
}

export { titleForLevel } from '@/lib/praxis';

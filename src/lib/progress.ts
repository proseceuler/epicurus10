/** Single write path: XP + rings + inbox. Pages and assistant both call this. */

import { awardXP, todayIso, type AwardRequest, type AwardResult, type XPType } from '@/lib/xp';
import { closeRing, getLoop, ringForType, type RingId } from '@/lib/loop';
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
      title: `Level ${result.level}`,
      body: `You reached level ${result.level}. Still measured.`,
      href: 'dashboard',
      priority: 'normal',
    });
  }

  const loop = getLoop();
  if (loop.streak > 0 && loop.streak % 7 === 0) {
    pushInbox({
      kind: 'streak',
      title: `${loop.streak}-day streak`,
      body: loop.freezeReady ? 'Freeze is ready this week.' : 'Keep the floor ring closed tomorrow.',
      href: 'habits',
      priority: 'normal',
    });
  }

  return result;
}

export function titleForLevel(level: number) {
  if (level >= 12) return 'Unhurried';
  if (level >= 8) return 'Exact';
  if (level >= 4) return 'Consistent';
  return 'Attendant';
}

/** Soft grey edge aura around the app shell (behind UI). */
export function triggerEpicAccent() {
  if (typeof window === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const frame =
    document.getElementById('epic-body-frame') ??
    document.querySelector<HTMLElement>('.epic-body-frame');
  if (!frame) return;

  frame.classList.remove('epic-accent-burst', 'epic-level-up');
  void frame.offsetWidth; // reflow so rapid triggers replay
  frame.classList.add('epic-accent-burst');

  const onEnd = () => {
    frame.classList.remove('epic-accent-burst');
    frame.removeEventListener('animationend', onEnd);
  };
  frame.addEventListener('animationend', onEnd);
}

/** Stronger full-body dither + grain when the user levels up. */
export function triggerEpicLevelUp() {
  if (typeof window === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const frame =
    document.getElementById('epic-body-frame') ??
    document.querySelector<HTMLElement>('.epic-body-frame');
  if (!frame) return;

  frame.classList.remove('epic-accent-burst', 'epic-level-up');
  void frame.offsetWidth;
  frame.classList.add('epic-level-up');

  const onEnd = () => {
    frame.classList.remove('epic-level-up');
    frame.removeEventListener('animationend', onEnd);
  };
  frame.addEventListener('animationend', onEnd);
}

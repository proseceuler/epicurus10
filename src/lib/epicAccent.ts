/** Trigger a grey outward accent burst on completion-style controls. */
export function triggerEpicAccent(el: HTMLElement | null | undefined) {
  if (!el) return;
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }
  el.classList.remove('epic-accent-burst');
  // Force reflow so the animation retriggers on rapid clicks
  void el.offsetWidth;
  el.classList.add('epic-accent-burst');
  const onEnd = (e: AnimationEvent) => {
    if (e.target !== el.querySelector('.epic-accent-ring') && e.animationName !== 'epicAccentBurst' && e.animationName !== 'epicAccentBurstSm') {
      // still clear host class on any accent animation end on this host
    }
    el.classList.remove('epic-accent-burst');
    el.removeEventListener('animationend', onEnd);
  };
  el.addEventListener('animationend', onEnd);
}

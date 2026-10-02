/** Soft grey edge aura around the app shell (behind UI). */
export function triggerEpicAccent() {
  if (typeof window === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const frame =
    document.getElementById('epic-body-frame') ??
    document.querySelector<HTMLElement>('.epic-body-frame');
  if (!frame) return;

  frame.classList.remove('epic-accent-burst');
  void frame.offsetWidth; // reflow so rapid triggers replay
  frame.classList.add('epic-accent-burst');

  const onEnd = () => {
    frame.classList.remove('epic-accent-burst');
    frame.removeEventListener('animationend', onEnd);
  };
  frame.addEventListener('animationend', onEnd);
}

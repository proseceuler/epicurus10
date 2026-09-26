import { speechRecognitionCtor } from '@/lib/assistant/voice';

/** Phrases that open the Arrodes sidebar. */
const WAKE =
  /\b((hey|hi|hello|ok|okay)\s+)?arrodes\b|\barrodes\s*(\?|please)?\b/i;

export function isWakePhrase(text: string): boolean {
  return WAKE.test(text.trim());
}

/**
 * Always-on mic listener for "hey Arrodes" / "Arrodes?".
 * Calls onWake once per detection, then cools down briefly.
 * Returns a stop function.
 */
export function startWakeListener(onWake: () => void): () => void {
  const Ctor = speechRecognitionCtor();
  if (!Ctor) return () => {};

  const rec = new Ctor();
  rec.lang = 'en-US';
  rec.continuous = true;
  rec.interimResults = true;

  let alive = true;
  let coolUntil = 0;

  const restart = () => {
    if (!alive) return;
    try {
      rec.start();
    } catch {
      /* already started */
    }
  };

  rec.onresult = (ev: {
    resultIndex: number;
    results: ArrayLike<{ isFinal?: boolean; 0: { transcript: string } }>;
  }) => {
    if (Date.now() < coolUntil) return;
    let chunk = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      chunk += ev.results[i][0]?.transcript || '';
    }
    if (!isWakePhrase(chunk)) return;
    coolUntil = Date.now() + 2500;
    onWake();
  };

  rec.onend = () => {
    if (alive) window.setTimeout(restart, 180);
  };

  rec.onerror = () => {
    /* permission denied etc. — silent */
  };

  restart();

  return () => {
    alive = false;
    try {
      rec.abort();
    } catch {
      /* */
    }
  };
}

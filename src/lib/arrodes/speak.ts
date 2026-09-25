/** Minimal TTS: browser speechSynthesis. Fast, no network. */

let current: SpeechSynthesisUtterance | null = null;

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const prefer = [/google.*english/i, /samantha/i, /daniel/i, /en-us/i, /en-gb/i];
  for (const re of prefer) {
    const v = voices.find((x) => re.test(x.name) || re.test(x.lang));
    if (v) return v;
  }
  return voices.find((v) => v.lang.startsWith('en')) || voices[0] || null;
}

export function stopSpeak() {
  try {
    window.speechSynthesis.cancel();
  } catch { /* */ }
  current = null;
}

export function speak(
  text: string,
  hooks?: { onStart?: () => void; onEnd?: () => void },
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve) => {
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, 500);
    if (!clean || typeof window === 'undefined' || !window.speechSynthesis) {
      hooks?.onEnd?.();
      resolve();
      return;
    }

    stopSpeak();
    const u = new SpeechSynthesisUtterance(clean);
    current = u;
    u.rate = 1.05;
    u.pitch = 1;
    const voice = pickVoice();
    if (voice) u.voice = voice;

    const done = () => {
      if (current === u) current = null;
      hooks?.onEnd?.();
      resolve();
    };

    u.onstart = () => hooks?.onStart?.();
    u.onend = done;
    u.onerror = done;

    if (signal) {
      if (signal.aborted) {
        done();
        return;
      }
      signal.addEventListener('abort', () => {
        stopSpeak();
        done();
      }, { once: true });
    }

    // Chrome sometimes needs voices loaded first
    const go = () => window.speechSynthesis.speak(u);
    if (window.speechSynthesis.getVoices().length) go();
    else {
      window.speechSynthesis.onvoiceschanged = () => {
        const v = pickVoice();
        if (v) u.voice = v;
        go();
      };
      // fallback if event never fires
      setTimeout(go, 120);
    }
  });
}

/** Split on sentence boundaries for early speak. */
export function takeSentences(buffer: string): { ready: string[]; rest: string } {
  const ready: string[] = [];
  let rest = buffer;
  const re = /([^.!?]+[.!?]+)(?:\s+|$)/g;
  let m: RegExpExecArray | null;
  let last = 0;
  while ((m = re.exec(buffer)) !== null) {
    const s = m[1].trim();
    if (s.length >= 4) {
      ready.push(s);
      last = m.index + m[0].length;
    }
  }
  rest = buffer.slice(last);
  return { ready, rest };
}

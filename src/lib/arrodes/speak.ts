/** Minimal TTS: browser speechSynthesis. Fast, no network. */

let current: SpeechSynthesisUtterance | null = null;

/** Strip markdown / symbols so TTS does not say "asterisk", "hash", etc. */
export function stripMarkdownForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\*+/g, ' ')
    .replace(/_+/g, ' ')
    .replace(/~+/g, ' ')
    .replace(/`+/g, ' ')
    .replace(/#+/g, ' ')
    .replace(/\|+/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

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
    const clean = stripMarkdownForSpeech(text).slice(0, 500);
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

    const go = () => window.speechSynthesis.speak(u);
    if (window.speechSynthesis.getVoices().length) go();
    else {
      window.speechSynthesis.onvoiceschanged = () => {
        const v = pickVoice();
        if (v) u.voice = v;
        go();
      };
      setTimeout(go, 120);
    }
  });
}

/** Split on sentence boundaries for early speak. */
export function takeSentences(buffer: string): { ready: string[]; rest: string } {
  const ready: string[] = [];
  const re = /([^.!?]+[.!?]+)(?:\s+|$)/g;
  let m: RegExpExecArray | null;
  let last = 0;
  while ((m = re.exec(buffer)) !== null) {
    const s = stripMarkdownForSpeech(m[1]);
    if (s.length >= 4) {
      ready.push(s);
      last = m.index + m[0].length;
    }
  }
  const rest = buffer.slice(last);
  return { ready, rest };
}

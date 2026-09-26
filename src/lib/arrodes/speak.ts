/** Browser TTS with British-male preference and measured prosody (phase 3). */

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

/** Prefer a smart British (older) male voice when the OS/browser provides one. */
export function pickBritishMaleVoice(): SpeechSynthesisVoice | null {
  const voices = typeof window !== 'undefined' ? window.speechSynthesis?.getVoices?.() || [] : [];
  if (!voices.length) return null;

  const score = (v: SpeechSynthesisVoice): number => {
    const n = `${v.name} ${v.lang}`;
    let s = 0;
    if (/en-GB|en_GB|British|UK English/i.test(n)) s += 40;
    else if (/en-AU|en-IE|en-ZA/i.test(n)) s += 15;
    else if (/^en/i.test(v.lang)) s += 5;
    if (/male|daniel|george|arthur|thomas|oliver|james|brian|albert|fred|rishi/i.test(n)) s += 35;
    if (/google uk english male/i.test(n)) s += 50;
    if (/microsoft (george|ryan|thomas)/i.test(n)) s += 30;
    if (/female|samantha|karen|moira|tessa|fiona|victoria|zira/i.test(n)) s -= 40;
    if (/novelty|whisper|zarvox|bad news|good news|pipes|trinoids/i.test(n)) s -= 80;
    return s;
  };

  const ranked = [...voices].sort((a, b) => score(b) - score(a));
  return ranked[0] && score(ranked[0]) > 0 ? ranked[0] : voices.find((v) => v.lang.startsWith('en')) || voices[0] || null;
}

/** Prosody tuned for a composed older British gentleman (phase 3 only). */
export const ARRODES_PROSODY = {
  /** Slightly unhurried — not sluggish. */
  rate: 0.92,
  /** A touch lower for gravitas. */
  pitch: 0.88,
  volume: 1,
  /** Gap between clause chunks (ms). */
  clausePauseMs: 140,
  /** Gap after sentence end (ms). */
  sentencePauseMs: 280,
} as const;

/** Split into speakable clauses so we can insert natural pauses. */
export function prosodyChunks(text: string): string[] {
  const clean = stripMarkdownForSpeech(text);
  if (!clean) return [];
  const parts = clean
    .split(/(?<=[.!?;:—–])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return parts.length ? parts.slice(0, 12) : [clean];
}

export function stopSpeak() {
  try {
    window.speechSynthesis.cancel();
  } catch { /* */ }
  current = null;
}

function speakOne(
  text: string,
  voice: SpeechSynthesisVoice | null,
  hooks?: { onStart?: () => void },
): Promise<void> {
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    current = u;
    u.rate = ARRODES_PROSODY.rate;
    u.pitch = ARRODES_PROSODY.pitch;
    u.volume = ARRODES_PROSODY.volume;
    u.lang = voice?.lang || 'en-GB';
    if (voice) u.voice = voice;
    u.onstart = () => hooks?.onStart?.();
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
}

function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const t = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });
}

export function speak(
  text: string,
  hooks?: { onStart?: () => void; onEnd?: () => void },
  signal?: AbortSignal,
): Promise<void> {
  return (async () => {
    const chunks = prosodyChunks(text);
    if (!chunks.length || typeof window === 'undefined' || !window.speechSynthesis) {
      hooks?.onEnd?.();
      return;
    }

    stopSpeak();

    let voice = pickBritishMaleVoice();
    if (!voice && !window.speechSynthesis.getVoices().length) {
      await new Promise<void>((r) => {
        const done = () => r();
        window.speechSynthesis.onvoiceschanged = done;
        setTimeout(done, 200);
      });
      voice = pickBritishMaleVoice();
    }

    let started = false;
    try {
      for (let i = 0; i < chunks.length; i++) {
        if (signal?.aborted) break;
        const piece = chunks[i];
        await speakOne(piece, voice, {
          onStart: () => {
            if (!started) {
              started = true;
              hooks?.onStart?.();
            }
          },
        });
        if (signal?.aborted || i >= chunks.length - 1) break;
        const endPunct = /[.!?]$/.test(piece);
        await pause(
          endPunct ? ARRODES_PROSODY.sentencePauseMs : ARRODES_PROSODY.clausePauseMs,
          signal,
        );
      }
    } finally {
      current = null;
      hooks?.onEnd?.();
    }
  })();
}

/** Split on sentence boundaries for early speak (already prosody-cleaned). */
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
  return { ready, rest: buffer.slice(last) };
}

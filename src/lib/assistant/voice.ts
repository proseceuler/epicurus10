/** Browser STT (SpeechRecognition) + TTS helpers used by Arrodes voice. */

type SpeechRecognitionCtor = new () => {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

export function speechRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export type RecognizerHooks = {
  onFinal?: (text: string) => void;
  onInterim?: (text: string) => void;
  onEnd?: () => void;
  onError?: (msg: string) => void;
};

/** Continuous recognizer with resultIndex debouncing (no transcript snowball). */
export function createRecognizer(hooks: RecognizerHooks) {
  const Ctor = speechRecognitionCtor();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = 'en-US';
  rec.continuous = true;
  rec.interimResults = true;
  let lastFinalIndex = 0;

  rec.onresult = (ev: unknown) => {
    const e = ev as {
      resultIndex: number;
      results: ArrayLike<{ isFinal?: boolean; 0: { transcript: string } }>;
    };
    let newFinal = '';
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const row = e.results[i];
      const text = (row[0]?.transcript || '').trim();
      if (!text) continue;
      if ((row as { isFinal?: boolean }).isFinal) newFinal += (newFinal ? ' ' : '') + text;
      else interim += (interim ? ' ' : '') + text;
    }
    if (newFinal) {
      lastFinalIndex = e.resultIndex;
      hooks.onFinal?.(newFinal.trim());
    }
    if (interim) hooks.onInterim?.(interim.trim());
  };

  rec.onerror = (ev: unknown) => {
    const err = (ev as { error?: string })?.error || 'speech error';
    if (err === 'aborted' || err === 'no-speech') return;
    hooks.onError?.(err);
  };

  rec.onend = () => hooks.onEnd?.();

  return {
    start: () => {
      try {
        rec.start();
      } catch {
        /* already started */
      }
    },
    stop: () => {
      try {
        rec.stop();
      } catch {
        /* */
      }
    },
    abort: () => {
      try {
        rec.abort();
      } catch {
        /* */
      }
    },
  };
}

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  if (!voices.length) return null;
  const prefer = [/google.*english/i, /samantha/i, /daniel/i, /en-us/i, /en-gb/i];
  for (const re of prefer) {
    const v = voices.find((x) => re.test(x.name) || re.test(x.lang));
    if (v) return v;
  }
  return voices.find((v) => v.lang.startsWith('en')) || voices[0] || null;
}

export function splitSpokenChunks(text: string): string[] {
  const clean = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/[*_~`#|>]+/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return [];
  const parts = clean
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : [clean];
}

export function speakText(text: string, hooks?: { onStart?: () => void; onEnd?: () => void }) {
  if (!window.speechSynthesis) {
    hooks?.onEnd?.();
    return;
  }
  window.speechSynthesis.cancel();
  const chunks = splitSpokenChunks(text).slice(0, 8);
  if (!chunks.length) {
    hooks?.onEnd?.();
    return;
  }
  const voice = pickVoice();
  let i = 0;
  let started = false;
  const next = () => {
    if (i >= chunks.length) {
      hooks?.onEnd?.();
      return;
    }
    const u = new SpeechSynthesisUtterance(chunks[i++]);
    if (voice) u.voice = voice;
    u.rate = 1.05;
    u.onstart = () => {
      if (!started) {
        started = true;
        hooks?.onStart?.();
      }
    };
    u.onend = next;
    u.onerror = next;
    window.speechSynthesis.speak(u);
  };
  if (window.speechSynthesis.getVoices().length) next();
  else {
    window.speechSynthesis.onvoiceschanged = () => next();
    setTimeout(next, 120);
  }
}

export function stopSpeech() {
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* */
  }
}

/** Browser STT (SpeechRecognition) + TTS helpers used by Arrodes voice. */

import {
  pickBritishMaleVoice,
  ARRODES_PROSODY,
  stripMarkdownForSpeech,
  prosodyChunks,
} from '@/lib/arrodes/speak';

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
    if (newFinal) hooks.onFinal?.(newFinal.trim());
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

export function splitSpokenChunks(text: string): string[] {
  return prosodyChunks(text);
}

export function speakText(text: string, hooks?: { onStart?: () => void; onEnd?: () => void }) {
  if (!window.speechSynthesis) {
    hooks?.onEnd?.();
    return;
  }
  window.speechSynthesis.cancel();
  const chunks = prosodyChunks(text).slice(0, 12);
  if (!chunks.length) {
    hooks?.onEnd?.();
    return;
  }
  const voice = pickBritishMaleVoice();
  let i = 0;
  let started = false;
  const next = () => {
    if (i >= chunks.length) {
      hooks?.onEnd?.();
      return;
    }
    const piece = chunks[i++];
    const u = new SpeechSynthesisUtterance(piece);
    if (voice) u.voice = voice;
    u.lang = voice?.lang || 'en-GB';
    u.rate = ARRODES_PROSODY.rate;
    u.pitch = ARRODES_PROSODY.pitch;
    u.volume = ARRODES_PROSODY.volume;
    u.onstart = () => {
      if (!started) {
        started = true;
        hooks?.onStart?.();
      }
    };
    u.onend = () => {
      const endPunct = /[.!?]$/.test(piece);
      const gap = endPunct ? ARRODES_PROSODY.sentencePauseMs : ARRODES_PROSODY.clausePauseMs;
      if (i >= chunks.length) {
        hooks?.onEnd?.();
        return;
      }
      window.setTimeout(next, gap);
    };
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

export { stripMarkdownForSpeech, pickBritishMaleVoice, ARRODES_PROSODY };

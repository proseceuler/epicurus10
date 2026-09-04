type SRCtor = new () => SpeechRecognitionLike;
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onresult: ((ev: { results: ArrayLike<{ isFinal?: boolean; 0: { transcript: string } }> }) => void) | null;
}

export function speechRecognitionCtor(): SRCtor | null {
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function createRecognizer(opts: {
  continuous?: boolean;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (msg: string) => void;
  onFinal?: (text: string) => void;
  onInterim?: (text: string) => void;
}) {
  const Ctor = speechRecognitionCtor();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = 'en-US';
  rec.continuous = Boolean(opts.continuous);
  rec.interimResults = true;
  rec.onstart = () => opts.onStart?.();
  rec.onend = () => opts.onEnd?.();
  rec.onerror = (ev) => {
    const err = ev.error || 'mic';
    if (err === 'aborted' || err === 'no-speech') return;
    opts.onError?.(err === 'not-allowed' ? 'Microphone was blocked. You can keep typing instead.' : 'Voice input failed.');
  };
  rec.onresult = (ev) => {
    let interim = '';
    let finals = '';
    for (let i = 0; i < ev.results.length; i++) {
      const row = ev.results[i];
      const text = row[0]?.transcript || '';
      if ((row as { isFinal?: boolean }).isFinal) finals += text;
      else interim += text;
    }
    if (finals.trim()) opts.onFinal?.(finals.trim());
    else if (interim.trim()) opts.onInterim?.(interim.trim());
  };
  return rec;
}

function pickVoice(preferred = ['Google UK English Male']) {
  const voices = window.speechSynthesis.getVoices();
  for (const name of preferred) {
    const match = voices.find((v) => v.name.includes(name));
    if (match) return match;
  }
  return (
    voices.find((v) => v.lang.startsWith('en') && /male/i.test(v.name)) ||
    voices.find((v) => v.lang.startsWith('en')) ||
    voices[0] ||
    null
  );
}

export function speakText(text: string, hooks?: { onStart?: () => void; onEnd?: () => void }) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const clean = text.replace(/[#*_`>~]/g, ' ').replace(/https?:\/\/\S+/g, ' ').trim().slice(0, 800);
  if (!clean) { hooks?.onEnd?.(); return; }
  const u = new SpeechSynthesisUtterance(clean);
  u.rate = 0.92;           // slowed down, calmer pacing
  u.pitch = 0.9;           // slightly lower, more reserved tone
  u.voice = pickVoice();   // calm/reserved male voice, falls back gracefully
  u.onstart = () => hooks?.onStart?.();
  u.onend = () => hooks?.onEnd?.();
  window.speechSynthesis.speak(u);
}

export function stopSpeech() {
  try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
}

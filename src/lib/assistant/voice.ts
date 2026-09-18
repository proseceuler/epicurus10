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

function pickVoice() {
  const voices = window.speechSynthesis.getVoices();
  const prefer = [
    'Google UK English Male',
    'Google US English',
    'Samantha',
    'Daniel',
    'Alex',
    'Microsoft David',
  ];
  for (const name of prefer) {
    const match = voices.find((v) => v.name.includes(name));
    if (match) return match;
  }
  return (
    voices.find((v) => v.lang.startsWith('en') && /male|daniel|alex|david/i.test(v.name)) ||
    voices.find((v) => v.lang.startsWith('en')) ||
    voices[0] ||
    null
  );
}

export function splitSpokenChunks(text: string): string[] {
  const clean = text
    .replace(/[#*_`>~]/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return [];
  const parts = clean.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : [clean];
}

export function speakText(text: string, hooks?: { onStart?: () => void; onEnd?: () => void }) {
  if (!window.speechSynthesis) { hooks?.onEnd?.(); return; }
  window.speechSynthesis.cancel();
  const chunks = splitSpokenChunks(text).slice(0, 8);
  if (!chunks.length) { hooks?.onEnd?.(); return; }
  const voice = pickVoice();
  let i = 0;
  let started = false;
  const next = () => {
    if (i >= chunks.length) { hooks?.onEnd?.(); return; }
    const u = new SpeechSynthesisUtterance(chunks[i]);
    const wave = (i % 3) - 1;
    u.rate = 1.02 + wave * 0.04;
    u.pitch = 0.96 + wave * 0.05;
    u.voice = voice;
    if (i === 0) {
      u.onstart = () => {
        started = true;
        hooks?.onStart?.();
      };
    }
    u.onend = () => {
      i += 1;
      if (i < chunks.length) window.setTimeout(next, 90 + (i % 2) * 70);
      else hooks?.onEnd?.();
    };
    u.onerror = () => hooks?.onEnd?.();
    window.speechSynthesis.speak(u);
  };
  next();
  window.setTimeout(() => { if (!started) hooks?.onStart?.(); }, 80);
}

export function stopSpeech() {
  try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
}

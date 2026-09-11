import { getFishKey, getGroqKey } from '@/lib/apiKeys';
import { speakText as speakBrowser, stopSpeech as stopBrowser } from '@/lib/assistant/voice';

export function groqConfigured() {
  return Boolean(getGroqKey());
}

function rmsFromTimeDomain(buf: Uint8Array) {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / buf.length);
}

export async function transcribeAudio(blob: Blob): Promise<{ text: string; error?: string }> {
  const key = getGroqKey();
  if (!key) return { text: '', error: 'Add a Groq key in Settings for Whisper.' };
  const file = new File([blob], 'speech.webm', { type: blob.type || 'audio/webm' });
  const body = new FormData();
  body.append('file', file);
  body.append('model', 'whisper-large-v3-turbo');
  body.append('response_format', 'json');
  body.append('language', 'en');
  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return { text: '', error: `Whisper failed (${res.status}) ${detail.slice(0, 160)}` };
  }
  const data = await res.json();
  return { text: String(data.text || '').trim() };
}

async function speakFish(text: string): Promise<HTMLAudioElement | null> {
  const key = getFishKey();
  if (!key) return null;
  const res = await fetch('https://api.fish.audio/v1/tts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      model: 's1',
    },
    body: JSON.stringify({ text: text.slice(0, 600), format: 'mp3', latency: 'normal' }),
  });
  if (!res.ok) return null;
  const buf = await res.arrayBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'audio/mpeg' }));
  const audio = new Audio(url);
  audio.onended = () => URL.revokeObjectURL(url);
  return audio;
}

let currentAudio: HTMLAudioElement | null = null;

function waitForSpeechEnd(): Promise<void> {
  return new Promise((resolve) => {
    const started = performance.now();
    const tick = () => {
      if (!window.speechSynthesis?.speaking && !window.speechSynthesis?.pending) {
        resolve();
        return;
      }
      if (performance.now() - started > 30_000) {
        resolve();
        return;
      }
      window.setTimeout(tick, 80);
    };
    tick();
  });
}

export async function speakReply(text: string, hooks?: { onStart?: () => void; onEnd?: () => void }) {
  const clean = text.replace(/[#*_`>~]/g, ' ').replace(/https?:\/\/\S+/g, ' ').trim().slice(0, 600);
  if (!clean) { hooks?.onEnd?.(); return; }
  stopReply();
  try {
    const audio = await speakFish(clean);
    if (audio) {
      currentAudio = audio;
      await new Promise<void>((resolve) => {
        audio.onplay = () => hooks?.onStart?.();
        audio.onended = () => {
          hooks?.onEnd?.();
          currentAudio = null;
          resolve();
        };
        audio.onerror = () => {
          hooks?.onEnd?.();
          currentAudio = null;
          resolve();
        };
        void audio.play().catch(() => {
          hooks?.onEnd?.();
          currentAudio = null;
          resolve();
        });
      });
      return;
    }
  } catch {
    /* fall through */
  }
  hooks?.onStart?.();
  speakBrowser(clean, { onStart: hooks?.onStart, onEnd: hooks?.onEnd });
  await waitForSpeechEnd();
}

export function stopReply() {
  try { currentAudio?.pause(); } catch { /* ignore */ }
  currentAudio = null;
  stopBrowser();
}

export type VoiceStatus = 'idle' | 'listening' | 'transcribing';

export interface VoiceLoop {
  stop: () => void;
}

export function startVoiceLoop(opts: {
  onListening?: (on: boolean) => void;
  onStatus?: (status: VoiceStatus) => void;
  onLevel?: (level: number) => void;
  onCaption?: (text: string) => void;
  onTranscript: (text: string) => void | Promise<void>;
  onError?: (msg: string) => void;
  shouldContinue: () => boolean;
}): VoiceLoop {
  let stopped = false;
  let ctx: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let raf = 0;

  const teardown = () => {
    stopped = true;
    cancelAnimationFrame(raf);
    opts.onListening?.(false);
    opts.onStatus?.('idle');
    try { ctx?.close(); } catch { /* ignore */ }
    stream?.getTracks().forEach((t) => t.stop());
    ctx = null;
    stream = null;
  };

  const waitUntilReady = async () => {
    while (!stopped && opts.shouldContinue() === false) {
      await new Promise((r) => setTimeout(r, 120));
    }
  };

  const listenOnce = async () => {
    await waitUntilReady();
    if (stopped || !opts.shouldContinue()) return;
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);

    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : undefined;
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

    let heard = false;
    let silentMs = 0;
    let last = performance.now();
    rec.start(200);
    opts.onListening?.(true);
    opts.onStatus?.('listening');

    await new Promise<void>((resolve) => {
      const tick = () => {
        if (stopped || !opts.shouldContinue()) {
          try { rec.stop(); } catch { /* ignore */ }
          resolve();
          return;
        }
        analyser.getByteTimeDomainData(samples);
        const level = rmsFromTimeDomain(samples);
        opts.onLevel?.(level);
        const now = performance.now();
        const dt = now - last;
        last = now;
        if (level > 0.045) {
          heard = true;
          silentMs = 0;
        } else if (heard) {
          silentMs += dt;
          if (silentMs > 900) {
            try { rec.stop(); } catch { /* ignore */ }
            resolve();
            return;
          }
        }
        raf = requestAnimationFrame(tick);
      };
      rec.onstop = () => resolve();
      raf = requestAnimationFrame(tick);
    });

    opts.onListening?.(false);
    stream.getTracks().forEach((t) => t.stop());
    try { await ctx.close(); } catch { /* ignore */ }
    ctx = null;
    stream = null;

    if (stopped || !chunks.length) return;
    const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
    if (blob.size < 2000) {
      if (!stopped) void listenOnce();
      return;
    }
    opts.onStatus?.('transcribing');
    opts.onCaption?.('Transcribing…');
    const result = await transcribeAudio(blob);
    if (result.error) opts.onError?.(result.error);
    else if (result.text) {
      opts.onCaption?.(result.text);
      await opts.onTranscript(result.text);
    }
    opts.onStatus?.('idle');
    if (!stopped) void listenOnce();
  };

  void listenOnce().catch((err) => {
    opts.onError?.(err instanceof Error ? err.message : 'Microphone failed.');
    teardown();
  });

  return { stop: teardown };
}

import { getGroqKey } from '@/lib/apiKeys';
import { speakReply, stopReply } from '@/lib/assistant/tts';

export { speakReply, stopReply };

export function groqConfigured() {
  return Boolean(getGroqKey());
}

function isJunkTranscript(text: string) {
  const t = text.trim().toLowerCase().replace(/[.?!,\u2026]/g, '').replace(/\s+/g, ' ');
  if (t.length < 2) return true;
  if (t.includes('english or filipino')) return true;
  if (t.includes('tasks, grades, baon')) return true;
  if (t.includes('canteen, class hub')) return true;
  if (t.includes('student talking to a study assistant')) return true;
  return /^(thanks for watching|thank you for watching|thank you|thanks|you|subtitle[s]?|\[?music\]?|\[?applause\]?|\[?silence\]?)$/.test(t);
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
  const ext = (blob.type || '').includes('mp4') ? 'mp4' : 'webm';
  const file = new File([blob], `speech.${ext}`, { type: blob.type || 'audio/webm' });
  const body = new FormData();
  body.append('file', file);
  // turbo is much faster; fall back path still works if unavailable
  body.append('model', 'whisper-large-v3-turbo');
  body.append('response_format', 'json');
  body.append('temperature', '0');
  body.append('language', 'en');
  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body,
  });
  if (!res.ok) {
    // retry once with full large model
    const body2 = new FormData();
    body2.append('file', file);
    body2.append('model', 'whisper-large-v3');
    body2.append('response_format', 'json');
    body2.append('temperature', '0');
    body2.append('language', 'en');
    const res2 = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: body2,
    });
    if (!res2.ok) {
      const detail = await res2.text().catch(() => '');
      return { text: '', error: `Whisper failed (${res2.status}) ${detail.slice(0, 160)}` };
    }
    const data2 = await res2.json();
    return { text: String(data2.text || '').trim() };
  }
  const data = await res.json();
  return { text: String(data.text || '').trim() };
}

export type VoiceStatus = 'idle' | 'listening' | 'transcribing';

export interface VoiceLoop {
  stop: () => void;
}

/** Silence after speech ends the turn (ms). Lower = snappier turns. */
const SILENCE_END_MS = 850;
/** How long continuous voice before we count the user as speaking. */
const VOICED_CONFIRM_MS = 120;
/** Max listen window without speech. */
const MAX_LISTEN_MS = 18_000;

export function startVoiceLoop(opts: {
  onListening?: (on: boolean) => void;
  onStatus?: (status: VoiceStatus) => void;
  onLevel?: (level: number) => void;
  onCaption?: (text: string) => void;
  onTranscript: (text: string) => void | Promise<void>;
  onError?: (msg: string) => void;
  /** When true, keep the mic open even while the assistant is speaking (barge-in). */
  onBargeIn?: () => void;
  shouldContinue: () => boolean;
  /** Return true while assistant audio is playing so we can detect interruption. */
  isSpeaking?: () => boolean;
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
    try {
      ctx?.close();
    } catch {
      /* ignore */
    }
    stream?.getTracks().forEach((t) => t.stop());
    ctx = null;
    stream = null;
  };

  const waitUntilReady = async () => {
    while (!stopped && opts.shouldContinue() === false) {
      // While speaking, still sample mic for barge-in
      if (opts.isSpeaking?.() && stream && ctx) {
        // handled in barge monitor below; just wait
      }
      await new Promise((r) => setTimeout(r, 80));
    }
  };

  const ensureMic = async () => {
    if (stream && ctx) return;
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    ctx = new AudioContext();
    if (ctx.state === 'suspended') await ctx.resume();
  };

  const listenOnce = async () => {
    await waitUntilReady();
    if (stopped || !opts.shouldContinue()) return;
    await ensureMic();
    if (!stream || !ctx) return;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);

    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : undefined;
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };

    let heard = false;
    let voicedMs = 0;
    let silentMs = 0;
    let last = performance.now();
    const startedAt = last;
    rec.start(200);
    opts.onListening?.(true);
    opts.onStatus?.('listening');

    await new Promise<void>((resolve) => {
      const tick = () => {
        if (stopped || !opts.shouldContinue()) {
          try {
            rec.stop();
          } catch {
            /* ignore */
          }
          resolve();
          return;
        }
        analyser.getByteTimeDomainData(samples);
        const level = rmsFromTimeDomain(samples);
        opts.onLevel?.(level);
        const now = performance.now();
        const dt = now - last;
        last = now;

        // Barge-in: user speaks while assistant is talking
        if (opts.isSpeaking?.() && level > 0.08 && voicedMs > 80) {
          opts.onBargeIn?.();
        }

        const gate = heard ? 0.045 : 0.065;
        if (level > gate) {
          voicedMs += dt;
          silentMs = 0;
          if (voicedMs > VOICED_CONFIRM_MS) heard = true;
        } else if (heard) {
          silentMs += dt;
          if (silentMs > SILENCE_END_MS) {
            try {
              rec.stop();
            } catch {
              /* ignore */
            }
            resolve();
            return;
          }
        } else if (now - startedAt > MAX_LISTEN_MS) {
          try {
            rec.stop();
          } catch {
            /* ignore */
          }
          resolve();
          return;
        }
        raf = requestAnimationFrame(tick);
      };
      rec.onstop = () => resolve();
      raf = requestAnimationFrame(tick);
    });

    opts.onListening?.(false);
    try {
      source.disconnect();
    } catch {
      /* ignore */
    }

    if (stopped || !chunks.length) return;
    const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
    if (blob.size < 4000) {
      if (!stopped) void listenOnce();
      return;
    }
    opts.onStatus?.('transcribing');
    opts.onCaption?.('Transcribing\u2026');
    const result = await transcribeAudio(blob);
    if (result.error) opts.onError?.(result.error);
    else if (result.text && !isJunkTranscript(result.text)) {
      opts.onCaption?.(result.text);
      await opts.onTranscript(result.text);
    } else {
      opts.onCaption?.('');
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

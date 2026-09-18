import { getGroqKey } from '@/lib/apiKeys';
import { speakReply, stopReply } from '@/lib/assistant/tts';

export { speakReply, stopReply };

export function groqConfigured() {
  return Boolean(getGroqKey());
}

/** Configurable VAD / STT latency knobs. Override via localStorage or env. */
export const VOICE_LATENCY = {
  /** Silence after speech before end-of-utterance (ms). Default ~750ms for snappy turns. */
  silenceMs: (() => {
    if (typeof window === 'undefined') return 750;
    const raw = localStorage.getItem('epicure-voice-silence-ms');
    const n = raw ? Number(raw) : Number(import.meta.env.VITE_VOICE_SILENCE_MS || 750);
    return Number.isFinite(n) && n >= 400 && n <= 2500 ? n : 750;
  })(),
  /** Minimum continuous speech before we treat it as a real utterance (ms). */
  minSpeechMs: 280,
  /** RMS gate once speech has been detected. */
  gateHeard: 0.048,
  /** RMS gate before first speech (higher to ignore noise). */
  gateIdle: 0.07,
  /** Discard recordings smaller than this (bytes). */
  minBlobBytes: 3500,
  /** Max listen window without speech (ms). */
  maxIdleMs: 25_000,
  /**
   * Groq Whisper model. whisper-large-v3-turbo is faster with similar quality.
   * Only use models known to exist on Groq's OpenAI-compatible transcriptions API.
   */
  whisperModel: (() => {
    if (typeof window === 'undefined') return 'whisper-large-v3-turbo';
    const raw =
      localStorage.getItem('epicure-whisper-model') ||
      import.meta.env.VITE_WHISPER_MODEL ||
      'whisper-large-v3-turbo';
    const allowed = new Set(['whisper-large-v3', 'whisper-large-v3-turbo', 'distil-whisper-large-v3-en']);
    return allowed.has(raw) ? raw : 'whisper-large-v3-turbo';
  })(),
};

function isJunkTranscript(text: string) {
  const t = text.trim().toLowerCase().replace(/[.?!,…]/g, '').replace(/\s+/g, ' ');
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

export async function transcribeAudio(
  blob: Blob,
  signal?: AbortSignal,
): Promise<{ text: string; error?: string }> {
  const key = getGroqKey();
  if (!key) return { text: '', error: 'Add a Groq key in Settings for Whisper.' };
  if (signal?.aborted) return { text: '', error: 'aborted' };
  const ext = (blob.type || '').includes('mp4') ? 'mp4' : 'webm';
  const file = new File([blob], `speech.${ext}`, { type: blob.type || 'audio/webm' });
  const body = new FormData();
  body.append('file', file);
  body.append('model', VOICE_LATENCY.whisperModel);
  body.append('response_format', 'json');
  body.append('temperature', '0');
  body.append('language', 'en');
  try {
    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body,
      signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { text: '', error: `Whisper failed (${res.status}) ${detail.slice(0, 160)}` };
    }
    const data = await res.json();
    return { text: String(data.text || '').trim() };
  } catch (err) {
    if (signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
      return { text: '', error: 'aborted' };
    }
    return { text: '', error: err instanceof Error ? err.message : 'Transcription failed.' };
  }
}

export type VoiceStatus = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking';

export interface VoiceLoop {
  stop: () => void;
  /** Force end current recording (e.g. after barge-in handling). */
  flush?: () => void;
}

/**
 * Persistent mic + VAD loop for Voice Mode.
 * Keeps MediaStream and AudioContext alive for the whole session.
 * Supports barge-in via onBargeIn while the assistant is speaking.
 */
export function startVoiceLoop(opts: {
  onListening?: (on: boolean) => void;
  onStatus?: (status: VoiceStatus) => void;
  onLevel?: (level: number) => void;
  onCaption?: (text: string) => void;
  onTranscript: (text: string) => void | Promise<void>;
  onError?: (msg: string) => void;
  /** When false, pause recording (e.g. while thinking). Mic stays open. */
  shouldContinue: () => boolean;
  /**
   * Called when user speech is detected while the assistant is speaking.
   * Parent should stop TTS/LLM and return to listening.
   */
  onBargeIn?: () => void;
  /** True while assistant audio is playing — enables barge-in detection. */
  isSpeaking?: () => boolean;
}): VoiceLoop {
  let stopped = false;
  let ctx: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let raf = 0;
  let activeRec: MediaRecorder | null = null;
  let sttAbort: AbortController | null = null;
  let turnId = 0;

  const teardown = () => {
    stopped = true;
    turnId += 1;
    cancelAnimationFrame(raf);
    sttAbort?.abort();
    sttAbort = null;
    try {
      if (activeRec && activeRec.state !== 'inactive') activeRec.stop();
    } catch { /* ignore */ }
    activeRec = null;
    opts.onListening?.(false);
    opts.onStatus?.('idle');
    try { ctx?.close(); } catch { /* ignore */ }
    stream?.getTracks().forEach((t) => t.stop());
    ctx = null;
    stream = null;
  };

  const waitUntilReady = async () => {
    while (!stopped && opts.shouldContinue() === false) {
      await new Promise((r) => setTimeout(r, 80));
    }
  };

  const ensureMic = async () => {
    if (stream && ctx && ctx.state !== 'closed') {
      if (ctx.state === 'suspended') await ctx.resume();
      return;
    }
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    ctx = new AudioContext();
    if (ctx.state === 'suspended') await ctx.resume();
  };

  const listenOnce = async () => {
    await waitUntilReady();
    if (stopped || !opts.shouldContinue()) {
      if (!stopped) void listenOnce();
      return;
    }
    await ensureMic();
    if (!stream || !ctx || stopped) return;

    const myTurn = ++turnId;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.35;
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);

    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : undefined;
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    activeRec = rec;
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };

    let heard = false;
    let voicedMs = 0;
    let silentMs = 0;
    let last = performance.now();
    const startedAt = last;
    const silenceThreshold = VOICE_LATENCY.silenceMs;
    const minSpeech = VOICE_LATENCY.minSpeechMs;

    rec.start(100);
    opts.onListening?.(true);
    opts.onStatus?.('listening');

    await new Promise<void>((resolve) => {
      const tick = () => {
        if (stopped || myTurn !== turnId) {
          try {
            if (rec.state === 'recording') rec.stop();
          } catch { /* ignore */ }
          resolve();
          return;
        }

        if (!opts.shouldContinue()) {
          if (opts.isSpeaking?.()) {
            analyser.getByteTimeDomainData(samples);
            const level = rmsFromTimeDomain(samples);
            opts.onLevel?.(level);
            if (level > VOICE_LATENCY.gateIdle) {
              voicedMs += 16;
              if (voicedMs > 180) {
                opts.onBargeIn?.();
                voicedMs = 0;
              }
            } else {
              voicedMs = Math.max(0, voicedMs - 8);
            }
          }
          raf = requestAnimationFrame(tick);
          return;
        }

        analyser.getByteTimeDomainData(samples);
        const level = rmsFromTimeDomain(samples);
        opts.onLevel?.(level);
        const now = performance.now();
        const dt = now - last;
        last = now;
        const gate = heard ? VOICE_LATENCY.gateHeard : VOICE_LATENCY.gateIdle;

        if (level > gate) {
          voicedMs += dt;
          silentMs = 0;
          if (voicedMs > minSpeech) heard = true;
        } else if (heard) {
          silentMs += dt;
          if (silentMs >= silenceThreshold) {
            try {
              if (rec.state === 'recording') rec.stop();
            } catch { /* ignore */ }
            resolve();
            return;
          }
        } else if (now - startedAt > VOICE_LATENCY.maxIdleMs) {
          try {
            if (rec.state === 'recording') rec.stop();
          } catch { /* ignore */ }
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
    } catch { /* ignore */ }
    if (activeRec === rec) activeRec = null;

    if (stopped || myTurn !== turnId || !chunks.length) {
      if (!stopped) void listenOnce();
      return;
    }

    const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
    if (blob.size < VOICE_LATENCY.minBlobBytes || !heard) {
      if (!stopped) void listenOnce();
      return;
    }

    opts.onStatus?.('transcribing');
    opts.onCaption?.('Transcribing…');
    sttAbort?.abort();
    const ac = new AbortController();
    sttAbort = ac;
    const result = await transcribeAudio(blob, ac.signal);
    if (myTurn !== turnId || stopped || ac.signal.aborted) {
      if (!stopped) void listenOnce();
      return;
    }
    if (result.error && result.error !== 'aborted') opts.onError?.(result.error);
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

  return {
    stop: teardown,
    flush: () => {
      try {
        if (activeRec && activeRec.state === 'recording') activeRec.stop();
      } catch { /* ignore */ }
    },
  };
}

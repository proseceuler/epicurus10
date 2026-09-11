import { getGroqKey } from '@/lib/apiKeys';
import { speakReply, stopReply } from '@/lib/assistant/tts';

export { speakReply, stopReply };

export function groqConfigured() {
  return Boolean(getGroqKey());
}

function isJunkTranscript(text: string) {
  const t = text.trim().toLowerCase().replace(/[.?!,\u2026]/g, '').replace(/\s+/g, ' ');
  if (t.length < 2) return true;
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
  body.append('model', 'whisper-large-v3');
  body.append('response_format', 'json');
  body.append('temperature', '0');
  body.append('prompt', 'Student talking to a study assistant. English or Filipino. Tasks, grades, baon, canteen, class hub.');
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
      : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : undefined;
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

    let heard = false;
    let voicedMs = 0;
    let silentMs = 0;
    let last = performance.now();
    const startedAt = last;
    rec.start(250);
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
        const gate = heard ? 0.05 : 0.072;
        if (level > gate) {
          voicedMs += dt;
          silentMs = 0;
          if (voicedMs > 160) heard = true;
        } else if (heard) {
          silentMs += dt;
          if (silentMs > 2000) {
            try { rec.stop(); } catch { /* ignore */ }
            resolve();
            return;
          }
        } else if (now - startedAt > 20_000) {
          try { rec.stop(); } catch { /* ignore */ }
          resolve();
          return;
        }
        raf = requestAnimationFrame(tick);
      };
      rec.onstop = () => resolve();
      raf = requestAnimationFrame(tick);
    });

    opts.onListening?.(false);
    try { source.disconnect(); } catch { /* ignore */ }

    if (stopped || !chunks.length) return;
    const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
    if (blob.size < 5000) {
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

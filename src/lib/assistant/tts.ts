import {
  getFishKey,
  getKokoroKey,
  getKokoroUrl,
  getKokoroVoice,
  getOpenRouterKey,
  getTtsEngine,
} from '@/lib/apiKeys';
import { speakText as speakBrowser, splitSpokenChunks, stopSpeech as stopBrowser } from '@/lib/assistant/voice';

const OPENROUTER_SPEECH = 'https://openrouter.ai/api/v1/audio/speech';

function normalizeBase(url: string) {
  return url.replace(/\/+$/, '').replace(/\/v1$/, '');
}

async function fetchSpeech(
  url: string,
  key: string,
  model: string,
  text: string,
  voice: string,
  signal?: AbortSignal,
): Promise<ArrayBuffer | null> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://epicure.app',
      'X-Title': 'epicure assistant',
    },
    body: JSON.stringify({
      model,
      input: text.slice(0, 320),
      voice,
      response_format: 'mp3',
      speed: 1.08,
    }),
    signal,
  });
  if (!res.ok) return null;
  const buf = await res.arrayBuffer();
  return buf.byteLength ? buf : null;
}

async function speakKokoroChunk(text: string, signal?: AbortSignal): Promise<HTMLAudioElement | null> {
  const custom = getKokoroUrl().trim();
  const voice = getKokoroVoice() || 'af_heart';
  const orKey = getOpenRouterKey();
  const customKey = getKokoroKey();
  const targets: Array<{ url: string; key: string; model: string }> = [];
  if (custom) {
    targets.push({ url: `${normalizeBase(custom)}/v1/audio/speech`, key: customKey || 'not-needed', model: 'kokoro' });
  }
  if (orKey) {
    targets.push({ url: OPENROUTER_SPEECH, key: orKey, model: 'hexgrad/kokoro-82m' });
  }
  for (const target of targets) {
    try {
      const buf = await fetchSpeech(target.url, target.key, target.model, text, voice, signal);
      if (!buf) continue;
      const objectUrl = URL.createObjectURL(new Blob([buf], { type: 'audio/mpeg' }));
      const audio = new Audio(objectUrl);
      audio.onended = () => URL.revokeObjectURL(objectUrl);
      return audio;
    } catch {
      if (signal?.aborted) return null;
    }
  }
  return null;
}

async function speakFishChunk(text: string, signal?: AbortSignal): Promise<HTMLAudioElement | null> {
  const key = getFishKey();
  if (!key) return null;
  try {
    const res = await fetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        model: 's1',
      },
      body: JSON.stringify({
        text: text.slice(0, 320),
        format: 'mp3',
        latency: 'balanced',
        temperature: 0.7,
        top_p: 0.8,
      }),
      signal,
    });
    if (!res.ok) return null;
    const objectUrl = URL.createObjectURL(new Blob([await res.arrayBuffer()], { type: 'audio/mpeg' }));
    const audio = new Audio(objectUrl);
    audio.onended = () => URL.revokeObjectURL(objectUrl);
    return audio;
  } catch {
    return null;
  }
}

let currentAudio: HTMLAudioElement | null = null;
let speakGen = 0;

async function playOne(
  text: string,
  gen: number,
  signal: AbortSignal | undefined,
  started: { value: boolean },
  onStart?: () => void,
): Promise<void> {
  if (gen !== speakGen || signal?.aborted) return;
  const engine = getTtsEngine();
  const tryKokoro = engine === 'auto' || engine === 'kokoro';
  const tryFish = engine === 'auto' || engine === 'fish';

  let audio: HTMLAudioElement | null = null;
  if (tryKokoro) audio = await speakKokoroChunk(text, signal);
  if (!audio && tryFish) audio = await speakFishChunk(text, signal);
  if (gen !== speakGen || signal?.aborted) return;

  if (!audio) {
    await new Promise<void>((resolve) => {
      speakBrowser(text, {
        onStart: () => {
          if (!started.value) {
            started.value = true;
            onStart?.();
          }
        },
        onEnd: resolve,
      });
    });
    return;
  }

  await new Promise<void>((resolve) => {
    if (gen !== speakGen) {
      resolve();
      return;
    }
    currentAudio = audio!;
    audio!.onended = () => resolve();
    audio!.onerror = () => resolve();
    void audio!
      .play()
      .then(() => {
        if (!started.value) {
          started.value = true;
          onStart?.();
        }
      })
      .catch(() => resolve());
  });
}

/** Queue sentences as the LLM streams; play each as soon as audio is ready. */
export class StreamingSpeaker {
  private readonly gen: number;
  private queue: string[] = [];
  private playing = false;
  private finished = false;
  private started = { value: false };
  private hooks?: { onStart?: () => void; onEnd?: () => void };
  private signal?: AbortSignal;

  constructor(hooks?: { onStart?: () => void; onEnd?: () => void }, signal?: AbortSignal) {
    stopReply();
    this.gen = ++speakGen;
    this.hooks = hooks;
    this.signal = signal;
  }

  enqueue(sentence: string) {
    const t = sentence.trim();
    if (!t || this.gen !== speakGen) return;
    this.queue.push(t);
    if (!this.playing) void this.drain();
  }

  finish() {
    this.finished = true;
    if (!this.playing && this.queue.length === 0 && this.gen === speakGen) {
      this.hooks?.onEnd?.();
    }
  }

  private async drain() {
    if (this.playing || this.gen !== speakGen) return;
    this.playing = true;
    while (this.queue.length && this.gen === speakGen && !this.signal?.aborted) {
      const chunk = this.queue.shift()!;
      await playOne(chunk, this.gen, this.signal, this.started, this.hooks?.onStart);
    }
    this.playing = false;
    if (this.finished && this.queue.length === 0 && this.gen === speakGen) {
      this.hooks?.onEnd?.();
    } else if (this.queue.length && this.gen === speakGen) {
      void this.drain();
    }
  }
}

export async function speakReply(
  text: string,
  hooks?: { onStart?: () => void; onEnd?: () => void },
  signal?: AbortSignal,
) {
  const chunks = splitSpokenChunks(text).slice(0, 6);
  if (!chunks.length) {
    hooks?.onEnd?.();
    return;
  }
  stopReply();
  const gen = ++speakGen;
  const started = { value: false };
  try {
    for (let i = 0; i < chunks.length; i++) {
      if (gen !== speakGen || signal?.aborted) return;
      await playOne(chunks[i], gen, signal, started, hooks?.onStart);
      if (i < chunks.length - 1) await new Promise((r) => setTimeout(r, 40));
    }
  } finally {
    if (gen === speakGen) hooks?.onEnd?.();
  }
}

export function stopReply() {
  speakGen += 1;
  try {
    currentAudio?.pause();
  } catch {
    /* ignore */
  }
  currentAudio = null;
  stopBrowser();
}

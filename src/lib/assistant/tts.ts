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

async function fetchSpeech(url: string, key: string, model: string, text: string, voice: string, signal?: AbortSignal): Promise<ArrayBuffer | null> {
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
      const url = URL.createObjectURL(new Blob([buf], { type: 'audio/mpeg' }));
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
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
      body: JSON.stringify({ text: text.slice(0, 320), format: 'mp3', latency: 'balanced', temperature: 0.7, top_p: 0.8 }),
      signal,
    });
    if (!res.ok) return null;
    const url = URL.createObjectURL(new Blob([await res.arrayBuffer()], { type: 'audio/mpeg' }));
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    return audio;
  } catch {
    return null;
  }
}

let currentAudio: HTMLAudioElement | null = null;
let speakGen = 0;

/** Queue sentences as the LLM streams; play each as soon as audio is ready. */
export class StreamingSpeaker {
  private gen = 0;
  private queue: string[] = [];
  private playing = false;
  private started = false;
  private done = false;
  private hooks?: { onStart?: () => void; onEnd?: () => void };
  private signal?: AbortSignal;

  constructor(hooks?: { onStart?: () => void; onEnd?: () => void }, signal?: AbortSignal) {
    this.hooks = hooks;
    this.signal = signal;
    this.gen = ++speakGen;
  }

  enqueue(sentence: string) {
    const t = sentence.trim();
    if (!t || this.gen !== speakGen) return;
    this.queue.push(t);
    if (!this.playing) void this.drain();
  }

  /** Call when the full reply is finished so onEnd fires after the last chunk. */
  finish() {
    this.done = true;
    if (!this.playing && this.queue.length === 0) {
      if (this.gen === speakGen) this.hooks?.onEnd?.();
    }
  }

  private async drain() {
    if (this.playing || this.gen !== speakGen) return;
    this.playing = true;
    const engine = getTtsEngine();
    const tryKokoro = engine === 'auto' || engine === 'kokoro';
    const tryFish = engine === 'auto' || engine === 'fish';

    while (this.queue.length && this.gen === speakGen && !this.signal?.aborted) {
      const chunk = this.queue.shift()!;
      let audio: HTMLAudioElement | null = null;
      if (tryKokoro) audio = await speakKokoroChunk(chunk, this.signal);
      if (!audio && tryFish) audio = await speakFishChunk(chunk, this.signal);
      if (this.gen !== speakGen || this.signal?.aborted) break;

      if (!audio) {
        await new Promise<void>((resolve) => {
          speakBrowser(chunk, {
            onStart: () => {
              if (!this.started) {
                this.started = true;
                this.hooks?.onStart?.();
              }
            },
            onEnd: resolve,
          });
        });
        continue;
      }

      await new Promise<void>((resolve) => {
        if (this.gen !== speakGen) {
          resolve();
          return;
        }
        currentAudio = audio!;
        audio!.onended = () => resolve();
        audio!.onerror = () => resolve();
        void audio!.play().then(() => {
          if (!this.started) {
            this.started = true;
            this.hooks?.onStart?.();
          }
        }).catch(() => resolve());
      });
    }

    this.playing = false;
    if (this.done && this.queue.length === 0 && this.gen === speakGen) {
      this.hooks?.onEnd?.();
    } else if (this.queue.length && this.gen === speakGen) {
      void this.drain();
    }
  }
}

export async function speakReply(text: string, hooks?: { onStart?: () => void; onEnd?: () => void }, signal?: AbortSignal) {
  const chunks = splitSpokenChunks(text).slice(0, 6);
  if (!chunks.length) {
    hooks?.onEnd?.();
    return;
  }
  stopReply();
  const speaker = new StreamingSpeaker(hooks, signal);
  for (const c of chunks) speaker.enqueue(c);
  speaker.finish();
  // Wait until gen is bumped (stop) or onEnd would have fired — drain is async.
  await new Promise<void>((resolve) => {
    const check = () => {
      if (speakGen !== speaker['gen' as keyof StreamingSpeaker] as unknown as number) {
        resolve();
        return;
      }
      // Poll lightly until speaker finishes
      const origEnd = hooks?.onEnd;
      // finish already schedules onEnd; wrap by waiting a tick loop
      window.setTimeout(() => resolve(), 50);
    };
    // Simpler: reuse sequential path when not streaming from LLM
    void (async () => {
      const gen = ++speakGen;
      const engine = getTtsEngine();
      const tryKokoro = engine === 'auto' || engine === 'kokoro';
      const tryFish = engine === 'auto' || engine === 'fish';
      let started = false;
      const playAudio = (audio: HTMLAudioElement) => new Promise<void>((res) => {
        if (gen !== speakGen || signal?.aborted) {
          res();
          return;
        }
        currentAudio = audio;
        audio.onended = () => res();
        audio.onerror = () => res();
        void audio.play().then(() => {
          if (!started) {
            started = true;
            hooks?.onStart?.();
          }
        }).catch(() => res());
      });

      try {
        if (tryKokoro || tryFish) {
          for (let i = 0; i < chunks.length; i++) {
            if (gen !== speakGen || signal?.aborted) return;
            let audio: HTMLAudioElement | null = null;
            if (tryKokoro) audio = await speakKokoroChunk(chunks[i], signal);
            if (!audio && tryFish) audio = await speakFishChunk(chunks[i], signal);
            if (!audio) {
              if (gen !== speakGen) return;
              await new Promise<void>((res) => {
                speakBrowser(chunks.slice(i).join(' '), {
                  onStart: () => {
                    if (!started) {
                      started = true;
                      hooks?.onStart?.();
                    }
                  },
                  onEnd: res,
                });
              });
              return;
            }
            await playAudio(audio);
            if (i < chunks.length - 1) await new Promise((r) => setTimeout(r, 40));
          }
          if (gen === speakGen) hooks?.onEnd?.();
          return;
        }
        await new Promise<void>((res) => {
          speakBrowser(chunks.join(' '), {
            onStart: () => {
              started = true;
              hooks?.onStart?.();
            },
            onEnd: res,
          });
        });
      } finally {
        if (gen === speakGen) hooks?.onEnd?.();
      }
    })().finally(() => resolve());
  });
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

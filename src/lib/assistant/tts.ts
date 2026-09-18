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
      input: text.slice(0, 400),
      voice,
      response_format: 'mp3',
      speed: 1.05,
    }),
    signal,
  });
  if (!res.ok) return null;
  const buf = await res.arrayBuffer();
  return buf.byteLength ? buf : null;
}

async function synthesizeKokoro(text: string, signal?: AbortSignal): Promise<HTMLAudioElement | null> {
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

async function synthesizeFish(text: string, signal?: AbortSignal): Promise<HTMLAudioElement | null> {
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
        text: text.slice(0, 400),
        format: 'mp3',
        latency: 'normal',
        temperature: 0.7,
        top_p: 0.8,
      }),
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
let speakAbort: AbortController | null = null;

/** Strip citations, tool JSON, markdown noise so TTS stays natural. */
export function sanitizeForSpeech(text: string): string {
  return text
    .replace(/\[\d+\]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/[#*_>~|]/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Speak a full reply. Prefetches the next TTS chunk while the current one plays
 * so sentence transitions have minimal gap.
 */
export async function speakReply(
  text: string,
  hooks?: { onStart?: () => void; onEnd?: () => void },
) {
  const cleaned = sanitizeForSpeech(text);
  const chunks = splitSpokenChunks(cleaned).slice(0, 8);
  if (!chunks.length) {
    hooks?.onEnd?.();
    return;
  }
  stopReply();
  const gen = ++speakGen;
  const ac = new AbortController();
  speakAbort = ac;
  const engine = getTtsEngine();
  const tryKokoro = engine === 'auto' || engine === 'kokoro';
  const tryFish = engine === 'auto' || engine === 'fish';
  let started = false;

  const synth = async (chunk: string): Promise<HTMLAudioElement | null> => {
    if (gen !== speakGen || ac.signal.aborted) return null;
    let audio: HTMLAudioElement | null = null;
    if (tryKokoro) audio = await synthesizeKokoro(chunk, ac.signal);
    if (!audio && tryFish) audio = await synthesizeFish(chunk, ac.signal);
    return audio;
  };

  const playAudio = (audio: HTMLAudioElement) =>
    new Promise<void>((resolve) => {
      if (gen !== speakGen || ac.signal.aborted) {
        resolve();
        return;
      }
      currentAudio = audio;
      const done = () => {
        if (currentAudio === audio) currentAudio = null;
        resolve();
      };
      audio.onended = done;
      audio.onerror = done;
      void audio
        .play()
        .then(() => {
          if (!started) {
            started = true;
            hooks?.onStart?.();
          }
        })
        .catch(() => resolve());
    });

  try {
    if (tryKokoro || tryFish) {
      let nextPromise: Promise<HTMLAudioElement | null> | null = synth(chunks[0]);

      for (let i = 0; i < chunks.length; i++) {
        if (gen !== speakGen || ac.signal.aborted) return;
        const audio = await nextPromise;
        nextPromise = i + 1 < chunks.length ? synth(chunks[i + 1]) : null;

        if (!audio) {
          if (gen !== speakGen) return;
          await new Promise<void>((resolve) => {
            speakBrowser(chunks.slice(i).join(' '), {
              onStart: () => {
                if (!started) {
                  started = true;
                  hooks?.onStart?.();
                }
              },
              onEnd: resolve,
            });
          });
          return;
        }
        await playAudio(audio);
        if (i < chunks.length - 1 && gen === speakGen) {
          await new Promise((r) => setTimeout(r, 40));
        }
      }
      if (gen === speakGen) hooks?.onEnd?.();
      return;
    }

    await new Promise<void>((resolve) => {
      speakBrowser(chunks.join(' '), {
        onStart: () => {
          started = true;
          hooks?.onStart?.();
        },
        onEnd: resolve,
      });
    });
  } finally {
    if (gen === speakGen) hooks?.onEnd?.();
  }
}

/**
 * Stream-friendly speaker: feed sentences as they arrive from the LLM.
 * Plays each chunk as soon as TTS returns; prefetches the next pending sentence.
 */
export function createStreamingSpeaker(hooks?: {
  onStart?: () => void;
  onEnd?: () => void;
}) {
  const gen = ++speakGen;
  const ac = new AbortController();
  speakAbort = ac;
  const engine = getTtsEngine();
  const tryKokoro = engine === 'auto' || engine === 'kokoro';
  const tryFish = engine === 'auto' || engine === 'fish';
  let started = false;
  let closed = false;
  const queue: string[] = [];
  let playing = false;
  let pendingSynth: Promise<HTMLAudioElement | null> | null = null;

  const synth = async (chunk: string): Promise<HTMLAudioElement | null> => {
    if (gen !== speakGen || ac.signal.aborted) return null;
    let audio: HTMLAudioElement | null = null;
    if (tryKokoro) audio = await synthesizeKokoro(chunk, ac.signal);
    if (!audio && tryFish) audio = await synthesizeFish(chunk, ac.signal);
    return audio;
  };

  const drain = async () => {
    if (playing || gen !== speakGen) return;
    playing = true;
    try {
      while (queue.length && gen === speakGen && !ac.signal.aborted) {
        const text = queue.shift()!;
        const audio = pendingSynth
          ? await pendingSynth
          : tryKokoro || tryFish
            ? await synth(text)
            : null;
        pendingSynth = null;

        if (queue.length && (tryKokoro || tryFish)) {
          pendingSynth = synth(queue[0]);
        }

        if (!audio) {
          await new Promise<void>((resolve) => {
            speakBrowser(text, {
              onStart: () => {
                if (!started) {
                  started = true;
                  hooks?.onStart?.();
                }
              },
              onEnd: resolve,
            });
          });
          continue;
        }

        if (gen !== speakGen) return;
        currentAudio = audio;
        await new Promise<void>((resolve) => {
          const done = () => {
            if (currentAudio === audio) currentAudio = null;
            resolve();
          };
          audio.onended = done;
          audio.onerror = done;
          void audio
            .play()
            .then(() => {
              if (!started) {
                started = true;
                hooks?.onStart?.();
              }
            })
            .catch(() => resolve());
        });
      }
    } finally {
      playing = false;
      if (closed && !queue.length && gen === speakGen) hooks?.onEnd?.();
    }
  };

  return {
    push(sentence: string) {
      if (gen !== speakGen || ac.signal.aborted || closed) return;
      const clean = sanitizeForSpeech(sentence);
      if (!clean) return;
      queue.push(clean);
      void drain();
    },
    end() {
      closed = true;
      if (!playing && !queue.length) hooks?.onEnd?.();
      else void drain();
    },
    stop() {
      if (gen === speakGen) stopReply();
    },
    get active() {
      return gen === speakGen && !ac.signal.aborted;
    },
  };
}

export function stopReply() {
  speakGen += 1;
  try {
    speakAbort?.abort();
  } catch { /* ignore */ }
  speakAbort = null;
  try {
    currentAudio?.pause();
    if (currentAudio?.src) URL.revokeObjectURL(currentAudio.src);
  } catch { /* ignore */ }
  currentAudio = null;
  stopBrowser();
}

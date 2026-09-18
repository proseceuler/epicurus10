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

async function fetchSpeech(url: string, key: string, model: string, text: string, voice: string): Promise<ArrayBuffer | null> {
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
      speed: 1.05,
    }),
  });
  if (!res.ok) return null;
  const buf = await res.arrayBuffer();
  return buf.byteLength ? buf : null;
}

async function speakKokoroChunk(text: string): Promise<HTMLAudioElement | null> {
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
      const buf = await fetchSpeech(target.url, target.key, target.model, text, voice);
      if (!buf) continue;
      const url = URL.createObjectURL(new Blob([buf], { type: 'audio/mpeg' }));
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      return audio;
    } catch { /* next */ }
  }
  return null;
}

async function speakFishChunk(text: string): Promise<HTMLAudioElement | null> {
  const key = getFishKey();
  if (!key) return null;
  const res = await fetch('https://api.fish.audio/v1/tts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      model: 's1',
    },
    body: JSON.stringify({ text: text.slice(0, 320), format: 'mp3', latency: 'balanced', temperature: 0.7, top_p: 0.8 }),
  });
  if (!res.ok) return null;
  const url = URL.createObjectURL(new Blob([await res.arrayBuffer()], { type: 'audio/mpeg' }));
  const audio = new Audio(url);
  audio.onended = () => URL.revokeObjectURL(url);
  return audio;
}

let currentAudio: HTMLAudioElement | null = null;
let speakGen = 0;

export async function speakReply(text: string, hooks?: { onStart?: () => void; onEnd?: () => void }) {
  const chunks = splitSpokenChunks(text).slice(0, 6);
  if (!chunks.length) { hooks?.onEnd?.(); return; }
  stopReply();
  const gen = ++speakGen;
  const engine = getTtsEngine();
  const tryKokoro = engine === 'auto' || engine === 'kokoro';
  const tryFish = engine === 'auto' || engine === 'fish';
  let started = false;
  const playAudio = (audio: HTMLAudioElement) => new Promise<void>((resolve) => {
    if (gen !== speakGen) { resolve(); return; }
    currentAudio = audio;
    audio.onended = () => resolve();
    audio.onerror = () => resolve();
    void audio.play().then(() => {
      if (!started) { started = true; hooks?.onStart?.(); }
    }).catch(() => resolve());
  });

  try {
    if (tryKokoro || tryFish) {
      for (let i = 0; i < chunks.length; i++) {
        if (gen !== speakGen) return;
        let audio: HTMLAudioElement | null = null;
        if (tryKokoro) audio = await speakKokoroChunk(chunks[i]);
        if (!audio && tryFish) audio = await speakFishChunk(chunks[i]);
        if (!audio) {
          if (gen !== speakGen) return;
          await new Promise<void>((resolve) => {
            speakBrowser(chunks.slice(i).join(' '), {
              onStart: () => { if (!started) { started = true; hooks?.onStart?.(); } },
              onEnd: resolve,
            });
          });
          return;
        }
        await playAudio(audio);
        if (i < chunks.length - 1) await new Promise((r) => setTimeout(r, 80));
      }
      hooks?.onEnd?.();
      return;
    }
    await new Promise<void>((resolve) => {
      speakBrowser(chunks.join(' '), {
        onStart: () => { started = true; hooks?.onStart?.(); },
        onEnd: resolve,
      });
    });
  } finally {
    if (gen === speakGen) hooks?.onEnd?.();
  }
}

export function stopReply() {
  speakGen += 1;
  try { currentAudio?.pause(); } catch { /* ignore */ }
  currentAudio = null;
  stopBrowser();
}

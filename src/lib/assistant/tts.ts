import {
  getFishKey,
  getKokoroKey,
  getKokoroUrl,
  getKokoroVoice,
  getOpenRouterKey,
  getTtsEngine,
} from '@/lib/apiKeys';
import { speakText as speakBrowser, stopSpeech as stopBrowser } from '@/lib/assistant/voice';

const OPENROUTER_SPEECH = 'https://openrouter.ai/api/v1/audio/speech';

function normalizeBase(url: string) {
  return url.replace(/\/+$/, '').replace(/\/v1$/, '');
}

async function playBlob(buf: ArrayBuffer, mime: string): Promise<HTMLAudioElement> {
  const url = URL.createObjectURL(new Blob([buf], { type: mime }));
  const audio = new Audio(url);
  audio.onended = () => URL.revokeObjectURL(url);
  return audio;
}

async function speakKokoro(text: string): Promise<HTMLAudioElement | null> {
  const custom = getKokoroUrl().trim();
  const voice = getKokoroVoice() || 'af_heart';
  const orKey = getOpenRouterKey();
  const customKey = getKokoroKey();

  const targets: Array<{ url: string; key: string; model: string }> = [];
  if (custom) {
    targets.push({
      url: `${normalizeBase(custom)}/v1/audio/speech`,
      key: customKey || 'not-needed',
      model: 'kokoro',
    });
  }
  if (orKey) {
    targets.push({
      url: OPENROUTER_SPEECH,
      key: orKey,
      model: 'hexgrad/kokoro-82m',
    });
  }

  for (const target of targets) {
    try {
      const res = await fetch(target.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${target.key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://epicure.app',
          'X-Title': 'epicure assistant',
        },
        body: JSON.stringify({
          model: target.model,
          input: text.slice(0, 600),
          voice,
          response_format: 'mp3',
        }),
      });
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      if (!buf.byteLength) continue;
      return playBlob(buf, 'audio/mpeg');
    } catch {
      /* try next host */
    }
  }
  return null;
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
  return playBlob(await res.arrayBuffer(), 'audio/mpeg');
}

let currentAudio: HTMLAudioElement | null = null;
let speakDone: (() => void) | null = null;

function finishSpeak() {
  const done = speakDone;
  speakDone = null;
  done?.();
}

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
  await new Promise<void>((resolve) => {
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      currentAudio = null;
      hooks?.onEnd?.();
      if (speakDone === settle) speakDone = null;
      resolve();
    };
    speakDone = settle;
    const play = async () => {
      const engine = getTtsEngine();
      const tryKokoro = engine === 'auto' || engine === 'kokoro';
      const tryFish = engine === 'auto' || engine === 'fish';
      if (tryKokoro) {
        try {
          const audio = await speakKokoro(clean);
          if (settled) return;
          if (audio) {
            currentAudio = audio;
            audio.onplay = () => hooks?.onStart?.();
            audio.onended = settle;
            audio.onerror = settle;
            void audio.play().catch(settle);
            return;
          }
        } catch { /* next */ }
      }
      if (tryFish && !settled) {
        try {
          const audio = await speakFish(clean);
          if (settled) return;
          if (audio) {
            currentAudio = audio;
            audio.onplay = () => hooks?.onStart?.();
            audio.onended = settle;
            audio.onerror = settle;
            void audio.play().catch(settle);
            return;
          }
        } catch { /* browser */ }
      }
      if (settled) return;
      if (engine === 'kokoro' || engine === 'fish') {
        /* still fall back so voice mode is never silent */
      }
      hooks?.onStart?.();
      speakBrowser(clean, { onStart: hooks?.onStart, onEnd: settle });
      void waitForSpeechEnd().then(settle);
    };
    void play();
  });
}

export function stopReply() {
  try { currentAudio?.pause(); } catch { /* ignore */ }
  currentAudio = null;
  stopBrowser();
  finishSpeak();
}

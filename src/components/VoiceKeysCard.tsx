import { useState } from 'react';
import { Card, Input, Select } from '@/components/kit';
import {
  FISH_KEY, GROQ_KEY, KOKORO_KEY, KOKORO_URL, KOKORO_VOICE, TTS_ENGINE,
  getFishKey, getGroqKey, getKokoroKey, getKokoroUrl, getKokoroVoice, getTtsEngine, saveKey,
  type TtsEngine,
} from '@/lib/apiKeys';

const ENGINES: { value: TtsEngine; label: string }[] = [
  { value: 'auto', label: 'Auto — Kokoro, then Fish, then browser' },
  { value: 'kokoro', label: 'Kokoro' },
  { value: 'fish', label: 'Fish Audio' },
  { value: 'browser', label: 'Browser voice' },
];

const VOICES = [
  { value: 'af_heart', label: 'af_heart — US female' },
  { value: 'af_bella', label: 'af_bella — US female' },
  { value: 'af_nicole', label: 'af_nicole — US female' },
  { value: 'am_michael', label: 'am_michael — US male' },
  { value: 'am_fenrir', label: 'am_fenrir — US male' },
  { value: 'bf_emma', label: 'bf_emma — UK female' },
  { value: 'bm_george', label: 'bm_george — UK male' },
];

export function VoiceKeysCard() {
  const [groq, setGroq] = useState(() => getGroqKey());
  const [fish, setFish] = useState(() => getFishKey());
  const [engine, setEngine] = useState<TtsEngine>(() => getTtsEngine());
  const [kokoroUrl, setKokoroUrl] = useState(() => getKokoroUrl());
  const [kokoroKey, setKokoroKey] = useState(() => getKokoroKey());
  const [voice, setVoice] = useState(() => getKokoroVoice());
  return (
    <Card className="p-6">
      <h3 className="mb-1 font-semibold text-zinc-800">Voice</h3>
      <p className="mb-4 text-xs text-zinc-400">
        Waveform button in Arrodes. Mic → Whisper → same thread → Kokoro, Fish, or the browser voice.
      </p>
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-600">Groq API key</label>
          <Input type="password" value={groq} onChange={(v) => { setGroq(v); saveKey(GROQ_KEY, v.trim()); }} placeholder="gsk_..." />
          <p className="mt-1 text-xs text-zinc-400">Free Whisper Large V3 at console.groq.com</p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-600">Spoken voice</label>
          <Select value={engine} onChange={(v) => { const next = v as TtsEngine; setEngine(next); saveKey(TTS_ENGINE, next); }} options={ENGINES} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-600">Kokoro voice</label>
          <Select value={voice} onChange={(v) => { setVoice(v); saveKey(KOKORO_VOICE, v); }} options={VOICES} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-600">Kokoro URL (optional)</label>
          <Input value={kokoroUrl} onChange={(v) => { setKokoroUrl(v); saveKey(KOKORO_URL, v.trim()); }} placeholder="https://your-host:8880 or leave blank for OpenRouter" />
          <p className="mt-1 text-xs text-zinc-400">Blank uses OpenRouter model hexgrad/kokoro-82m with your OpenRouter key. Or point at a Kokoro-FastAPI host.</p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-600">Kokoro key (optional)</label>
          <Input type="password" value={kokoroKey} onChange={(v) => { setKokoroKey(v); saveKey(KOKORO_KEY, v.trim()); }} placeholder="Only if your Kokoro host needs one" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-600">Fish Audio key (optional)</label>
          <Input type="password" value={fish} onChange={(v) => { setFish(v); saveKey(FISH_KEY, v.trim()); }} placeholder="Fish TTS key" />
          <p className="mt-1 text-xs text-zinc-400">Used when Spoken voice is Fish, or Auto if Kokoro is unavailable.</p>
        </div>
      </div>
    </Card>
  );
}

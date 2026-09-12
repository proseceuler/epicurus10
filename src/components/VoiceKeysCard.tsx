import { useRef, useState } from 'react';
import { Card, Input, Select } from '@/components/kit';
import {
  ARRODES_FRAME_PNG, FISH_KEY, GROQ_KEY, KOKORO_KEY, KOKORO_URL, KOKORO_VOICE, TTS_ENGINE,
  getArrodesFramePng, getFishKey, getGroqKey, getKokoroKey, getKokoroUrl, getKokoroVoice, getTtsEngine, saveKey,
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

async function fileToFrameDataUrl(file: File): Promise<string> {
  const raw = await file.arrayBuffer();
  const blob = new Blob([raw], { type: file.type || 'image/png' });
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not read that image.'));
      el.src = url;
    });
    const max = 640;
    const scale = Math.min(1, max / Math.max(img.width, img.height, 1));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not draw that image.');
    ctx.drawImage(img, 0, 0, w, h);
    let data = canvas.toDataURL('image/png');
    if (data.length > 1_200_000) {
      const shrink = 420 / Math.max(w, h, 1);
      canvas.width = Math.max(1, Math.round(w * Math.min(1, shrink)));
      canvas.height = Math.max(1, Math.round(h * Math.min(1, shrink)));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      data = canvas.toDataURL('image/png');
    }
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function VoiceKeysCard() {
  const [groq, setGroq] = useState(() => getGroqKey());
  const [fish, setFish] = useState(() => getFishKey());
  const [engine, setEngine] = useState<TtsEngine>(() => getTtsEngine());
  const [kokoroUrl, setKokoroUrl] = useState(() => getKokoroUrl());
  const [kokoroKey, setKokoroKey] = useState(() => getKokoroKey());
  const [voice, setVoice] = useState(() => getKokoroVoice());
  const [frame, setFrame] = useState(() => getArrodesFramePng());
  const [frameError, setFrameError] = useState('');
  const frameRef = useRef<HTMLInputElement>(null);

  const attachFrame = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setFrameError('Attach a PNG or other image for the frame.');
      return;
    }
    try {
      const data = await fileToFrameDataUrl(file);
      saveKey(ARRODES_FRAME_PNG, data);
      setFrame(data);
      setFrameError('');
    } catch (err) {
      setFrameError(err instanceof Error ? err.message : 'Could not attach that image.');
    }
  };

  const clearFrame = () => {
    saveKey(ARRODES_FRAME_PNG, '');
    setFrame('');
    setFrameError('');
    if (frameRef.current) frameRef.current.value = '';
  };

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
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-600">Mirror frame</label>
          <p className="mb-2 text-xs text-zinc-400">
            Attach a PNG of the gothic frame. The glass hole still uses the built-in SVG mask so mercury stays in the opening.
          </p>
          <div className="flex items-center gap-3">
            <div className="flex h-16 w-14 items-center justify-center overflow-hidden rounded-md bg-zinc-100 ring-1 ring-zinc-200">
              {frame ? <img src={frame} alt="" className="h-full w-full object-contain" /> : <span className="px-1 text-center text-[9px] text-zinc-400">Default</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              <input ref={frameRef} type="file" accept="image/png,image/webp,image/jpeg" className="hidden" onChange={(e) => { void attachFrame(e.target.files); e.target.value = ''; }} />
              <button type="button" onClick={() => frameRef.current?.click()} className="rounded-full bg-zinc-900 px-3 py-1.5 text-xs text-white">Attach image</button>
              {frame ? <button type="button" onClick={clearFrame} className="rounded-full bg-white px-3 py-1.5 text-xs text-zinc-600 ring-1 ring-zinc-200">Use default</button> : null}
            </div>
          </div>
          {frameError ? <p className="mt-1 text-xs text-zinc-500">{frameError}</p> : null}
        </div>
      </div>
    </Card>
  );
}

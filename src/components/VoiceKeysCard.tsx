import { useState } from 'react';
import { Card, Input } from '@/components/kit';
import { FISH_KEY, GROQ_KEY, getFishKey, getGroqKey, saveKey } from '@/lib/apiKeys';

export function VoiceKeysCard() {
  const [groq, setGroq] = useState(() => getGroqKey());
  const [fish, setFish] = useState(() => getFishKey());
  return (
    <Card className="p-6">
      <h3 className="mb-1 font-semibold text-zinc-800">Voice</h3>
      <p className="mb-4 text-xs text-zinc-400">
        Used by the waveform button in Arrodes. Voice stays on until you tap it again. Pipeline: mic → pause detect → Whisper Turbo → same thread → Fish or browser voice.
      </p>
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-600">Groq API key</label>
          <Input type="password" value={groq} onChange={(v) => { setGroq(v); saveKey(GROQ_KEY, v.trim()); }} placeholder="gsk_..." />
          <p className="mt-1 text-xs text-zinc-400">Free Whisper Large V3 Turbo at console.groq.com</p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-600">Fish Audio key (optional)</label>
          <Input type="password" value={fish} onChange={(v) => { setFish(v); saveKey(FISH_KEY, v.trim()); }} placeholder="Fish TTS key" />
          <p className="mt-1 text-xs text-zinc-400">If empty, Arrodes uses the browser voice.</p>
        </div>
      </div>
    </Card>
  );
}

import { deleteMedia, loadBlob, saveBlob } from '@/lib/mediaStore';

export type AmbientId =
  | 'rain'
  | 'white'
  | 'lofi'
  | 'forest'
  | 'ocean'
  | 'cafe'
  | 'fire'
  | 'thunder'
  | 'library'
  | 'cabin';

const CUSTOM_MAP_KEY = 'epicure:ambient-custom:v1';
const MAX_CUSTOM_BYTES = 8 * 1024 * 1024;

type CustomMap = Partial<Record<AmbientId, string>>;

function readCustomMap(): CustomMap {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(CUSTOM_MAP_KEY);
    return raw ? (JSON.parse(raw) as CustomMap) : {};
  } catch {
    return {};
  }
}

function writeCustomMap(map: CustomMap) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(CUSTOM_MAP_KEY, JSON.stringify(map));
}

export function hasCustomAmbient(id: AmbientId) {
  return Boolean(readCustomMap()[id]);
}

export function listCustomAmbients(): AmbientId[] {
  return (Object.keys(readCustomMap()) as AmbientId[]).filter((id) => Boolean(readCustomMap()[id]));
}

export async function setCustomAmbient(id: AmbientId, file: File) {
  if (!file || file.size > MAX_CUSTOM_BYTES) {
    throw new Error(file && file.size > MAX_CUSTOM_BYTES ? 'File is over 8 MB' : 'No file selected');
  }
  if (file.type && !file.type.startsWith('audio/')) {
    throw new Error('Pick an audio file');
  }
  const ref = await saveBlob(`ambient-${id}`, file);
  const map = readCustomMap();
  map[id] = ref;
  writeCustomMap(map);
  return ref;
}

export async function clearCustomAmbient(id: AmbientId) {
  const map = readCustomMap();
  const ref = map[id];
  delete map[id];
  writeCustomMap(map);
  if (ref) await deleteMedia(ref);
}

export async function loadCustomAmbient(id: AmbientId): Promise<Blob | null> {
  const ref = readCustomMap()[id];
  if (!ref) return null;
  return loadBlob(ref);
}

export const AMBIENT_LIBRARY: { id: AmbientId; label: string; desc: string }[] = [
  { id: 'rain', label: 'Rain', desc: 'Calming rain' },
  { id: 'white', label: 'White Noise', desc: 'Block distractions' },
  { id: 'lofi', label: 'Lo-fi', desc: 'Low-frequency hum' },
  { id: 'forest', label: 'Forest', desc: 'Birds & rustling leaves' },
  { id: 'ocean', label: 'Ocean', desc: 'Steady coastal rhythm' },
  { id: 'cafe', label: 'Café', desc: 'Café chatter & clinks' },
  { id: 'fire', label: 'Fireplace', desc: 'Crackling warmth' },
  { id: 'thunder', label: 'Thunder', desc: 'Deep rolling thunder' },
  { id: 'library', label: 'Library', desc: 'Quiet room tone' },
  { id: 'cabin', label: 'Cabin', desc: 'Soft engine hum' },
];

type Voice = {
  gain: GainNode;
  stop: () => void;
};

function noiseBuffer(ctx: AudioContext, seconds = 2.4, color: 'white' | 'pink' | 'brown' = 'pink') {
  const size = Math.floor(seconds * ctx.sampleRate);
  const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
  const out = buffer.getChannelData(0);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let last = 0;
  for (let i = 0; i < size; i++) {
    const white = Math.random() * 2 - 1;
    if (color === 'white') {
      out[i] = white * 0.72;
    } else if (color === 'pink') {
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      out[i] = (b0 + b1 + b2 + white * 0.3) * 0.3;
    } else {
      last = (last + 0.02 * white) / 1.02;
      out[i] = last * 3.4;
    }
  }
  return buffer;
}

function loopNoise(ctx: AudioContext, color: 'white' | 'pink' | 'brown') {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 2.4, color);
  src.loop = true;
  src.start();
  return src;
}

function filter(ctx: AudioContext, type: BiquadFilterType, freq: number, q = 0.7) {
  const node = ctx.createBiquadFilter();
  node.type = type;
  node.frequency.value = freq;
  node.Q.value = q;
  return node;
}

function tone(ctx: AudioContext, freq: number, type: OscillatorType = 'sine') {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  osc.start();
  return osc;
}

function soften(ctx: AudioContext) {
  const lp = filter(ctx, 'lowpass', 2800, 0.65);
  const shelf = filter(ctx, 'highshelf', 2000, 0.7);
  shelf.gain.value = -12;
  lp.connect(shelf);
  return { input: lp, output: shelf };
}

export class AmbientMixer {
  private ctx: AudioContext | null = null;
  private voices = new Map<AmbientId, Voice>();

  private audio() {
    if (!this.ctx || this.ctx.state === 'closed') this.ctx = new AudioContext();
    return this.ctx;
  }

  isPlaying(id: AmbientId) {
    return this.voices.has(id);
  }

  playingIds() {
    return [...this.voices.keys()];
  }

  setVolume(id: AmbientId, volume01: number) {
    const voice = this.voices.get(id);
    if (!voice) return;
    voice.gain.gain.setTargetAtTime(Math.max(0, Math.min(1, volume01)), this.audio().currentTime, 0.05);
  }

  stop(id: AmbientId, fadeMs = 180) {
    const voice = this.voices.get(id);
    if (!voice) return;
    const ctx = this.audio();
    voice.gain.gain.setTargetAtTime(0, ctx.currentTime, Math.max(0.02, fadeMs / 3000));
    window.setTimeout(() => {
      voice.stop();
      this.voices.delete(id);
    }, fadeMs);
  }

  stopAll(fadeMs = 180) {
    for (const id of [...this.voices.keys()]) this.stop(id, fadeMs);
  }

  fadeAllToZero(ms = 3000): Promise<void> {
    const ids = [...this.voices.keys()];
    if (!ids.length) return Promise.resolve();
    const ctx = this.audio();
    for (const id of ids) {
      const voice = this.voices.get(id);
      if (!voice) continue;
      voice.gain.gain.cancelScheduledValues(ctx.currentTime);
      voice.gain.gain.setTargetAtTime(0, ctx.currentTime, ms / 4000);
    }
    return new Promise((resolve) => {
      window.setTimeout(() => {
        this.stopAll(80);
        resolve();
      }, ms);
    });
  }

  async play(id: AmbientId, volume01: number) {
    if (this.voices.has(id)) {
      this.setVolume(id, volume01);
      return;
    }
    const custom = await loadCustomAmbient(id);
    if (custom) {
      await this.playCustom(id, custom, volume01);
      return;
    }
    const ctx = this.audio();
    if (ctx.state === 'suspended') await ctx.resume();
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    const soft = soften(ctx);
    soft.output.connect(master);
    const stoppers: Array<() => void> = [];

    const attachNoise = (color: 'white' | 'pink' | 'brown', pre?: BiquadFilterNode, level = 0.42) => {
      const src = loopNoise(ctx, color);
      const g = ctx.createGain();
      g.gain.value = level;
      if (pre) src.connect(pre).connect(g);
      else src.connect(g);
      g.connect(soft.input);
      stoppers.push(() => src.stop());
    };

    if (id === 'white') {
      attachNoise('pink', filter(ctx, 'lowpass', 1100), 0.48);
    } else if (id === 'rain') {
      attachNoise('brown', filter(ctx, 'bandpass', 620, 0.55), 0.58);
    } else if (id === 'lofi') {
      attachNoise('brown', filter(ctx, 'lowpass', 480), 0.5);
      const osc = tone(ctx, 52, 'sine');
      const og = ctx.createGain();
      og.gain.value = 0.03;
      osc.connect(og).connect(soft.input);
      stoppers.push(() => osc.stop());
    } else if (id === 'forest') {
      attachNoise('pink', filter(ctx, 'lowpass', 1400), 0.42);
    } else if (id === 'ocean') {
      const src = loopNoise(ctx, 'brown');
      const lp = filter(ctx, 'lowpass', 280);
      const g = ctx.createGain();
      g.gain.value = 0.55;
      const lfo = tone(ctx, 0.08, 'sine');
      const lg = ctx.createGain();
      lg.gain.value = 0.08;
      lfo.connect(lg).connect(g.gain);
      src.connect(lp).connect(g).connect(soft.input);
      stoppers.push(() => { src.stop(); lfo.stop(); });
    } else if (id === 'cafe') {
      attachNoise('pink', filter(ctx, 'lowpass', 1000), 0.4);
    } else if (id === 'fire') {
      attachNoise('brown', filter(ctx, 'bandpass', 480, 0.8), 0.52);
    } else if (id === 'thunder') {
      attachNoise('brown', filter(ctx, 'lowpass', 180), 0.6);
      const rumble = tone(ctx, 34, 'sine');
      const rg = ctx.createGain();
      rg.gain.value = 0.04;
      rumble.connect(rg).connect(soft.input);
      stoppers.push(() => rumble.stop());
    } else if (id === 'library') {
      attachNoise('pink', filter(ctx, 'lowpass', 600), 0.36);
    } else {
      attachNoise('pink', filter(ctx, 'lowpass', 320), 0.48);
      const hum = tone(ctx, 56, 'sine');
      const hg = ctx.createGain();
      hg.gain.value = 0.03;
      hum.connect(hg).connect(soft.input);
      stoppers.push(() => hum.stop());
    }

    master.gain.setTargetAtTime(Math.max(0.12, Math.min(1, volume01)), ctx.currentTime, 0.08);
    this.voices.set(id, {
      gain: master,
      stop: () => {
        try { stoppers.forEach((fn) => fn()); } catch { /* already stopped */ }
        try { master.disconnect(); } catch { /* ignore */ }
      },
    });
  }

  private async playCustom(id: AmbientId, blob: Blob, volume01: number) {
    const ctx = this.audio();
    if (ctx.state === 'suspended') await ctx.resume();
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    const soft = soften(ctx);
    soft.output.connect(master);
    const stoppers: Array<() => void> = [];

    try {
      const copy = await blob.arrayBuffer();
      const buffer = await ctx.decodeAudioData(copy);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.connect(soft.input);
      src.start();
      stoppers.push(() => {
        try { src.stop(); } catch { /* already stopped */ }
      });
    } catch {
      const url = URL.createObjectURL(blob);
      const el = new Audio(url);
      el.loop = true;
      const node = ctx.createMediaElementSource(el);
      node.connect(soft.input);
      await el.play();
      stoppers.push(() => {
        el.pause();
        el.src = '';
        URL.revokeObjectURL(url);
        try { node.disconnect(); } catch { /* ignore */ }
      });
    }

    master.gain.setTargetAtTime(Math.max(0.12, Math.min(1, volume01)), ctx.currentTime, 0.08);
    this.voices.set(id, {
      gain: master,
      stop: () => {
        try { stoppers.forEach((fn) => fn()); } catch { /* already stopped */ }
        try { master.disconnect(); } catch { /* ignore */ }
      },
    });
  }

  dispose() {
    this.stopAll(60);
    if (this.ctx && this.ctx.state !== 'closed') void this.ctx.close();
    this.ctx = null;
  }
}

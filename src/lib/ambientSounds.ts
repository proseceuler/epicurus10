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

export const AMBIENT_LIBRARY: { id: AmbientId; label: string; desc: string }[] = [
  { id: 'rain', label: 'Rain Sounds', desc: 'Calming rain' },
  { id: 'white', label: 'White Noise', desc: 'Block distractions' },
  { id: 'lofi', label: 'Lo-fi Ambient', desc: 'Low-frequency hum' },
  { id: 'forest', label: 'Forest Ambience', desc: 'Birds & rustling leaves' },
  { id: 'ocean', label: 'Ocean Waves', desc: 'Steady coastal rhythm' },
  { id: 'cafe', label: 'Coffee Shop', desc: 'Café chatter & clinks' },
  { id: 'fire', label: 'Fireplace', desc: 'Crackling warmth' },
  { id: 'thunder', label: 'Thunderstorm', desc: 'Deep rolling thunder' },
  { id: 'library', label: 'Library Ambience', desc: '' },
  { id: 'cabin', label: 'Cabin Hum', desc: '' },
];

type Voice = {
  gain: GainNode;
  stop: () => void;
};

function noiseBuffer(ctx: AudioContext, seconds = 2, color: 'white' | 'pink' | 'brown' = 'white') {
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
      out[i] = white;
    } else if (color === 'pink') {
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      out[i] = (b0 + b1 + b2 + white * 0.3) * 0.2;
    } else {
      last = (last + 0.02 * white) / 1.02;
      out[i] = last * 3.5;
    }
  }
  return buffer;
}

function loopNoise(ctx: AudioContext, color: 'white' | 'pink' | 'brown') {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 2.2, color);
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

export class AmbientMixer {
  private ctx: AudioContext | null = null;
  private voices = new Map<AmbientId, Voice>();

  private audio() {
    if (!this.ctx || this.ctx.state === 'closed') this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') void this.ctx.resume();
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
    voice.gain.gain.setTargetAtTime(Math.max(0, Math.min(1, volume01)), this.audio().currentTime, 0.04);
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

  play(id: AmbientId, volume01: number) {
    if (this.voices.has(id)) {
      this.setVolume(id, volume01);
      return;
    }
    const ctx = this.audio();
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    const stoppers: Array<() => void> = [];

    if (id === 'white') {
      const src = loopNoise(ctx, 'white');
      const lp = filter(ctx, 'lowpass', 1400);
      const g = ctx.createGain();
      g.gain.value = 0.1;
      src.connect(lp).connect(g).connect(master);
      stoppers.push(() => src.stop());
    } else if (id === 'rain') {
      const src = loopNoise(ctx, 'brown');
      const bp = filter(ctx, 'bandpass', 900, 0.55);
      const g = ctx.createGain();
      g.gain.value = 0.18;
      src.connect(bp).connect(g).connect(master);
      stoppers.push(() => src.stop());
    } else if (id === 'lofi') {
      const src = loopNoise(ctx, 'pink');
      const lp = filter(ctx, 'lowpass', 420);
      const g = ctx.createGain();
      g.gain.value = 0.12;
      src.connect(lp).connect(g).connect(master);
      const osc = tone(ctx, 98, 'sine');
      const og = ctx.createGain();
      og.gain.value = 0.018;
      osc.connect(og).connect(master);
      stoppers.push(() => { src.stop(); osc.stop(); });
    } else if (id === 'forest') {
      const src = loopNoise(ctx, 'pink');
      const bp = filter(ctx, 'bandpass', 1800, 0.7);
      const g = ctx.createGain();
      g.gain.value = 0.08;
      src.connect(bp).connect(g).connect(master);
      const chirp = tone(ctx, 1860, 'sine');
      const lfo = tone(ctx, 0.35, 'sine');
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 220;
      lfo.connect(lfoGain).connect(chirp.frequency);
      const cg = ctx.createGain();
      cg.gain.value = 0.012;
      chirp.connect(cg).connect(master);
      stoppers.push(() => { src.stop(); chirp.stop(); lfo.stop(); });
    } else if (id === 'ocean') {
      const src = loopNoise(ctx, 'brown');
      const lp = filter(ctx, 'lowpass', 380);
      const g = ctx.createGain();
      g.gain.value = 0.16;
      const lfo = tone(ctx, 0.12, 'sine');
      const lg = ctx.createGain();
      lg.gain.value = 0.08;
      lfo.connect(lg).connect(g.gain);
      src.connect(lp).connect(g).connect(master);
      stoppers.push(() => { src.stop(); lfo.stop(); });
    } else if (id === 'cafe') {
      const src = loopNoise(ctx, 'pink');
      const bp = filter(ctx, 'bandpass', 1200, 0.4);
      const g = ctx.createGain();
      g.gain.value = 0.07;
      src.connect(bp).connect(g).connect(master);
      const clink = tone(ctx, 2400, 'triangle');
      const cg = ctx.createGain();
      cg.gain.value = 0.006;
      clink.connect(cg).connect(master);
      stoppers.push(() => { src.stop(); clink.stop(); });
    } else if (id === 'fire') {
      const src = loopNoise(ctx, 'brown');
      const hp = filter(ctx, 'highpass', 220);
      const bp = filter(ctx, 'bandpass', 640, 0.8);
      const g = ctx.createGain();
      g.gain.value = 0.14;
      src.connect(hp).connect(bp).connect(g).connect(master);
      stoppers.push(() => src.stop());
    } else if (id === 'thunder') {
      const src = loopNoise(ctx, 'brown');
      const lp = filter(ctx, 'lowpass', 180);
      const g = ctx.createGain();
      g.gain.value = 0.2;
      src.connect(lp).connect(g).connect(master);
      const rumble = tone(ctx, 42, 'sine');
      const rg = ctx.createGain();
      rg.gain.value = 0.03;
      rumble.connect(rg).connect(master);
      stoppers.push(() => { src.stop(); rumble.stop(); });
    } else if (id === 'library') {
      const src = loopNoise(ctx, 'pink');
      const lp = filter(ctx, 'lowpass', 700);
      const g = ctx.createGain();
      g.gain.value = 0.045;
      src.connect(lp).connect(g).connect(master);
      stoppers.push(() => src.stop());
    } else {
      const src = loopNoise(ctx, 'pink');
      const lp = filter(ctx, 'lowpass', 260);
      const g = ctx.createGain();
      g.gain.value = 0.1;
      src.connect(lp).connect(g).connect(master);
      const hum = tone(ctx, 85, 'sine');
      const hg = ctx.createGain();
      hg.gain.value = 0.025;
      hum.connect(hg).connect(master);
      stoppers.push(() => { src.stop(); hum.stop(); });
    }

    master.gain.setTargetAtTime(Math.max(0.02, volume01), ctx.currentTime, 0.08);
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

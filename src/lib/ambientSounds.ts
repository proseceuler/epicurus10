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
      out[i] = white * 0.35;
    } else if (color === 'pink') {
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      out[i] = (b0 + b1 + b2 + white * 0.3) * 0.08;
    } else {
      last = (last + 0.02 * white) / 1.02;
      out[i] = last * 1.15;
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
  const lp = filter(ctx, 'lowpass', 680, 0.55);
  const shelf = filter(ctx, 'highshelf', 1400, 0.7);
  shelf.gain.value = -18;
  lp.connect(shelf);
  return { input: lp, output: shelf };
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
    voice.gain.gain.setTargetAtTime(Math.max(0, Math.min(0.7, volume01 * 0.55)), this.audio().currentTime, 0.05);
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
    const soft = soften(ctx);
    soft.output.connect(master);
    const stoppers: Array<() => void> = [];

    const attachNoise = (color: 'white' | 'pink' | 'brown', pre?: BiquadFilterNode, level = 0.08) => {
      const src = loopNoise(ctx, color);
      const g = ctx.createGain();
      g.gain.value = level;
      if (pre) src.connect(pre).connect(g);
      else src.connect(g);
      g.connect(soft.input);
      stoppers.push(() => src.stop());
    };

    if (id === 'white') {
      attachNoise('pink', filter(ctx, 'lowpass', 520), 0.07);
    } else if (id === 'rain') {
      attachNoise('brown', filter(ctx, 'bandpass', 480, 0.45), 0.11);
    } else if (id === 'lofi') {
      attachNoise('brown', filter(ctx, 'lowpass', 280), 0.09);
      const osc = tone(ctx, 58, 'sine');
      const og = ctx.createGain();
      og.gain.value = 0.012;
      osc.connect(og).connect(soft.input);
      stoppers.push(() => osc.stop());
    } else if (id === 'forest') {
      attachNoise('pink', filter(ctx, 'bandpass', 640, 0.5), 0.06);
    } else if (id === 'ocean') {
      const src = loopNoise(ctx, 'brown');
      const lp = filter(ctx, 'lowpass', 240);
      const g = ctx.createGain();
      g.gain.value = 0.1;
      const lfo = tone(ctx, 0.08, 'sine');
      const lg = ctx.createGain();
      lg.gain.value = 0.035;
      lfo.connect(lg).connect(g.gain);
      src.connect(lp).connect(g).connect(soft.input);
      stoppers.push(() => { src.stop(); lfo.stop(); });
    } else if (id === 'cafe') {
      attachNoise('pink', filter(ctx, 'lowpass', 560), 0.05);
    } else if (id === 'fire') {
      attachNoise('brown', filter(ctx, 'bandpass', 420, 0.7), 0.09);
    } else if (id === 'thunder') {
      attachNoise('brown', filter(ctx, 'lowpass', 110), 0.12);
      const rumble = tone(ctx, 36, 'sine');
      const rg = ctx.createGain();
      rg.gain.value = 0.02;
      rumble.connect(rg).connect(soft.input);
      stoppers.push(() => rumble.stop());
    } else if (id === 'library') {
      attachNoise('pink', filter(ctx, 'lowpass', 380), 0.035);
    } else {
      attachNoise('pink', filter(ctx, 'lowpass', 200), 0.07);
      const hum = tone(ctx, 62, 'sine');
      const hg = ctx.createGain();
      hg.gain.value = 0.014;
      hum.connect(hg).connect(soft.input);
      stoppers.push(() => hum.stop());
    }

    master.gain.setTargetAtTime(Math.max(0.02, Math.min(0.7, volume01 * 0.55)), ctx.currentTime, 0.1);
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

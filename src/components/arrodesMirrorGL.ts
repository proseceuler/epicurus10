import type { ArrodesVoiceMode } from '@/components/ArrodesVoiceMirror';

export interface Bands { amp: number; bass: number; mid: number; treble: number; }
export const EMPTY: Bands = { amp: 0, bass: 0, mid: 0, treble: 0 };

export function draw(
  gl: WebGLRenderingContext,
  prog: WebGLProgram,
  canvas: HTMLCanvasElement,
  time: number,
  mode: ArrodesVoiceMode,
  bands: Bands,
  hover: number,
  hoverPt: { x: number; y: number },
  splash: { t: number; x: number; y: number },
) {
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.useProgram(prog);
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.uniform2f(gl.getUniformLocation(prog, 'uRes'), canvas.width, canvas.height);
  gl.uniform1f(gl.getUniformLocation(prog, 'uTime'), time);
  const modeId = mode === 'listening' ? 1 : mode === 'thinking' ? 2 : mode === 'speaking' ? 3 : 0;
  gl.uniform1f(gl.getUniformLocation(prog, 'uMode'), modeId);
  const pulse = proceduralPulse(time, mode);
  gl.uniform1f(gl.getUniformLocation(prog, 'uAmp'), clamp01(bands.amp * 0.85 + pulse.amp));
  gl.uniform1f(gl.getUniformLocation(prog, 'uBass'), clamp01(bands.bass * 0.8 + pulse.bass));
  gl.uniform1f(gl.getUniformLocation(prog, 'uMid'), clamp01(bands.mid * 0.8 + pulse.mid));
  gl.uniform1f(gl.getUniformLocation(prog, 'uTreble'), clamp01(bands.treble * 0.8 + pulse.treble));
  gl.uniform1f(gl.getUniformLocation(prog, 'uHover'), hover);
  gl.uniform2f(gl.getUniformLocation(prog, 'uHoverOrigin'), hoverPt.x, hoverPt.y);
  gl.uniform1f(gl.getUniformLocation(prog, 'uSplash'), time - splash.t);
  gl.uniform2f(gl.getUniformLocation(prog, 'uSplashOrigin'), splash.x, splash.y);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function proceduralPulse(t: number, mode: ArrodesVoiceMode) {
  if (mode === 'idle') return { amp: 0.08 + 0.04 * Math.sin(t * 0.7), bass: 0.1, mid: 0.07, treble: 0.04 };
  if (mode === 'thinking') {
    return {
      amp: 0.24 + 0.1 * Math.sin(t * 2.1),
      bass: 0.38 + 0.2 * Math.sin(t * 1.4),
      mid: 0.42 + 0.22 * Math.sin(t * 3.2 + 1),
      treble: 0.3 + 0.18 * Math.sin(t * 5.1),
    };
  }
  if (mode === 'speaking') {
    const env = 0.45 + 0.35 * Math.abs(Math.sin(t * 6.2)) * (0.55 + 0.45 * Math.sin(t * 2.7));
    return { amp: env, bass: 0.38 + 0.38 * Math.abs(Math.sin(t * 4.1)), mid: 0.32 + 0.42 * Math.abs(Math.sin(t * 9.3 + 0.4)), treble: 0.22 + 0.45 * Math.abs(Math.sin(t * 14.0 + 1.2)) };
  }
  return { amp: 0.14, bass: 0.16, mid: 0.12, treble: 0.1 };
}

export function listenMic(mode: ArrodesVoiceMode, onBands: (b: Bands) => void) {
  if (mode !== 'listening') { onBands(EMPTY); return; }
  let stopped = false;
  let stream: MediaStream | null = null;
  let ctx: AudioContext | null = null;
  let raf = 0;
  const run = async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
      ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      src.connect(analyser);
      const freq = new Uint8Array(analyser.frequencyBinCount);
      const time = new Uint8Array(analyser.fftSize);
      const tick = () => {
        if (stopped) return;
        raf = requestAnimationFrame(tick);
        analyser.getByteFrequencyData(freq);
        analyser.getByteTimeDomainData(time);
        onBands(bandsFromAnalyser(freq, time));
      };
      tick();
    } catch { onBands(EMPTY); }
  };
  void run();
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop());
    void ctx?.close();
    onBands(EMPTY);
  };
}

function bandsFromAnalyser(freq: Uint8Array, time: Uint8Array): Bands {
  let rms = 0;
  for (let i = 0; i < time.length; i++) {
    const v = (time[i] - 128) / 128;
    rms += v * v;
  }
  rms = Math.sqrt(rms / time.length);
  const slice = (from: number, to: number) => {
    let s = 0;
    const a = Math.max(0, from);
    const b = Math.min(freq.length, to);
    for (let i = a; i < b; i++) s += freq[i];
    return b > a ? s / ((b - a) * 255) : 0;
  };
  return { amp: clamp01(rms * 3.2), bass: clamp01(slice(1, 6) * 1.6), mid: clamp01(slice(6, 24) * 1.8), treble: clamp01(slice(24, 80) * 2.1) };
}

export function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { gl.deleteShader(sh); return null; }
  return sh;
}

function clamp01(n: number) { return Math.max(0, Math.min(1, n)); }

export const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

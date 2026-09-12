import { useEffect, useRef } from 'react';
import { ARRODES_FRAME, ARRODES_HOLE_MASK } from '@/components/arrodesFrame';

export type ArrodesVoiceMode = 'idle' | 'listening' | 'thinking' | 'speaking';

interface Bands {
  amp: number;
  bass: number;
  mid: number;
  treble: number;
}

const EMPTY: Bands = { amp: 0, bass: 0, mid: 0, treble: 0 };

export default function ArrodesVoiceMirror({
  mode,
  active,
  expanded,
  onToggleExpand,
}: {
  mode: ArrodesVoiceMode;
  active: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bandsRef = useRef<Bands>(EMPTY);
  const modeRef = useRef(mode);
  const rafRef = useRef(0);
  const startRef = useRef(0);

  modeRef.current = mode;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: true });
    if (!gl) return;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const resize = () => {
      const el = wrapRef.current;
      if (!el) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.floor(el.clientWidth * dpr));
      const h = Math.max(1, Math.floor(el.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };

    startRef.current = performance.now();
    const tick = (now: number) => {
      rafRef.current = requestAnimationFrame(tick);
      resize();
      draw(gl, prog, canvas, (now - startRef.current) / 1000, modeRef.current, bandsRef.current);
    };
    rafRef.current = requestAnimationFrame(tick);
    resize();

    return () => {
      cancelAnimationFrame(rafRef.current);
      gl.deleteProgram(prog);
    };
  }, []);

  useEffect(() => listenMic(mode, (bands) => { bandsRef.current = bands; }), [mode]);

  return (
    <div
      className="arrodes-stage"
      data-mode={mode}
      data-active={active ? '1' : '0'}
      data-expanded={expanded ? '1' : '0'}
    >
      <div
        ref={wrapRef}
        className="arrodes-well"
        role="button"
        tabIndex={0}
        onClick={onToggleExpand}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggleExpand?.(); }}
        title={expanded ? 'Shrink mirror' : 'Enlarge mirror'}
      >
        <canvas
          ref={canvasRef}
          className="arrodes-blob"
          style={{ WebkitMaskImage: `url("${ARRODES_HOLE_MASK}")`, maskImage: `url("${ARRODES_HOLE_MASK}")` }}
        />
        <div
          className="arrodes-glass"
          aria-hidden
          style={{ WebkitMaskImage: `url("${ARRODES_HOLE_MASK}")`, maskImage: `url("${ARRODES_HOLE_MASK}")` }}
        />
        <img className="arrodes-frame" src={ARRODES_FRAME} alt="" draggable={false} />
      </div>
    </div>
  );
}

function draw(
  gl: WebGLRenderingContext,
  prog: WebGLProgram,
  canvas: HTMLCanvasElement,
  time: number,
  mode: ArrodesVoiceMode,
  bands: Bands,
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
    return {
      amp: env,
      bass: 0.38 + 0.38 * Math.abs(Math.sin(t * 4.1)),
      mid: 0.32 + 0.42 * Math.abs(Math.sin(t * 9.3 + 0.4)),
      treble: 0.22 + 0.45 * Math.abs(Math.sin(t * 14.0 + 1.2)),
    };
  }
  return { amp: 0.14, bass: 0.16, mid: 0.12, treble: 0.1 };
}

function listenMic(mode: ArrodesVoiceMode, onBands: (b: Bands) => void) {
  if (mode !== 'listening') {
    onBands(EMPTY);
    return;
  }
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
    } catch {
      onBands(EMPTY);
    }
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
  return {
    amp: clamp01(rms * 3.2),
    bass: clamp01(slice(1, 6) * 1.6),
    mid: clamp01(slice(6, 24) * 1.8),
    treble: clamp01(slice(24, 80) * 2.1),
  };
}

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

const VERT = `
attribute vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uMode;
uniform float uAmp;
uniform float uBass;
uniform float uMid;
uniform float uTreble;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 6; i++) { v += a * noise(p); p *= 2.03; a *= 0.52; }
  return v;
}
mat2 rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = (uv - 0.5) * vec2(1.08, 1.22);
  float t = uTime;
  float listen = smoothstep(0.4, 1.4, uMode) * (1.0 - smoothstep(1.4, 2.4, uMode));
  float think  = smoothstep(1.4, 2.4, uMode) * (1.0 - smoothstep(2.4, 3.4, uMode));
  float speak  = smoothstep(2.4, 3.4, uMode);

  vec2 q = p;
  if (think > 0.01) {
    q = rot(t * (0.85 + uMid * 0.55) * think) * q;
    q += normalize(q + 0.0001) * (-0.08 * think * sin(t * 2.8 + length(q) * 9.0));
  }
  if (speak > 0.01) q *= 1.0 - 0.04 * speak * uAmp;

  float flow = t * (0.14 + listen * 0.10 + speak * 0.24);
  vec2 field = q * (2.15 + uBass * 1.4 + speak * 0.7) + vec2(flow, -flow * 0.68);
  field += vec2(fbm(field + t * 0.16), fbm(field.yx - t * 0.13)) * (0.32 + uMid * 0.42);
  float n = fbm(field);
  float n2 = fbm(field * 2.35 - vec2(t * 0.22, t * 0.31));
  float sheet = fbm(q * vec2(1.55, 2.05) + vec2(t * 0.11, -t * 0.08));
  float rip = sin((q.y * 11.0 + q.x * 3.2) - t * (1.5 + uBass * 4.2) + n * 6.0);
  float rings = sin(length(q) * (13.0 + uBass * 16.0) - t * (2.1 + uBass * 3.6)) * 0.5 + 0.5;
  float h = n * 0.55 + n2 * 0.26 + rip * (0.05 + uBass * 0.09 + speak * 0.07) + uAmp * 0.14;

  vec3 slate = vec3(0.27, 0.28, 0.30);
  vec3 steel = vec3(0.50, 0.52, 0.54);
  vec3 mercury = vec3(0.66, 0.68, 0.70);
  vec3 silver = vec3(0.80, 0.81, 0.83);
  vec3 gleam = vec3(0.94, 0.94, 0.95);

  vec3 pane = mix(slate, steel, smoothstep(0.18, 0.55, h));
  pane = mix(pane, mercury, smoothstep(0.42, 0.78, h + sheet * 0.12));
  pane = mix(pane, silver, smoothstep(0.62, 0.92, h));
  pane = mix(pane, gleam, pow(smoothstep(0.74, 1.08, h + speak * 0.08), 1.7));

  float spec = pow(max(0.0, 1.0 - abs(h - 0.76 - uAmp * 0.1)), 10.0);
  spec += pow(max(0.0, sin(uv.x * 7.0 + n * 5.0 - t * 0.9) * 0.5 + 0.5), 14.0) * 0.32;
  pane += gleam * spec * (0.28 + speak * 0.22 + listen * 0.10);

  float radius = 0.34 + 0.05 * listen + 0.04 * think + 0.07 * speak + uAmp * 0.09 + uBass * 0.035;
  float disp = (n - 0.5) * (0.05 + uMid * 0.07 + think * 0.04)
             + (n2 - 0.5) * (0.02 + uTreble * 0.035)
             + (rings - 0.5) * (0.014 + uBass * 0.025);
  float d = length(p) - radius - disp;
  float glow = exp(-2.6 * max(d + 0.20, 0.0));
  float core = smoothstep(0.10, -0.05, d);
  float rim = smoothstep(0.065, 0.0, abs(d) - 0.014);

  vec3 orb = mix(slate, mercury, 0.40 + 0.55 * n);
  orb = mix(orb, silver, 0.20 + 0.32 * sheet + 0.18 * n2);
  orb = mix(orb, gleam, 0.16 * speak * uAmp + 0.10 * rings);

  vec3 col = pane;
  col = mix(col, orb, core * 0.92);
  col += gleam * rim * (0.26 + 0.38 * speak);
  col += mercury * glow * (0.18 + 0.16 * (1.0 - speak));
  col += gleam * pow(glow, 2.15) * (0.08 + 0.22 * speak * uAmp);

  float vignette = smoothstep(1.05, 0.28, length((uv - 0.5) * vec2(1.05, 1.18)));
  col *= 0.78 + 0.22 * vignette;

  gl_FragColor = vec4(col, 1.0);
}
`;

import { useEffect, useRef } from 'react';

export type ArrodesVoiceMode = 'idle' | 'listening' | 'thinking' | 'speaking';

interface Bands {
  amp: number;
  bass: number;
  mid: number;
  treble: number;
}

const EMPTY: Bands = { amp: 0, bass: 0, mid: 0, treble: 0 };

const GLASS = 'M50 22 C62 14 80 12 100 14 C120 12 138 14 150 22 C164 28 172 42 170 58 C178 72 178 90 172 106 C178 122 176 140 166 154 C172 168 166 184 152 194 C156 208 142 220 126 224 C114 232 86 232 74 224 C58 220 44 208 48 194 C34 184 28 168 34 154 C24 140 22 122 28 106 C22 90 22 72 30 58 C28 42 36 28 50 22 Z';

export default function ArrodesVoiceMirror({
  mode,
  caption,
  active,
}: {
  mode: ArrodesVoiceMode;
  caption?: string;
  active: boolean;
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
    const gl = canvas.getContext('webgl', { alpha: false, antialias: true, premultipliedAlpha: true });
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
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    };
    startRef.current = performance.now();
    const tick = (now: number) => {
      rafRef.current = requestAnimationFrame(tick);
      resize();
      draw(gl, prog, canvas, (now - startRef.current) / 1000, modeRef.current, bandsRef.current);
    };
    rafRef.current = requestAnimationFrame(tick);
    resize();
    return () => { cancelAnimationFrame(rafRef.current); gl.deleteProgram(prog); };
  }, []);

  useEffect(() => listenMic(mode, (bands) => { bandsRef.current = bands; }), [mode]);

  return (
    <div className="arrodes-stage" data-mode={mode} data-active={active ? '1' : '0'}>
      <div ref={wrapRef} className="arrodes-well">
        <canvas ref={canvasRef} className="arrodes-blob" />
        <svg className="arrodes-frame" viewBox="0 0 200 268" aria-hidden>
          <defs>
            <linearGradient id="arrodes-rim" x1="0.15" y1="0" x2="0.9" y2="1">
              <stop offset="0%" stopColor="#f4f4f5" />
              <stop offset="38%" stopColor="#d4d4d8" />
              <stop offset="70%" stopColor="#a1a1aa" />
              <stop offset="100%" stopColor="#52525b" />
            </linearGradient>
            <linearGradient id="arrodes-metal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ececef" />
              <stop offset="55%" stopColor="#b4b4bb" />
              <stop offset="100%" stopColor="#7a7a84" />
            </linearGradient>
            <radialGradient id="arrodes-gem" cx="38%" cy="32%" r="70%">
              <stop offset="0%" stopColor="#3f3f46" />
              <stop offset="55%" stopColor="#18181b" />
              <stop offset="100%" stopColor="#09090b" />
            </radialGradient>
          </defs>
          <path d="M100 4 L100 14" stroke="url(#arrodes-rim)" strokeWidth="3.2" strokeLinecap="round" />
          <circle cx="100" cy="4" r="2.4" fill="#d4d4d8" stroke="#71717a" strokeWidth="0.8" />
          <path fillRule="evenodd" d={`M100 14 C112 14 124 18 134 28 C148 24 164 30 172 44 C184 52 188 70 182 86 C190 102 190 122 182 138 C190 156 186 176 174 190 C180 206 172 224 156 232 C146 246 124 256 100 258 C76 256 54 246 44 232 C28 224 20 206 26 190 C14 176 10 156 18 138 C10 122 10 102 18 86 C12 70 16 52 28 44 C36 30 52 24 66 28 C76 18 88 14 100 14 Z ${GLASS}`} fill="url(#arrodes-metal)" stroke="url(#arrodes-rim)" strokeWidth="2.2" strokeLinejoin="round" />
          <path d={GLASS} fill="none" stroke="rgba(24,24,27,0.22)" strokeWidth="1" />
          <g className="arrodes-eye arrodes-eye--w">
            <path d="M18 128 C8 128 6 142 16 148 C28 154 44 150 52 142 C44 132 30 126 18 128 Z" fill="url(#arrodes-metal)" stroke="url(#arrodes-rim)" strokeWidth="1.6" />
            <path d="M22 136 C16 136 16 144 22 146 C32 148 42 144 46 140 C40 134 30 132 22 136 Z" fill="none" stroke="rgba(24,24,27,0.35)" strokeWidth="0.9" />
            <circle cx="30" cy="140" r="7.2" fill="url(#arrodes-gem)" />
            <circle cx="28" cy="138" r="1.8" fill="rgba(244,244,245,0.45)" />
            <path d="M48 120 C54 112 62 116 60 126" fill="none" stroke="url(#arrodes-rim)" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M48 156 C54 164 62 160 60 150" fill="none" stroke="url(#arrodes-rim)" strokeWidth="1.6" strokeLinecap="round" />
          </g>
          <g className="arrodes-eye arrodes-eye--e">
            <path d="M182 128 C192 128 194 142 184 148 C172 154 156 150 148 142 C156 132 170 126 182 128 Z" fill="url(#arrodes-metal)" stroke="url(#arrodes-rim)" strokeWidth="1.6" />
            <path d="M178 136 C184 136 184 144 178 146 C168 148 158 144 154 140 C160 134 170 132 178 136 Z" fill="none" stroke="rgba(24,24,27,0.35)" strokeWidth="0.9" />
            <circle cx="170" cy="140" r="7.2" fill="url(#arrodes-gem)" />
            <circle cx="168" cy="138" r="1.8" fill="rgba(244,244,245,0.45)" />
            <path d="M152 120 C146 112 138 116 140 126" fill="none" stroke="url(#arrodes-rim)" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M152 156 C146 164 138 160 140 150" fill="none" stroke="url(#arrodes-rim)" strokeWidth="1.6" strokeLinecap="round" />
          </g>
          <path d="M100 258 L100 264" stroke="url(#arrodes-rim)" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      </div>
      {caption ? <p className="arrodes-caption">{caption}</p> : null}
    </div>
  );
}

function draw(gl: WebGLRenderingContext, prog: WebGLProgram, canvas: HTMLCanvasElement, time: number, mode: ArrodesVoiceMode, bands: Bands) {
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.useProgram(prog);
  gl.disable(gl.BLEND);
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
  if (mode === 'idle') return { amp: 0.08 + 0.04 * Math.sin(t * 0.55), bass: 0.12, mid: 0.08, treble: 0.05 };
  if (mode === 'thinking') return { amp: 0.28 + 0.1 * Math.sin(t * 1.8), bass: 0.4 + 0.2 * Math.sin(t * 1.2), mid: 0.45 + 0.2 * Math.sin(t * 2.6 + 1), treble: 0.3 + 0.15 * Math.sin(t * 4.4) };
  if (mode === 'speaking') {
    const env = 0.42 + 0.38 * Math.abs(Math.sin(t * 5.6)) * (0.5 + 0.5 * Math.sin(t * 2.3));
    return { amp: env, bass: 0.4 + 0.35 * Math.abs(Math.sin(t * 3.6)), mid: 0.35 + 0.4 * Math.abs(Math.sin(t * 8.2 + 0.4)), treble: 0.25 + 0.4 * Math.abs(Math.sin(t * 13.0)) };
  }
  return { amp: 0.14, bass: 0.18, mid: 0.14, treble: 0.1 };
}

function listenMic(mode: ArrodesVoiceMode, onBands: (b: Bands) => void) {
  if (mode !== 'listening') { onBands(EMPTY); return; }
  let stopped = false; let stream: MediaStream | null = null; let ctx: AudioContext | null = null; let raf = 0;
  const run = async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
      ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.72; src.connect(analyser);
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
  return () => { stopped = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); void ctx?.close(); onBands(EMPTY); };
}

function bandsFromAnalyser(freq: Uint8Array, time: Uint8Array): Bands {
  let rms = 0;
  for (let i = 0; i < time.length; i++) { const v = (time[i] - 128) / 128; rms += v * v; }
  rms = Math.sqrt(rms / time.length);
  const slice = (from: number, to: number) => {
    let s = 0; const a = Math.max(0, from); const b = Math.min(freq.length, to);
    for (let i = a; i < b; i++) s += freq[i];
    return b > a ? s / ((b - a) * 255) : 0;
  };
  return { amp: clamp01(rms * 3.2), bass: clamp01(slice(1, 6) * 1.6), mid: clamp01(slice(6, 24) * 1.8), treble: clamp01(slice(24, 80) * 2.1) };
}

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src); gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { gl.deleteShader(sh); return null; }
  return sh;
}
function clamp01(n: number) { return Math.max(0, Math.min(1, n)); }

const VERT = `attribute vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;
const FRAG = `precision highp float;
uniform vec2 uRes; uniform float uTime; uniform float uMode; uniform float uAmp; uniform float uBass; uniform float uMid; uniform float uTreble;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); float a = hash(i); float b = hash(i + vec2(1.0, 0.0)); float c = hash(i + vec2(0.0, 1.0)); float d = hash(i + vec2(1.0, 1.0)); vec2 u = f * f * (3.0 - 2.0 * f); return mix(mix(a, b, u.x), mix(c, d, u.x), u.y); }
float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 6; i++) { v += a * noise(p); p *= 2.05; a *= 0.52; } return v; }
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
void main() {
  vec2 uv = gl_FragCoord.xy / uRes; vec2 p = (uv - 0.5) * vec2(1.15, 1.35); float t = uTime;
  float listen = smoothstep(0.4, 1.4, uMode) * (1.0 - smoothstep(1.4, 2.4, uMode));
  float think  = smoothstep(1.4, 2.4, uMode) * (1.0 - smoothstep(2.4, 3.4, uMode));
  float speak  = smoothstep(2.4, 3.4, uMode);
  if (think > 0.01) { p = rot(t * (0.55 + uMid * 0.4) * think) * p; p += normalize(p + 0.0001) * (-0.06 * think * sin(t * 2.2 + length(p) * 8.0)); }
  float flow = t * (0.12 + listen * 0.08 + speak * 0.22);
  vec2 q = p * (2.3 + uBass * 1.6 + speak * 0.8) + vec2(flow, -flow * 0.7);
  q += vec2(fbm(q + t * 0.15), fbm(q.yx - t * 0.12)) * (0.35 + uMid * 0.45);
  float n = fbm(q); float n2 = fbm(q * 2.4 - vec2(t * 0.2, t * 0.31));
  float rip = sin((p.y * 10.0 + p.x * 3.0) - t * (1.4 + uBass * 4.0) + n * 6.0);
  float h = n * 0.62 + n2 * 0.28 + rip * (0.06 + uBass * 0.1 + speak * 0.08) + uAmp * 0.16;
  vec3 slate = vec3(0.28, 0.29, 0.31); vec3 steel = vec3(0.52, 0.54, 0.56); vec3 silver = vec3(0.78, 0.79, 0.81); vec3 gleam = vec3(0.93, 0.93, 0.94);
  vec3 col = mix(slate, steel, smoothstep(0.22, 0.58, h));
  col = mix(col, silver, smoothstep(0.52, 0.82, h));
  col = mix(col, gleam, pow(smoothstep(0.72, 1.05, h + speak * 0.08), 1.8));
  float spec = pow(max(0.0, 1.0 - abs(h - 0.78 - uAmp * 0.1)), 10.0);
  spec += pow(max(0.0, sin(uv.x * 7.0 + n * 5.0 - t * 0.9) * 0.5 + 0.5), 14.0) * 0.35;
  col += gleam * spec * (0.35 + speak * 0.25 + listen * 0.12);
  float vignette = smoothstep(0.95, 0.35, length((uv - 0.5) * vec2(1.1, 1.25)));
  col *= 0.72 + 0.28 * vignette;
  gl_FragColor = vec4(col, 1.0);
}`;

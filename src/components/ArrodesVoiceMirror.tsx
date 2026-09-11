import { useEffect, useRef } from 'react';

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
      const t = (now - startRef.current) / 1000;
      draw(gl, prog, canvas, t, modeRef.current, bandsRef.current);
    };
    rafRef.current = requestAnimationFrame(tick);
    resize();

    return () => {
      cancelAnimationFrame(rafRef.current);
      gl.deleteProgram(prog);
    };
  }, []);

  useEffect(() => listenMic(mode, (bands) => { bandsRef.current = bands; }), [mode]);

  const label =
    mode === 'listening' ? 'Listening' :
    mode === 'thinking' ? 'Thinking' :
    mode === 'speaking' ? 'Speaking' :
    active ? 'Ready' : '';

  return (
    <div className="arrodes-stage" data-mode={mode} data-active={active ? '1' : '0'}>
      <div ref={wrapRef} className="arrodes-well">
        <canvas ref={canvasRef} className="arrodes-blob" />
        <svg className="arrodes-frame" viewBox="0 0 320 380" aria-hidden>
          <defs>
            <linearGradient id="arrodes-rim" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#f4f4f5" />
              <stop offset="45%" stopColor="#a1a1aa" />
              <stop offset="100%" stopColor="#3f3f46" />
            </linearGradient>
            <radialGradient id="arrodes-gem" cx="40%" cy="35%" r="70%">
              <stop offset="0%" stopColor="#52525b" />
              <stop offset="70%" stopColor="#18181b" />
              <stop offset="100%" stopColor="#09090b" />
            </radialGradient>
          </defs>
          <path className="arrodes-silhouette" d="M160 18 C176 18 188 28 198 42 L214 58 C228 70 246 74 262 70 C274 80 278 98 270 114 L276 138 C284 158 286 180 278 204 L286 230 C292 252 286 274 270 290 L248 324 C232 348 200 366 160 368 C120 366 88 348 72 324 L50 290 C34 274 28 252 34 230 L42 204 C34 180 36 158 44 138 L50 114 C42 98 46 80 58 70 C74 74 92 70 106 58 L122 42 C132 28 144 18 160 18 Z" fill="none" stroke="url(#arrodes-rim)" strokeWidth="5.5" strokeLinejoin="round" />
          <path d="M160 32 C174 32 184 40 192 52 L206 66 C218 76 234 80 248 76 C258 86 260 100 254 112 L260 134 C266 152 268 172 262 194 L268 218 C272 236 266 254 254 268 L234 298 C220 320 192 336 160 338 C128 336 100 320 86 298 L66 268 C54 254 48 236 52 218 L58 194 C52 172 54 152 60 134 L66 112 C60 100 62 86 72 76 C86 80 102 76 114 66 L128 52 C136 40 146 32 160 32 Z" fill="rgba(9,9,11,0.55)" stroke="rgba(244,244,245,0.28)" strokeWidth="1.2" />
          <g className="arrodes-eye arrodes-eye--nw">
            <path d="M78 118 C92 96 124 92 142 108 C128 122 104 128 86 124 Z" fill="none" stroke="url(#arrodes-rim)" strokeWidth="2.4" />
            <path d="M90 106 C102 98 120 100 128 110 C116 118 100 118 90 106 Z" fill="none" stroke="rgba(244,244,245,0.45)" strokeWidth="1.2" />
            <circle cx="108" cy="110" r="11" fill="url(#arrodes-gem)" />
            <circle cx="104" cy="106" r="3.2" fill="rgba(244,244,245,0.35)" />
          </g>
          <g className="arrodes-eye arrodes-eye--se">
            <path d="M242 248 C228 270 196 276 178 260 C192 246 216 240 234 244 Z" fill="none" stroke="url(#arrodes-rim)" strokeWidth="2.4" />
            <path d="M230 260 C218 268 200 266 192 256 C204 248 220 248 230 260 Z" fill="none" stroke="rgba(244,244,245,0.45)" strokeWidth="1.2" />
            <circle cx="212" cy="256" r="11" fill="url(#arrodes-gem)" />
            <circle cx="208" cy="252" r="3.2" fill="rgba(244,244,245,0.35)" />
          </g>
          <path d="M160 18 L160 8 M72 324 L60 338 M248 324 L260 338 M58 70 L46 58 M262 70 L274 58" stroke="url(#arrodes-rim)" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </div>
      <div className="arrodes-caption">
        <span className="arrodes-caption-dot" data-mode={mode} />
        <p>{caption?.trim() || label}</p>
      </div>
    </div>
  );
}

function draw(gl: WebGLRenderingContext, prog: WebGLProgram, canvas: HTMLCanvasElement, time: number, mode: ArrodesVoiceMode, bands: Bands) {
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
  if (mode === 'idle') return { amp: 0.06 + 0.04 * Math.sin(t * 0.7), bass: 0.08, mid: 0.05, treble: 0.03 };
  if (mode === 'thinking') return { amp: 0.22 + 0.08 * Math.sin(t * 2.1), bass: 0.35 + 0.2 * Math.sin(t * 1.4), mid: 0.4 + 0.25 * Math.sin(t * 3.2 + 1), treble: 0.3 + 0.2 * Math.sin(t * 5.1) };
  if (mode === 'speaking') {
    const env = 0.45 + 0.35 * Math.abs(Math.sin(t * 6.2)) * (0.55 + 0.45 * Math.sin(t * 2.7));
    return { amp: env, bass: 0.35 + 0.4 * Math.abs(Math.sin(t * 4.1)), mid: 0.3 + 0.45 * Math.abs(Math.sin(t * 9.3 + 0.4)), treble: 0.2 + 0.5 * Math.abs(Math.sin(t * 14.0 + 1.2)) };
  }
  return { amp: 0.1, bass: 0.12, mid: 0.1, treble: 0.08 };
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
  return { amp: clamp01(rms * 3.2), bass: clamp01(slice(1, 6) * 1.6), mid: clamp01(slice(6, 24) * 1.8), treble: clamp01(slice(24, 80) * 2.1) };
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
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}
mat2 rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);
  float t = uTime;
  float listen = smoothstep(0.4, 1.4, uMode) * (1.0 - smoothstep(1.4, 2.4, uMode));
  float think  = smoothstep(1.4, 2.4, uMode) * (1.0 - smoothstep(2.4, 3.4, uMode));
  float speak  = smoothstep(2.4, 3.4, uMode);
  vec2 p = uv;
  p.y += 0.02;
  if (think > 0.01) {
    float spin = t * (1.6 + uMid);
    p = rot(spin * think) * p;
    float r = length(p) + 0.0001;
    p += normalize(p) * (-0.12 * think * sin(t * 3.4 + r * 10.0));
  }
  if (speak > 0.01) p *= 1.0 - 0.08 * speak * uAmp;
  float n = fbm(p * (2.4 + uTreble * 2.8) + vec2(t * 0.22, t * 0.17));
  float n2 = fbm(p * 5.5 - vec2(t * 0.41, -t * 0.29));
  float ripples = sin(length(p) * (18.0 + uBass * 22.0) - t * (2.2 + uBass * 4.0)) * 0.5 + 0.5;
  float radius = 0.18 + 0.04 * listen + 0.03 * think + 0.07 * speak + uAmp * (0.10 + 0.10 * speak) + uBass * 0.05;
  float disp = (n - 0.5) * (0.05 + uMid * 0.08 + think * 0.06) + (n2 - 0.5) * (0.02 + uTreble * 0.05) + (ripples - 0.5) * (0.012 + uBass * 0.03);
  float d = length(p) - radius - disp;
  float glow = exp(-3.2 * max(d + 0.12, 0.0));
  float core = smoothstep(0.045, -0.02, d);
  float rim = smoothstep(0.06, 0.0, abs(d) - 0.012);
  float mist = (1.0 - core) * glow * (0.18 + 0.22 * (1.0 - speak));
  vec3 mercury = vec3(0.72, 0.75, 0.78);
  vec3 ghost = vec3(0.93, 0.94, 0.96);
  vec3 voidc = vec3(0.05, 0.05, 0.06);
  vec3 shade = mix(voidc, mercury, 0.55 + 0.45 * n);
  shade = mix(shade, ghost, 0.25 + 0.45 * speak * uAmp + 0.2 * n2);
  vec3 col = vec3(0.0);
  col += shade * core;
  col += ghost * rim * (0.35 + 0.45 * speak);
  col += mercury * mist;
  col += ghost * pow(glow, 2.4) * (0.12 + 0.28 * speak * uAmp);
  float alpha = clamp(core * 0.96 + glow * 0.55 + mist * 0.4, 0.0, 1.0);
  alpha *= 0.55 + 0.45 * (listen + think + speak);
  alpha = max(alpha, glow * 0.22);
  gl_FragColor = vec4(col, alpha);
}
`;

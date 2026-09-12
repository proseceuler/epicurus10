export const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uMode;
uniform float uAmp;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uHover;
uniform vec2 uHoverOrigin;
uniform float uSplash;
uniform vec2 uSplashOrigin;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  float a = hash(i); float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0)); float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 6; i++) { v += a * noise(p); p *= 2.03; a *= 0.52; } return v; }
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = (uv - 0.5) * vec2(1.08, 1.22);
  float t = uTime;
  float listen = smoothstep(0.4, 1.4, uMode) * (1.0 - smoothstep(1.4, 2.4, uMode));
  float think  = smoothstep(1.4, 2.4, uMode) * (1.0 - smoothstep(2.4, 3.4, uMode));
  float speak  = smoothstep(2.4, 3.4, uMode);
  float hover = clamp(uHover, 0.0, 1.0);
  float age = max(uSplash, 0.0);
  float splash = exp(-age * 1.55) * step(age, 3.2);
  vec2 q = p;
  q.y *= 1.0 + splash * 0.62 * exp(-age * 1.15);
  q.x *= 1.0 - splash * 0.28 * exp(-age * 1.25);
  if (think > 0.01) {
    q = rot(t * (0.85 + uMid * 0.55) * think) * q;
    q += normalize(q + 0.0001) * (-0.08 * think * sin(t * 2.8 + length(q) * 9.0));
  }
  if (speak > 0.01) q *= 1.0 - 0.04 * speak * uAmp;
  float flow = t * (0.14 + listen * 0.10 + speak * 0.24 + hover * 0.04);
  vec2 field = q * (2.15 + uBass * 1.4 + speak * 0.7) + vec2(flow, -flow * 0.68);
  field += vec2(fbm(field + t * 0.16), fbm(field.yx - t * 0.13)) * (0.32 + uMid * 0.42);
  float n = fbm(field);
  float n2 = fbm(field * 2.35 - vec2(t * 0.22, t * 0.31));
  float sheet = fbm(q * vec2(1.55, 2.05) + vec2(t * 0.11, -t * 0.08));
  float rip = sin((q.y * 11.0 + q.x * 3.2) - t * (1.5 + uBass * 4.2) + n * 6.0);
  float rings = sin(length(q) * (13.0 + uBass * 16.0) - t * (2.1 + uBass * 3.6)) * 0.5 + 0.5;
  float h = n * 0.55 + n2 * 0.26 + rip * (0.05 + uBass * 0.09 + speak * 0.07) + uAmp * 0.14;
  vec2 so = uSplashOrigin;
  float dSplash = distance(uv, so);
  float wave = sin((dSplash - age * 0.55) * 38.0) * exp(-dSplash * 2.2) * splash;
  float ring2 = sin((dSplash - age * 0.38) * 22.0) * exp(-dSplash * 1.6) * splash;
  h += wave * 0.42 + ring2 * 0.22;
  vec2 ho = uHoverOrigin;
  float dHover = distance(uv, ho);
  float gleamBand = exp(-dHover * 6.2) * hover * 0.22;
  vec3 slate = vec3(0.27, 0.28, 0.30);
  vec3 steel = vec3(0.50, 0.52, 0.54);
  vec3 mercury = vec3(0.66, 0.68, 0.70);
  vec3 silver = vec3(0.80, 0.81, 0.83);
  vec3 gleam = vec3(0.90, 0.91, 0.92);
  vec3 pane = mix(slate, steel, smoothstep(0.18, 0.55, h));
  pane = mix(pane, mercury, smoothstep(0.42, 0.78, h + sheet * 0.12));
  pane = mix(pane, silver, smoothstep(0.62, 0.92, h));
  pane = mix(pane, gleam, pow(smoothstep(0.74, 1.08, h + speak * 0.08 + hover * 0.04), 1.7));
  float spec = pow(max(0.0, 1.0 - abs(h - 0.76 - uAmp * 0.1)), 10.0);
  spec += pow(max(0.0, sin(uv.x * 7.0 + n * 5.0 - t * 0.9) * 0.5 + 0.5), 14.0) * 0.22;
  spec += hover * pow(max(0.0, 1.0 - abs(uv.x - ho.x)), 8.0) * 0.12;
  pane += gleam * spec * (0.16 + speak * 0.12 + listen * 0.06 + hover * 0.08);
  pane += gleam * gleamBand;
  pane += gleam * abs(wave) * 0.55;
  float radius = 0.34 + 0.05 * listen + 0.04 * think + 0.07 * speak + uAmp * 0.09 + uBass * 0.035;
  radius += splash * 0.22 * exp(-age * 1.15);
  float disp = (n - 0.5) * (0.05 + uMid * 0.07 + think * 0.04) + (n2 - 0.5) * (0.02 + uTreble * 0.035) + (rings - 0.5) * (0.014 + uBass * 0.025) + wave * 0.045;
  float d = length(p * vec2(1.0 - splash * 0.22, 1.0 + splash * 0.38)) - radius - disp;
  float glow = exp(-2.6 * max(d + 0.20, 0.0));
  float core = smoothstep(0.10, -0.05, d);
  float rim = smoothstep(0.065, 0.0, abs(d) - 0.014);
  vec3 orb = mix(slate, mercury, 0.40 + 0.55 * n);
  orb = mix(orb, silver, 0.20 + 0.32 * sheet + 0.18 * n2 + hover * 0.04);
  orb = mix(orb, gleam, 0.16 * speak * uAmp + 0.10 * rings + hover * 0.03);
  vec3 col = pane;
  col = mix(col, orb, core * 0.92);
  col += gleam * rim * (0.18 + 0.28 * speak + hover * 0.05);
  col += mercury * glow * (0.18 + 0.16 * (1.0 - speak));
  col += gleam * pow(glow, 2.15) * (0.06 + 0.16 * speak * uAmp + splash * 0.14);
  float vignette = smoothstep(1.05, 0.28, length((uv - 0.5) * vec2(1.05, 1.18)));
  col *= 0.78 + 0.22 * vignette;
  gl_FragColor = vec4(col, 1.0);
}
`;

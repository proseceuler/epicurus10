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

  // THINKING: mercury liquid mixed clockwise (viscous swirl, not a rigid spin)
  float mixStrength = 0.0;
  float armHighlight = 0.0;
  if (think > 0.01) {
    float rad0 = length(q);
    float ang0 = atan(q.y, q.x);
    // Clockwise = decreasing angle over time; faster near center like stirred fluid
    float spinRate = 1.55 + uMid * 0.85;
    float spin = t * spinRate * think;
    float radialSpin = spin * (0.35 + 1.15 * smoothstep(0.48, 0.02, rad0));
    float ang = ang0 - radialSpin;
    float rad = rad0;
    // Folded mercury streams (mixing ribbons)
    float ribbons = sin(ang * 3.0 + rad * 11.0 - t * 2.4);
    float ribbons2 = sin(ang * 5.0 - rad * 7.0 + t * 1.7);
    rad += ribbons * 0.045 * think;
    rad += ribbons2 * 0.022 * think;
    // Secondary eddy for "mixing" rather than pure rotate
    float eddy = sin(ang * 2.0 - rad * 4.0 - t * 1.9) * 0.035 * think;
    vec2 polar = vec2(cos(ang), sin(ang)) * max(rad + eddy, 0.0);
    // Viscous domain warp along the swirl
    vec2 warp = vec2(
      fbm(polar * 2.8 + vec2(t * 0.35, -t * 0.22)),
      fbm(polar.yx * 2.8 - vec2(t * 0.28, t * 0.31))
    );
    q = polar + rot(-spin * 0.55) * (warp - 0.5) * (0.09 * think);
    // Thin bright filaments of liquid being folded
    mixStrength = think;
    armHighlight = pow(0.5 + 0.5 * ribbons, 4.0) * think;
    armHighlight += pow(0.5 + 0.5 * ribbons2, 6.0) * think * 0.55;
  }

  if (speak > 0.01) q *= 1.0 - 0.04 * speak * uAmp;
  float flow = t * (0.14 + listen * 0.10 + speak * 0.24 + hover * 0.04 + mixStrength * 0.08);
  vec2 field = q * (2.15 + uBass * 1.4 + speak * 0.7 + mixStrength * 0.55) + vec2(flow, -flow * 0.68);
  // Extra swirl advection while thinking
  if (mixStrength > 0.01) {
    field = rot(-t * 0.55 * mixStrength) * field;
    field += vec2(fbm(field * 1.4 + t * 0.4), fbm(field.yx * 1.4 - t * 0.35)) * (0.22 * mixStrength);
  }
  field += vec2(fbm(field + t * 0.16), fbm(field.yx - t * 0.13)) * (0.32 + uMid * 0.42);
  float n = fbm(field);
  float n2 = fbm(field * 2.35 - vec2(t * 0.22, t * 0.31));
  float sheet = fbm(q * vec2(1.55, 2.05) + vec2(t * 0.11, -t * 0.08));
  float rip = sin((q.y * 11.0 + q.x * 3.2) - t * (1.5 + uBass * 4.2) + n * 6.0);
  float rings = sin(length(q) * (13.0 + uBass * 16.0) - t * (2.1 + uBass * 3.6)) * 0.5 + 0.5;
  float h = n * 0.55 + n2 * 0.26 + rip * (0.05 + uBass * 0.09 + speak * 0.07) + uAmp * 0.14;
  h += armHighlight * 0.22;
  h += mixStrength * sheet * 0.12;
  vec2 so = uSplashOrigin;
  float dSplash = distance(uv, so);
  float wave = sin((dSplash - age * 0.55) * 38.0) * exp(-dSplash * 2.2) * splash;
  float ring2 = sin((dSplash - age * 0.38) * 22.0) * exp(-dSplash * 1.6) * splash;
  h += wave * 0.42 + ring2 * 0.22;
  vec2 ho = uHoverOrigin;
  float dHover = distance(uv, ho);
  float gleamBand = exp(-dHover * 6.2) * hover * 0.18;
  float gleamSweep = exp(-abs(uv.x - mix(0.22, ho.x, hover)) * 8.5) * hover * 0.14;
  vec3 slate = vec3(0.27, 0.28, 0.30);
  vec3 steel = vec3(0.50, 0.52, 0.54);
  vec3 mercury = vec3(0.66, 0.68, 0.70);
  vec3 silver = vec3(0.80, 0.81, 0.83);
  vec3 gleam = vec3(0.90, 0.91, 0.92);
  // Slightly cooler, wetter mercury while thinking
  vec3 thinkMerc = mix(mercury, vec3(0.72, 0.74, 0.76), mixStrength * 0.55);
  vec3 thinkSilver = mix(silver, vec3(0.88, 0.89, 0.91), mixStrength * 0.4);
  vec3 pane = mix(slate, steel, smoothstep(0.18, 0.55, h));
  pane = mix(pane, thinkMerc, smoothstep(0.42, 0.78, h + sheet * 0.12));
  pane = mix(pane, thinkSilver, smoothstep(0.62, 0.92, h));
  pane = mix(pane, gleam, pow(smoothstep(0.74, 1.08, h + speak * 0.08 + hover * 0.04 + mixStrength * 0.06), 1.7));
  float spec = pow(max(0.0, 1.0 - abs(h - 0.76 - uAmp * 0.1)), 10.0);
  spec += pow(max(0.0, sin(uv.x * 7.0 + n * 5.0 - t * 0.9) * 0.5 + 0.5), 14.0) * 0.22;
  spec += hover * pow(max(0.0, 1.0 - abs(uv.x - ho.x)), 8.0) * 0.12;
  // Liquid-metal specular folds along mix arms
  spec += armHighlight * 0.55;
  pane += gleam * spec * (0.16 + speak * 0.12 + listen * 0.06 + hover * 0.08 + mixStrength * 0.10);
  pane += gleam * (gleamBand + gleamSweep);
  pane += gleam * abs(wave) * 0.55;
  pane += thinkSilver * armHighlight * 0.18;
  float radius = 0.34 + 0.05 * listen + 0.04 * think + 0.07 * speak + uAmp * 0.09 + uBass * 0.035;
  radius += splash * 0.22 * exp(-age * 1.15);
  float disp = (n - 0.5) * (0.05 + uMid * 0.07 + think * 0.06) + (n2 - 0.5) * (0.02 + uTreble * 0.035) + (rings - 0.5) * (0.014 + uBass * 0.025) + wave * 0.045;
  disp += (armHighlight - 0.3) * 0.03 * mixStrength;
  float d = length(p * vec2(1.0 - splash * 0.22, 1.0 + splash * 0.38)) - radius - disp;
  float glow = exp(-2.6 * max(d + 0.20, 0.0));
  float core = smoothstep(0.10, -0.05, d);
  float rim = smoothstep(0.065, 0.0, abs(d) - 0.014);
  vec3 orb = mix(slate, thinkMerc, 0.40 + 0.55 * n);
  orb = mix(orb, thinkSilver, 0.20 + 0.32 * sheet + 0.18 * n2 + hover * 0.04 + armHighlight * 0.12);
  orb = mix(orb, gleam, 0.16 * speak * uAmp + 0.10 * rings + hover * 0.03 + mixStrength * 0.08);
  vec3 col = pane;
  col = mix(col, orb, core * 0.92);
  col += gleam * rim * (0.18 + 0.28 * speak + hover * 0.05 + mixStrength * 0.06);
  col += thinkMerc * glow * (0.18 + 0.16 * (1.0 - speak) + mixStrength * 0.08);
  col += gleam * pow(glow, 2.15) * (0.06 + 0.16 * speak * uAmp + splash * 0.14 + armHighlight * 0.08);
  float vignette = smoothstep(1.05, 0.28, length((uv - 0.5) * vec2(1.05, 1.18)));
  col *= 0.78 + 0.22 * vignette;
  gl_FragColor = vec4(col, 1.0);
}
`;

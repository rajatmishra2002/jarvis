// Small math / easing / hashing helpers shared by the whole engine.
export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const unlerp = (a, b, x) => clamp((x - a) / (b - a));
export const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const smoother = (t) => { t = clamp(t); return t * t * t * (t * (t * 6 - 15) + 10); };
export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t), 3);
export const easeInCubic = (t) => Math.pow(clamp(t), 3);
export const easeInOutCubic = (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const easeOutBack = (t, s = 1.70158) => { t = clamp(t) - 1; return t * t * ((s + 1) * t + s) + 1; };
export const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(t)));
export const easeOutElastic = (t) => { t = clamp(t); if (t === 0 || t === 1) return t; return Math.pow(2, -9 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1; };
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

// deterministic hash -> [0,1)
export function hash(n) {
  n = Math.imul(n ^ (n >>> 15), 2246822507) ^ Math.imul(n ^ (n >>> 13), 3266489909);
  n = Math.imul(n ^ (n >>> 16), 2246822507);
  return ((n ^ (n >>> 13)) >>> 0) / 4294967296;
}
export const hash2 = (a, b) => hash((a * 73856093) ^ (b * 19349663) ^ 0x9e3779b9);
export const hash3 = (a, b, c) => hash((a * 73856093) ^ (b * 19349663) ^ (c * 83492791) ^ 0x85ebca6b);

// smooth 1-D value noise, deterministic
export function noise1(x, seed = 0) {
  const i = Math.floor(x), f = x - i;
  const a = hash2(i, seed), b = hash2(i + 1, seed);
  return lerp(a, b, f * f * (3 - 2 * f)) * 2 - 1;
}
export function fbm1(x, seed = 0, oct = 3) {
  let s = 0, a = 0.5, f = 1;
  for (let o = 0; o < oct; o++) { s += a * noise1(x * f, seed + o * 17); a *= 0.5; f *= 2; }
  return s;
}

export function mixColor(c0, c1, t) {
  return [Math.round(lerp(c0[0], c1[0], t)), Math.round(lerp(c0[1], c1[1], t)), Math.round(lerp(c0[2], c1[2], t))];
}
export const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
export function hex(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

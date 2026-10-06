// Cinematic camera: hand-keyed path (Catmull-Rom through shots) + hit-driven punches / shake, and the projection.
import { clamp, lerp, DEG, hash2, noise1, fbm1, smooth } from './util.mjs';
import { HITS } from './state.mjs';

export const W = 1080, H = 1350;
export const SCALE = Number(process.env.SCALE || 1);   // preview scale (0.5 = half-res dev renders)

// [t, cx, cy, zoom(px/unit), roll(deg), pitch(deg), tension(0..1, 1 = hold/ease-stop)]
const KEYS = [
  [0.00, 4.00, 4.30, 138, -5, 16, 0],
  [1.60, 3.90, 4.65, 158, -3, 14, 0],
  [3.00, 3.62, 5.15, 188, -1, 12, 0.2],
  [3.64, 3.50, 5.55, 214, 0, 12, 0.6],
  [5.60, 3.50, 3.75, 204, 2, 12, 0],
  [6.81, 3.50, 3.15, 226, 1.5, 13, 0.6],
  [8.80, 3.05, 4.70, 210, -2, 13, 0],
  [10.28, 3.00, 5.40, 238, -2.5, 13, 0.6],
  [12.20, 4.10, 3.95, 216, 2.5, 14, 0],
  [13.46, 4.40, 3.45, 246, 3, 14, 0.6],
  [15.20, 4.05, 4.00, 292, 4, 15, 0],
  [17.30, 4.00, 3.95, 338, 5, 15, 0],
  [17.49, 4.05, 3.90, 350, 5, 15, 0.7],
  [19.62, 3.70, 4.30, 300, 2, 14, 0.4],
  [21.40, 4.00, 5.45, 288, -1, 13, 0.5],
  [22.60, 5.00, 1.90, 262, -18, 14, 0],
  [24.20, 4.10, 2.60, 300, -34, 13, 0],
  [25.45, 3.55, 3.30, 338, -45, 12, 0.2],
  [25.88, 3.00, 5.95, 184, -45, 10, 0.8],
  [26.74, 3.00, 6.00, 182, -42, 10, 0.9],
  [27.80, 3.60, 5.25, 205, -20, 22, 0],
  [30.00, 4.00, 4.65, 168, -8, 27, 0],
  [31.13, 3.40, 6.35, 302, -4, 22, 0.6],
  [33.00, 3.75, 6.00, 300, 1, 22, 0],
  [34.49, 4.30, 5.60, 332, 6, 22, 0.5],
  [35.31, 2.20, 4.95, 300, -5, 22, 0.5],
  [36.90, 4.95, 6.30, 410, 10, 24, 0.5],
  [36.93, 5.00, 6.35, 414, 10, 24, 0.9],
  [39.00, 4.75, 6.70, 336, -6, 24, 0.7],
  [41.00, 5.35, 6.85, 276, 3, 28, 0],
  [43.30, 5.75, 6.55, 312, 6, 26, 0],
  [45.00, 6.00, 6.35, 340, 2, 24, 0],
  [46.30, 6.15, 6.35, 378, 0, 22, 0.5],
  [46.39, 6.15, 6.35, 390, 0, 22, 0.9],
  [46.93, 6.20, 6.80, 380, 0, 22, 0.9],
  [47.55, 4.85, 4.10, 212, -14, 26, 0],
  [48.40, 5.00, 4.50, 240, -10, 24, 0],
  [48.81, 5.50, 5.45, 262, -8, 24, 0.8],
  [50.30, 5.10, 5.60, 270, -4, 26, 0.3],
  [52.00, 4.40, 5.80, 250, 0, 30, 0.8],
  [56.10, 4.40, 5.80, 302, 0, 30, 0.5],
  [56.49, 4.40, 5.80, 312, 0, 30, 0.9],
  [59.30, 4.40, 5.70, 238, 0, 30, 0],
];

function seg(i, ch) { return KEYS[Math.max(0, Math.min(KEYS.length - 1, i))][ch]; }
function chan(t, ch, log = false) {
  const v = (i) => (log ? Math.log(seg(i, ch)) : seg(i, ch));
  let k = KEYS.length - 2;
  for (let i = 0; i < KEYS.length - 1; i++) if (t < KEYS[i + 1][0]) { k = i; break; }
  if (t >= KEYS[KEYS.length - 1][0]) return log ? Math.exp(v(KEYS.length - 1)) : v(KEYS.length - 1);
  const t0 = KEYS[k][0], t1 = KEYS[k + 1][0], dt = t1 - t0;
  const u = clamp((t - t0) / dt);
  const tension = (i) => KEYS[Math.max(0, Math.min(KEYS.length - 1, i))][6];
  const slope = (i) => {
    const a = Math.max(0, i - 1), b = Math.min(KEYS.length - 1, i + 1);
    const dtt = KEYS[b][0] - KEYS[a][0];
    return dtt > 0 ? ((v(b) - v(a)) / dtt) * (1 - tension(i)) : 0;
  };
  const m0 = slope(k) * dt, m1 = slope(k + 1) * dt;
  const u2 = u * u, u3 = u2 * u;
  const r = (2 * u3 - 3 * u2 + 1) * v(k) + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * v(k + 1) + (u3 - u2) * m1;
  return log ? Math.exp(r) : r;
}

// shake impulses per hit (deterministic)
function shakeAt(t) {
  let dx = 0, dy = 0, dr = 0, zp = 0;
  for (let n = 0; n < HITS.length; n++) {
    const [h, s] = HITS[n]; const d = t - h;
    if (d < 0 || d > 0.7) continue;
    const amp = s * s;
    const env = Math.exp(-d / 0.16);
    const ang = hash2(n, 7) * Math.PI * 2;
    const w = Math.sin(d * 2 * Math.PI * 13 + hash2(n, 3) * 6);
    dx += Math.cos(ang) * 16 * amp * env * w; dy += Math.sin(ang) * 16 * amp * env * w;
    dr += (hash2(n, 9) - 0.5) * 2 * 0.9 * amp * env * w;
    zp += 0.045 * amp * Math.exp(-d / 0.11);
  }
  return { dx, dy, dr, zp };
}

const RUMBLES = [[24.2, 25.85, 7], [35.9, 36.93, 11], [43.4, 46.38, 9], [51.7, 52.34, 7], [55.2, 56.15, 8]];
function rumbleAt(t) {
  let dx = 0, dy = 0, dr = 0;
  for (const [a, b, amp] of RUMBLES) {
    if (t < a || t > b) continue;
    const k = Math.pow((t - a) / (b - a), 2) * amp;
    dx += noise1(t * 31, 41) * k; dy += noise1(t * 29, 42) * k; dr += noise1(t * 23, 43) * k * 0.012;
  }
  return { dx, dy, dr };
}

export function camAt(t) {
  const cx = chan(t, 1), cy = chan(t, 2), z = chan(t, 3, true), roll = chan(t, 4), pitch = chan(t, 5);
  const sh = shakeAt(t); const rb = rumbleAt(t); sh.dx += rb.dx; sh.dy += rb.dy; sh.dr += rb.dr;
  // always-on handheld drift
  const dxn = fbm1(t * 0.5, 11) * 5, dyn = fbm1(t * 0.5, 12) * 5, drn = fbm1(t * 0.35, 13) * 0.35;
  return {
    cx, cy, z: z * (1 + sh.zp), roll: (roll + sh.dr + drn) * DEG, pitch: pitch * DEG,
    ox: sh.dx + dxn, oy: sh.dy + dyn, F: 15,
  };
}

// world (board units) -> screen
export function makeProj(c) {
  const cr = Math.cos(c.roll), sr = Math.sin(c.roll), cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
  const out = { X: 0, Y: 0, s: 1 };
  const f = (x, y, o = out) => {
    const dx = x - c.cx, dy = y - c.cy;
    const u = dx * cr - dy * sr, v = dx * sr + dy * cr;
    const zz = -v * sp; // far when v<0 (top of screen)
    const s = c.F / Math.max(c.F + zz, 1.5);
    o.X = W / 2 + c.ox + c.z * u * s; o.Y = H / 2 + c.oy + c.z * v * cp * s; o.s = s;
    return o;
  };
  // affine for a unit square whose top-left world corner is (x,y)
  f.affine = (x, y, w = 1, h = 1) => {
    const a = { ...f(x, y) }, b = { ...f(x + w, y) }, d = { ...f(x, y + h) };
    return [(b.X - a.X) / 1, (b.Y - a.Y) / 1, (d.X - a.X) / 1, (d.Y - a.Y) / 1, a.X, a.Y];
  };
  return f;
}

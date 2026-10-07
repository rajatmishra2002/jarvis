// Cinematic camera: hand-keyed path (Catmull-Rom through shots) + hit-driven punches / shake, and the projection.
import { clamp, lerp, DEG, hash2, noise1, fbm1, smooth } from './util.mjs';
import { HITS } from './state.mjs';

export const W = 1080, H = 1350;
export const SCALE = Number(process.env.SCALE || 1);
export const CYS = H * 0.46;
export const CHIP_TOP = 1152;   // the board's bottom edge is kept above this line so the chip never covers pieces   // screen y of the camera centre (leaves room for the notation chip below the board)

// [t, cx, cy, zoom(px/square), roll(deg), pitch(deg), tension(0..1, 1 = hold/ease-stop)]
// Teaching-first camera: the WHOLE board is on screen by default (z~124-140); we only push in (z<=192) for the
// moments where the detail is the lesson, and rotation never exceeds a few degrees so the board stays readable.
const KEYS = [
  [0.00, 4.00, 4.00, 118, -1.5, 12, 0],
  [1.60, 4.00, 4.00, 124, -1.0, 11, 0],
  [3.64, 4.00, 4.10, 128, 0.0, 10, 0.6],
  [6.81, 4.00, 4.00, 130, 0.5, 10, 0.6],
  [10.28, 4.00, 4.10, 132, -0.5, 10, 0.6],
  [13.46, 4.00, 4.00, 136, 1.0, 11, 0.6],
  [15.20, 4.00, 4.20, 142, 1.2, 11, 0],
  [17.30, 4.00, 4.30, 150, 1.5, 11, 0],
  [17.49, 4.00, 4.30, 152, 1.5, 11, 0.7],
  [19.62, 3.90, 4.40, 145, 0.5, 10, 0.4],
  [21.40, 4.00, 4.40, 140, 0.0, 10, 0.5],
  [22.60, 4.00, 4.00, 130, -1.0, 10, 0],
  [24.20, 3.90, 4.10, 138, -2.0, 10, 0],
  [25.45, 3.60, 4.20, 145, -2.5, 9, 0.2],
  [25.88, 3.40, 4.90, 140, -2.5, 9, 0.8],
  [26.74, 4.00, 4.30, 128, -2.0, 12, 0.9],
  [27.80, 4.00, 4.30, 128, 1.5, 16, 0],
  [30.00, 4.00, 4.30, 126, 0.0, 18, 0],
  [31.13, 4.00, 4.70, 135, -1.0, 14, 0.6],
  [33.00, 4.00, 4.70, 135, 0.0, 14, 0],
  [34.49, 4.00, 4.70, 138, 1.0, 14, 0.5],
  [35.31, 4.00, 4.70, 138, -1.0, 14, 0.5],
  [36.90, 4.40, 5.40, 165, 1.5, 15, 0.5],
  [36.93, 4.60, 5.50, 168, 2.0, 15, 0.9],
  [39.00, 4.60, 5.20, 135, -1.0, 15, 0.7],
  [41.00, 4.40, 4.70, 128, 0.5, 16, 0],
  [43.30, 4.80, 4.90, 138, 1.0, 16, 0],
  [45.00, 5.30, 5.30, 150, 0.0, 14, 0],
  [46.30, 5.50, 5.50, 158, 0.0, 14, 0.5],
  [46.39, 5.50, 5.50, 160, 0.0, 14, 0.9],
  [46.93, 5.50, 5.60, 155, 0.0, 14, 0.9],
  [47.55, 4.00, 4.30, 128, -1.5, 14, 0],
  [48.40, 4.10, 4.30, 128, -1.5, 14, 0],
  [48.81, 4.60, 4.80, 135, -1.0, 14, 0.8],
  [50.30, 4.60, 5.00, 140, 0.0, 15, 0.3],
  [52.00, 4.60, 5.20, 150, 0.0, 16, 0.8],
  [56.10, 4.60, 5.20, 152, 0.0, 16, 0.5],
  [56.49, 4.60, 5.20, 155, 0.0, 16, 0.9],
  [59.30, 4.50, 4.60, 135, 0.0, 14, 0],
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
    zp += 0.028 * amp * Math.exp(-d / 0.11);
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
  const kk = Math.cos(pitch * DEG) * 1.02;
  const needCy = 8.15 - (CHIP_TOP - CYS) / (z * kk);
  const cyG = Math.max(cy, needCy);
  const sh = shakeAt(t); const rb = rumbleAt(t); sh.dx += rb.dx; sh.dy += rb.dy; sh.dr += rb.dr;
  // always-on handheld drift
  const dxn = fbm1(t * 0.5, 11) * 5, dyn = fbm1(t * 0.5, 12) * 5, drn = fbm1(t * 0.35, 13) * 0.35;
  return {
    cx, cy: cyG, z: z * (1 + sh.zp), roll: (roll + sh.dr + drn) * DEG, pitch: pitch * DEG,
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
    o.X = W / 2 + c.ox + c.z * u * s; o.Y = CYS + c.oy + c.z * v * cp * s; o.s = s;
    return o;
  };
  // affine for a unit square whose top-left world corner is (x,y)
  f.affine = (x, y, w = 1, h = 1) => {
    const a = { ...f(x, y) }, b = { ...f(x + w, y) }, d = { ...f(x, y + h) };
    return [(b.X - a.X) / 1, (b.Y - a.Y) / 1, (d.X - a.X) / 1, (d.Y - a.Y) / 1, a.X, a.Y];
  };
  return f;
}

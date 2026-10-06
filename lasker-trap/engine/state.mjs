// Everything that is a pure function of time: move timing, piece positions, highlights, heat.
import fs from 'fs';
import { clamp, lerp, smooth, smoother, easeInOutCubic, easeOutCubic, hash } from './util.mjs';

const MV = JSON.parse(fs.readFileSync(new URL('../data/moves.json', import.meta.url)));
export const MOVES = MV.moves;
export const PIECES0 = MV.pieces;
export const FINALE = MV.finale;
const AUDIO = JSON.parse(fs.readFileSync(new URL('../data/audio_events.json', import.meta.url)));
export const FPS = 60;
export const DURATION = AUDIO.dur;

export const sqXY = (n) => [n.charCodeAt(0) - 97 + 0.5, 8 - parseInt(n[1]) + 0.5];

// ---- the sync map: moment each move *lands*, snapped to audible hits / sung words --------------------------
export const LAND = [3.64, 6.81, 10.28, 13.46, 17.49, 19.62, 21.40, 25.88, 31.13, 34.49, 35.31, 36.93, 39.00, 46.39, 46.93, 48.81];

// move classification (chess.com-style icons / colours)
export const CLASS = ['book', 'book', 'book', 'book', 'neutral', 'great', 'neutral', 'best', 'mistake', 'brilliant', 'neutral', 'brilliant', 'mistake', 'brilliant', 'neutral', 'best'];
export const CCOL = {
  book: [236, 214, 92], neutral: [236, 214, 92], best: [146, 198, 58], great: [96, 170, 232], brilliant: [36, 214, 204],
  mistake: [255, 164, 89], blunder: [222, 58, 52],
};
export const BADGE = {
  best: { bg: [150, 188, 75], glyph: 'star' }, great: { bg: [92, 139, 176], glyph: '!' }, brilliant: { bg: [27, 172, 166], glyph: '!!' },
  mistake: { bg: [255, 164, 89], glyph: '?' }, blunder: { bg: [202, 52, 49], glyph: '??' },
};

export function moveDur(i) {
  const m = MOVES[i];
  const d = Math.hypot(m.to_xy[0] - m.from_xy[0], m.to_xy[1] - m.from_xy[1]);
  if (i === 7) return 0.52;            // the bishop launch ("Check!")
  if (i === 13) return 0.46;           // underpromotion capture
  if (i === 15) return 0.50;
  return clamp(0.30 + 0.055 * d, 0.30, 0.50);
}
export const START = LAND.map((l, i) => l - moveDur(i));

// ---- piece state ---------------------------------------------------------------------------------------------
export function piecesAt(t) {
  const out = [];
  for (const p of PIECES0) out.push({ id: p.id, sym: p.sym, x: p.xy[0], y: p.xy[1], lift: 0, scale: 1, alpha: 1, moving: false, gone: false, morph: 0, justLanded: 99 });
  const byId = new Map(out.map((o) => [o.id, o]));
  for (let i = 0; i < MOVES.length; i++) {
    const m = MOVES[i], s = START[i], l = LAND[i];
    if (t < s) break;
    const o = byId.get(m.id);
    if (t < l) {
      const p = (t - s) / (l - s);
      // knights / queens take straighter lines; everything uses a gentle ease for a crisp "whip"
      const e = easeInOutCubic(p);
      o.x = lerp(m.from_xy[0], m.to_xy[0], e); o.y = lerp(m.from_xy[1], m.to_xy[1], e);
      o.lift = Math.sin(Math.PI * Math.pow(p, 0.85)); o.moving = true; o.prog = p;
    } else {
      o.x = m.to_xy[0]; o.y = m.to_xy[1]; o.lift = 0; o.moving = false; o.justLanded = t - l;
      if (m.promo) { o.sym = m.color === 'w' ? m.promo.toUpperCase() : m.promo.toLowerCase(); o.morph = t - l; }
    }
    if (m.captured) {
      const c = byId.get(m.captured.id);
      if (t >= l) c.gone = true;
    }
  }
  return out;
}

// ---- last-move highlights ------------------------------------------------------------------------------------
export function highlights(t) {
  const hl = [];
  for (let i = 0; i < MOVES.length; i++) {
    const s = START[i], l = LAND[i];
    const nextS = i + 1 < MOVES.length ? START[i + 1] : 1e9;
    if (t < s) break;
    const a = smooth((t - s) / 0.12) * (1 - smooth((t - (nextS - 0.02)) / 0.2));
    if (a <= 0.001) continue;
    const col = CCOL[CLASS[i]];
    hl.push({ xy: MOVES[i].from_xy, col, a: a * 0.55, kind: 'from', move: i });
    hl.push({ xy: MOVES[i].to_xy, col, a: a * (t < l ? 0.35 : 0.9), kind: 'to', move: i, landed: t >= l, since: t - l });
  }
  return hl;
}

// ---- heat (0 = cold chess.com look, 1 = inferno) ------------------------------------------------------------
const HEAT_KEYS = [[0, 0], [26.0, 0], [26.74, 0.62], [31, 0.55], [36.0, 0.58], [36.93, 0.82], [46.0, 0.84], [46.39, 1.0], [59.4, 1.0]];
export function heatAt(t) {
  if (t <= HEAT_KEYS[0][0]) return 0;
  for (let i = 1; i < HEAT_KEYS.length; i++) {
    if (t < HEAT_KEYS[i][0]) {
      const [t0, h0] = HEAT_KEYS[i - 1], [t1, h1] = HEAT_KEYS[i];
      const u = (t - t0) / (t1 - t0);
      return lerp(h0, h1, (t1 - t0) < 1.0 ? smooth(u) : u);
    }
  }
  return 1;
}
// ignition wave: the board catches fire outward from the checking line when the drop hits
export const IGNITE = { t: 26.74, origin: [3.0, 5.6], speed: 7.0 };
export function squareHeat(t, x, y) {
  const H = heatAt(t);
  if (t < IGNITE.t) return 0;
  const d = Math.hypot(x - IGNITE.origin[0], y - IGNITE.origin[1]);
  const front = (t - IGNITE.t) * IGNITE.speed;
  return H * smooth((front - d + 1.0) / 2.0);
}

// ---- audio-reactive helpers --------------------------------------------------------------------------------
export const ENV = AUDIO.env;
export function envAt(name, t) {
  const a = ENV[name]; const f = t * FPS; const i = Math.floor(f); const u = f - i;
  return lerp(a[clamp(i, 0, a.length - 1)], a[clamp(i + 1, 0, a.length - 1)], u);
}
// key hits: [time, strength]  (hand-picked from the onset analysis; drive punches/shakes/flashes)
export const HITS = [
  [0.10, .6], [3.64, .5], [6.81, .6], [10.28, .6], [13.46, .6], [17.49, .8], [19.62, .45], [21.40, .6], [25.88, 1.0], [26.74, 1.0], [27.57, .35], [27.79, .6], [28.18, .3],
  [29.02, .4], [29.76, .5], [30.24, 1.0], [31.13, .7], [32.36, .35], [33.33, .3], [34.49, .55], [35.31, .8], [36.93, 1.0], [39.00, 1.0],
  [39.65, .3], [40.27, .3], [40.90, .3], [41.52, .3], [42.35, .35], [43.00, .3], [43.55, .35], [44.46, .4], [45.09, .3], [45.51, .35],
  [46.39, 1.0], [46.67, .6], [46.93, .8], [48.81, 1.0], [50.29, .7], [51.13, .7], [52.34, 1.0], [53.00, .3], [53.39, .5], [53.60, .4], [54.24, .5], [54.85, .5], [55.69, .6],
  [56.49, .9], [56.68, .7], [56.92, .9], [57.16, 1.0], [57.75, 1.0], [58.19, 1.0], [59.02, 0.8],
];
export function pulse(t, tau = 0.14) {
  let p = 0;
  for (const [h, s] of HITS) { const d = t - h; if (d >= 0 && d < tau * 7) p += s * Math.exp(-d / tau); }
  return Math.min(p, 1.6);
}
// last hit time <= t
export function sinceHit(t, minStrength = 0.0) {
  let best = 99;
  for (const [h, s] of HITS) if (s >= minStrength && t >= h) best = Math.min(best, t - h);
  return best;
}

// Kinetic typography for the closing lines + full-screen flashes.
import { Canvas } from 'skia-canvas';
import { clamp, lerp, smooth, easeOutCubic, easeOutBack, TAU, hash, hash2, hash3, noise1, mixColor, rgb } from './util.mjs';
import { W, H } from './camera.mjs';
import * as S from './state.mjs';

// ---- word timeline (all landing on audible hits) ----------------------------------------------------------
const T_YOU = [['YOU', 53.39], ['THOUGHT', 53.60], ['IT', 54.24], ['WAS', 54.85], ['OVER', 55.69]];
const DOTS = [55.95, 56.08, 56.21];
const T_BUT = [['BUT', 56.49], ['I\'M', 56.68], ['NOT', 56.92], ['DONE!', 57.16]];
const T_LASK = [['LASKER', 57.75], ['TRAP!', 58.19]];

const GRADS = {
  white: [[255, 255, 255], [225, 232, 245]],
  fire: [[255, 250, 214], [255, 190, 70], [255, 96, 20], [200, 24, 8]],
};

function wordWidths(c, words, size, spacing) {
  c.font = `${size}px Anton`; c.letterSpacing = `${spacing}px`;
  return words.map((w) => c.measureText(w).width);
}

function drawWord(c, e, text, cx, baseY, size, t0, t, o = {}) {
  const age = t - t0; if (age < 0) return;
  const life = o.out === undefined ? 1 : 1 - smooth((t - o.out) / (o.outDur || 0.2));
  if (life <= 0.002) return;
  const settle = easeOutCubic(age / 0.14);
  const sc = (1 + (o.pop ?? 1.6) * (1 - settle)) * (1 + 0.02 * Math.min(age, 1.2)) * (o.outScale ? 1 - (1 - o.outScale) * (1 - life) : 1);
  const alpha = clamp(age / 0.03) * life;
  c.save(); c.globalAlpha = alpha;
  c.translate(cx, baseY - (o.outLift || 0) * (1 - life)); c.scale(sc, sc);
  c.font = `${size}px Anton`; c.letterSpacing = `${o.spacing ?? 3}px`; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  const g = c.createLinearGradient(0, -size * 0.85, 0, size * 0.05);
  const stops = GRADS[o.grad || 'white'];
  stops.forEach((col, i) => g.addColorStop(i / (stops.length - 1), rgb(col)));
  const split = 14 * Math.exp(-age / 0.1) * (o.glitch ?? 1);
  // chromatic split under the main fill
  if (split > 0.8) {
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = 'rgba(255,40,70,0.55)'; c.fillText(text, -split, 0);
    c.fillStyle = 'rgba(40,200,255,0.55)'; c.fillText(text, split, 0);
    c.globalCompositeOperation = 'source-over';
  }
  c.lineWidth = size * 0.045; c.strokeStyle = 'rgba(6,3,2,0.9)'; c.lineJoin = 'round'; c.strokeText(text, 0, 0);
  c.shadowColor = o.glow || 'rgba(255,120,30,0.9)'; c.shadowBlur = size * 0.08;
  // glitch slices right after the hit
  if (age < 0.16 && (o.glitch ?? 1) > 0) {
    const n = 7, w = c.measureText(text).width;
    for (let k = 0; k < n; k++) {
      c.save(); c.beginPath(); c.rect(-w, -size * 0.95 + (k * size * 1.1) / n, w * 2, (size * 1.1) / n + 1); c.clip();
      c.translate((hash3(Math.floor(t * 60), k, 3) - 0.5) * 60 * (1 - age / 0.16), 0);
      c.fillStyle = g; c.fillText(text, 0, 0); c.restore();
    }
  } else { c.fillStyle = g; c.fillText(text, 0, 0); }
  c.restore();
  // emissive copy
  e.save(); e.globalAlpha = alpha * 0.30; e.translate(cx, baseY - (o.outLift || 0) * (1 - life)); e.scale(sc, sc);
  e.font = `${size}px Anton`; e.letterSpacing = `${o.spacing ?? 3}px`; e.textAlign = 'center';
  e.fillStyle = o.glowFill || 'rgba(255,170,80,0.85)'; e.fillText(text, 0, 0); e.restore();
}

function layoutLine(c, words, size, spacing, gap) {
  const widths = wordWidths(c, words.map((w) => w[0]), size, spacing);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (words.length - 1);
  let x = -total / 2; const out = [];
  words.forEach((w, i) => { out.push({ text: w[0], t0: w[1], cx: x + widths[i] / 2, w: widths[i] }); x += widths[i] + gap; });
  return out;
}

function burst(c, e, cx, cy, t0, t, r0, r1, col = [255, 190, 100], n = 22) {
  const age = t - t0; if (age < 0 || age > 0.6) return;
  const u = age / 0.6;
  const ring = r0 + (r1 - r0) * easeOutCubic(u);
  c.save(); c.strokeStyle = rgb(col, 0.85 * (1 - u)); c.lineWidth = 6 * (1 - u) + 1; c.beginPath(); c.arc(cx, cy, ring, 0, TAU); c.stroke(); c.restore();
  e.save(); e.strokeStyle = rgb(col, 0.8 * (1 - u)); e.lineWidth = 16 * (1 - u) + 2; e.beginPath(); e.arc(cx, cy, ring, 0, TAU); e.stroke(); e.restore();
  for (let k = 0; k < n; k++) {
    const a = hash3(Math.floor(t0 * 100), k, 1) * TAU, sp = 0.6 + hash3(Math.floor(t0 * 100), k, 2);
    const d0 = ring * (0.65 + 0.35 * sp), d1 = d0 + 70 * (1 - u) * sp;
    c.save(); c.strokeStyle = rgb(mixColor(col, [255, 255, 255], 0.5), 0.9 * (1 - u)); c.lineWidth = 3 * (1 - u) + 1; c.lineCap = 'round';
    c.beginPath(); c.moveTo(cx + Math.cos(a) * d0, cy + Math.sin(a) * d0); c.lineTo(cx + Math.cos(a) * d1, cy + Math.sin(a) * d1); c.stroke(); c.restore();
  }
}

const EMBERC = new Canvas(64, 64);
{ const x = EMBERC.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(0.2, 'rgba(255,200,90,0.9)'); g.addColorStop(0.55, 'rgba(255,100,20,0.4)'); g.addColorStop(1, 'rgba(255,60,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); }

function fit(c, text, maxW, size, spacing) {
  c.font = '100px Anton'; c.letterSpacing = `${spacing}px`;
  return Math.min(size, (maxW / c.measureText(text).width) * 100);
}

export function drawFinale(c, e, t) {
  if (t < 52.0) return;
  // dimming veil so the type reads on the burning board
  const veil = 0.58 * smooth((t - 52.34) / 1.0) * (1 - 0.30 * smooth((t - 57.7) / 0.5));
  if (veil > 0) {
    c.save(); c.fillStyle = `rgba(4,2,2,${veil})`; c.fillRect(0, 0, W, H);
    const rg = c.createRadialGradient(W / 2, H * 0.5, 80, W / 2, H * 0.5, H * 0.55); rg.addColorStop(0, `rgba(0,0,0,${0.35 * smooth((t - 53.2) / 0.6)})`); rg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = rg; c.fillRect(0, 0, W, H); c.restore();
  }

  // ---- "YOU THOUGHT IT WAS OVER…" -------------------------------------------------------------------
  const outT = 56.18;
  c.save(); c.setTransform(c.getTransform()); c.restore();
  const sz1 = Math.min(150, fit(c, 'IT WAS OVER', W * 0.86, 150, 3)), y1 = H * 0.405;
  const L1 = layoutLine(c, T_YOU.slice(0, 2), sz1, 3, 56), L2 = layoutLine(c, T_YOU.slice(2), sz1, 3, 56);
  const cx = W / 2;
  c.save();
  for (const w of L1) drawWord(c, e, w.text, cx + w.cx, y1, sz1, w.t0, t, { out: outT, outDur: 0.22, grad: 'white', glow: 'rgba(140,190,255,0.8)', glowFill: 'rgba(170,205,255,0.8)', pop: 0.9 });
  for (const w of L2) drawWord(c, e, w.text, cx + w.cx, y1 + sz1 * 1.08, sz1, w.t0, t, { out: outT, outDur: 0.22, grad: 'white', glow: 'rgba(140,190,255,0.8)', glowFill: 'rgba(170,205,255,0.8)', pop: 0.9 });
  // ellipsis dots after OVER
  const over = L2[L2.length - 1];
  DOTS.forEach((dt, k) => {
    if (t < dt || t > outT + 0.22) return;
    const a = 1 - smooth((t - outT) / 0.22);
    const x = cx + over.cx + over.w / 2 + 28 + k * 38, y = y1 + sz1 * 1.08 - 12;
    c.save(); c.fillStyle = `rgba(255,255,255,${a})`; c.shadowColor = 'rgba(140,190,255,0.9)'; c.shadowBlur = 20; c.beginPath(); c.arc(x, y, 11, 0, TAU); c.fill(); c.restore();
  });
  c.restore();

  // ---- "BUT I'M NOT DONE!" ---------------------------------------------------------------------------
  const sz2 = Math.min(205, fit(c, 'NOT DONE!', W * 0.92, 205, 3)), y2 = H * 0.355;
  const B1 = layoutLine(c, T_BUT.slice(0, 2), sz2, 3, 44), B2 = layoutLine(c, T_BUT.slice(2), sz2, 3, 44);
  const outB = 57.60;
  for (const w of B1) drawWord(c, e, w.text, cx + w.cx, y2, sz2, w.t0, t, { out: outB, outDur: 0.16, outScale: 0.72, outLift: 120, grad: 'fire', pop: 1.8 });
  for (const w of B2) drawWord(c, e, w.text, cx + w.cx, y2 + sz2 * 1.04, sz2, w.t0, t, { out: outB, outDur: 0.16, outScale: 0.72, outLift: 120, grad: 'fire', pop: 1.8 });
  for (const w of [...B1.map((q) => [q, y2]), ...B2.map((q) => [q, y2 + sz2 * 1.04])]) burst(c, e, cx + w[0].cx, w[1] - sz2 * 0.35, w[0].t0, t, 40, 320, [255, 170, 70], 14);

  // ---- "LASKER TRAP!" ----------------------------------------------------------------------------------
  const sz3 = Math.min(fit(c, 'LASKER', W * 0.9, 335, 6), fit(c, 'TRAP!', W * 0.9, 335, 6));
  const yA = H * 0.43, yB = yA + sz3 * 0.98;
  drawWord(c, e, 'LASKER', cx, yA, sz3, T_LASK[0][1], t, { grad: 'fire', pop: 2.2, spacing: 6 });
  drawWord(c, e, 'TRAP!', cx, yB, sz3, T_LASK[1][1], t, { grad: 'fire', pop: 2.2, spacing: 6 });
  burst(c, e, cx, yA - sz3 * 0.3, T_LASK[0][1], t, 60, 560, [255, 200, 120], 28);
  burst(c, e, cx, yB - sz3 * 0.3, T_LASK[1][1], t, 60, 640, [255, 160, 60], 34);
  // embers streaming off the title
  if (t > T_LASK[0][1]) {
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let n = 0; n < 90; n++) {
      const L = 0.8 + hash2(n, 71) * 1.4, ph = hash2(n, 72) * L, cyc = Math.floor((t + ph) / L), u = ((t + ph) % L) / L;
      const x = W * (0.08 + 0.84 * hash3(n, cyc, 73)), y0 = H * (0.30 + 0.42 * hash3(n, cyc, 74));
      const sz = (10 + 22 * hash3(n, cyc, 75)) * (1 - u);
      const a = (1 - u) * smooth((t - T_LASK[0][1]) / 0.2);
      c.globalAlpha = a * 0.85; c.drawImage(EMBERC, x + Math.sin(u * 6 + n) * 20 - sz, y0 - u * 260 - sz, sz * 2, sz * 2);
    }
    c.restore();
  }
}

// ---- screen flashes -----------------------------------------------------------------------------------------
// [time, strength, tau, colour]
const FLASHES = [
  [25.88, 0.22, 0.07, [255, 120, 110]], [26.74, 0.70, 0.09, [255, 235, 205]], [30.24, 0.30, 0.08, [255, 190, 120]], [31.13, 0.12, 0.06, [255, 255, 255]],
  [35.31, 0.15, 0.06, [255, 255, 255]], [36.93, 0.40, 0.07, [255, 150, 90]], [39.00, 0.25, 0.07, [255, 140, 80]],
  [46.39, 0.55, 0.07, [255, 235, 190]], [46.67, 0.15, 0.05, [255, 200, 120]], [46.93, 0.20, 0.06, [255, 220, 150]], [48.81, 0.35, 0.08, [255, 150, 140]],
  [50.29, 0.18, 0.06, [255, 120, 110]], [51.13, 0.18, 0.06, [255, 120, 110]], [52.34, 0.35, 0.09, [255, 170, 120]],
  [56.49, 0.16, 0.06, [255, 200, 140]], [56.68, 0.10, 0.05, [255, 200, 140]], [56.92, 0.14, 0.05, [255, 200, 140]], [57.16, 0.26, 0.07, [255, 230, 170]],
  [57.75, 0.34, 0.08, [255, 240, 200]], [58.19, 0.50, 0.12, [255, 235, 190]], [59.02, 0.28, 0.08, [255, 230, 190]],
];
export function drawFlashes(c, W_, H_, t) {
  let r = 0, g = 0, b = 0, a = 0;
  for (const [h, s, tau, col] of FLASHES) {
    const d = t - h; if (d < 0 || d > tau * 6) continue;
    const k = s * Math.exp(-d / tau) * smooth(d / 0.012);
    if (k > a) { a = k; [r, g, b] = col; }
  }
  if (a > 0.01) { c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = `rgba(${r},${g},${b},${Math.min(a, 1) * 0.85})`; c.fillRect(0, 0, W_, H_); c.restore(); }
}
// chromatic aberration amount (px at 1080 wide) for the current frame
export function caAmount(t) {
  let a = 0;
  for (const [h, s] of S.HITS) { if (s < 0.8) continue; const d = t - h; if (d < 0 || d > 0.5) continue; a = Math.max(a, s * Math.exp(-d / 0.09)); }
  return a * 6;
}

// horizontal slice-glitch amount (px) for the current frame: only on the biggest impacts, for ~4 frames
export function glitchAmount(t) {
  let a = 0;
  for (const [h, s] of S.HITS) { if (s < 0.95) continue; const d = t - h; if (d < 0 || d > 0.075) continue; a = Math.max(a, 26 * (1 - d / 0.075)); }
  return a;
}

// Effects: everything that is not the board or a resting piece.
import { Canvas, Path2D } from 'skia-canvas';
import { clamp, lerp, smooth, easeOutCubic, easeOutBack, easeInOutCubic, TAU, hash, hash2, hash3, noise1, mixColor, rgb } from './util.mjs';
import { W, H, SCALE as SC } from './camera.mjs';
import * as S from './state.mjs';
import { drawPiece } from './pieces.mjs';

const RED = [240, 58, 52];
const sym2col = (sym) => (sym === sym.toUpperCase() ? 'w' : 'b');

// ---- pre-rendered sprites --------------------------------------------------------------------------------
function sprite(w, h, fn) { const cv = new Canvas(w, h); fn(cv.getContext('2d'), w, h); return cv; }
const EMBER = sprite(64, 64, (x) => {
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(0.18, 'rgba(255,200,90,0.95)'); g.addColorStop(0.5, 'rgba(255,110,25,0.45)'); g.addColorStop(1, 'rgba(255,60,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
});
const pt = (p, x, y) => p(x, y, {});

function glowLine(c, e, pts, col, width, alpha, eAlpha = 0.5) {
  if (alpha <= 0.002) return;
  c.save(); c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = rgb(col, alpha); c.lineWidth = width; c.stroke(pts); c.restore();
  e.save(); e.lineCap = 'round'; e.lineJoin = 'round'; e.strokeStyle = rgb(col, alpha * eAlpha); e.lineWidth = width * 2.2; e.stroke(pts); e.restore();
}
function wline(p, a, b) { const path = new Path2D(); const A = pt(p, a[0], a[1]), B = pt(p, b[0], b[1]); path.moveTo(A.X, A.Y); path.lineTo(B.X, B.Y); return path; }
function wpoly(p, pts) { const path = new Path2D(); pts.forEach(([x, y], i) => { const q = pt(p, x, y); i ? path.lineTo(q.X, q.Y) : path.moveTo(q.X, q.Y); }); return path; }
function squareQuad(p, x, y, inset = 0) {
  const path = new Path2D(); [[x + inset, y + inset], [x + 1 - inset, y + inset], [x + 1 - inset, y + 1 - inset], [x + inset, y + 1 - inset]].forEach(([a, b], i) => { const q = pt(p, a, b); i ? path.lineTo(q.X, q.Y) : path.moveTo(q.X, q.Y); });
  path.closePath(); return path;
}
const sqOf = (xy) => [Math.floor(xy[0]), Math.floor(xy[1])];

function arrowPath(p, a, b, w, head) {
  // arrow in the board plane from a to b (world units)
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const hb = [b[0] - ux * head, b[1] - uy * head];
  return wpoly(p, [
    [a[0] + nx * w / 2, a[1] + ny * w / 2], [hb[0] + nx * w / 2, hb[1] + ny * w / 2], [hb[0] + nx * head * 0.55, hb[1] + ny * head * 0.55], [b[0], b[1]],
    [hb[0] - nx * head * 0.55, hb[1] - ny * head * 0.55], [hb[0] - nx * w / 2, hb[1] - ny * w / 2], [a[0] - nx * w / 2, a[1] - ny * w / 2],
  ]);
}

// ---- check state ----------------------------------------------------------------------------------------
export function activeCheck(t) {
  for (let i = S.MOVES.length - 1; i >= 0; i--) {
    const m = S.MOVES[i];
    if (!m.check || t < S.LAND[i]) continue;
    const end = i + 1 < S.MOVES.length ? S.START[i + 1] + 0.1 : 1e9;
    if (t < end) return { i, m, age: t - S.LAND[i] };
    return null;
  }
  return null;
}

// =====================================================================================================
// UNDER-PIECE effects (drawn on the board plane before pieces)
// =====================================================================================================
export function drawUnder(c, e, p, cam, t) {
  trails(c, e, p, cam, t);
  baitArrow(c, e, p, cam, t);
  chargeBeam(c, e, p, cam, t);
  checkLayer(c, e, p, cam, t, true);
  guardianShield(c, e, p, cam, t);
  threatReticle(c, e, p, cam, t);
  finalLines(c, e, p, cam, t);
}

function trails(c, e, p, cam, t) {
  for (let i = 0; i < S.MOVES.length; i++) {
    const s = S.START[i], l = S.LAND[i];
    if (t < s || t > l + 0.28) continue;
    const m = S.MOVES[i]; const col = S.CCOL[S.CLASS[i]];
    const u = clamp((t - s) / (l - s));
    const e1 = easeInOutCubic(u);
    const cur = [lerp(m.from_xy[0], m.to_xy[0], e1), lerp(m.from_xy[1], m.to_xy[1], e1)];
    const tail = [lerp(m.from_xy[0], m.to_xy[0], easeInOutCubic(Math.max(0, u - 0.35))), lerp(m.from_xy[1], m.to_xy[1], easeInOutCubic(Math.max(0, u - 0.35)))];
    const fade = 1 - smooth((t - l) / 0.28);
    const A = pt(p, tail[0], tail[1]), B = pt(p, cur[0], cur[1]);
    if (Math.hypot(A.X - B.X, A.Y - B.Y) < 2) continue;
    for (const [ctx, k] of [[c, 1], [e, 0.6]]) {
      const g = ctx.createLinearGradient(A.X, A.Y, B.X, B.Y);
      g.addColorStop(0, rgb(col, 0)); g.addColorStop(1, rgb(mixColor(col, [255, 255, 255], 0.3), 0.55 * fade * k));
      ctx.save(); ctx.strokeStyle = g; ctx.lineCap = 'round'; ctx.lineWidth = 0.34 * cam.z * B.s * (k === 1 ? 1 : 1.5);
      ctx.beginPath(); ctx.moveTo(A.X, A.Y); ctx.lineTo(B.X, B.Y); ctx.stroke(); ctx.restore();
    }
  }
}

function baitArrow(c, e, p, cam, t) {
  // the poisoned pawn: d4 -> e5 invitation, "take it if you dare"
  const a = smooth((t - 14.7) / 0.5) * (1 - smooth((t - 17.42) / 0.07));
  if (a <= 0.001) return;
  const dare = smooth((t - 15.6) / 0.4);
  const breathe = 0.7 + 0.3 * Math.sin(t * 6.0);
  const path = arrowPath(p, [3.5 + 0.2, 4.5 - 0.2], [4.5 - 0.22, 3.5 + 0.22], 0.14 + 0.06 * dare, 0.42);
  const col = mixColor([255, 255, 255], [255, 120, 40], dare);
  c.save(); c.fillStyle = rgb(col, 0.55 * a * breathe); c.fill(path); c.restore();
  e.save(); e.fillStyle = rgb(col, 0.55 * a * breathe); e.fill(path); e.restore();
  // bait glow on the e5 pawn square
  const q = squareQuad(p, 4, 3);
  e.save(); e.fillStyle = rgb([255, 120, 40], 0.25 * dare * a * breathe); e.fill(q); e.restore();
}

export const BEAM = { t0: 22.6, t1: 25.3, from: [5.5, 0.5], to: [1.5, 4.5] };
function chargeBeam(c, e, p, cam, t) {
  const { t0, t1, from, to } = BEAM;
  if (t < t0 || t > S.LAND[7] + 0.05) return;
  const f = smooth((t - t0) / (t1 - t0));
  const out = 1 - smooth((t - (S.START[7] + 0.08)) / 0.2);       // beam hands over to the bishop as it launches
  const head = [lerp(from[0], to[0], f), lerp(from[1], to[1], f)];
  const flick = 0.75 + 0.25 * Math.sin(t * 40);
  const path = wline(p, from, head);
  glowLine(c, e, path, [255, 255, 255], 0.06 * cam.z, 0.85 * out * flick, 0.9);
  // squares along the diagonal light up as the beam reaches them
  const sq = [[4, 1], [3, 2], [2, 3], [1, 4]];
  sq.forEach(([sx, sy], k) => {
    const hit = t0 + ((k + 1) / 4) * (t1 - t0) * 0.93;
    const age = t - hit; if (age < 0) return;
    const amp = (0.55 + 0.45 * Math.exp(-age / 0.25)) * out;
    const qd = squareQuad(p, sx, sy, 0.04);
    c.save(); c.fillStyle = rgb([120, 215, 255], 0.38 * amp); c.fill(qd); c.restore();
    e.save(); e.fillStyle = rgb([120, 215, 255], 0.4 * amp); e.fill(qd); e.restore();
    const ring = clamp(age / 0.45);
    if (ring < 1) { const path2 = squareQuad(p, sx - 0.2 * ring, sy - 0.2 * ring, -0.0); c.save(); c.strokeStyle = rgb([190, 235, 255], 0.7 * (1 - ring)); c.lineWidth = 0.04 * cam.z; c.stroke(path2); c.restore(); }
  });
  // aura on the bishop
  const A = pt(p, from[0], from[1]);
  const r = (0.5 + 0.9 * f) * cam.z * A.s;
  const g = e.createRadialGradient(A.X, A.Y, 0, A.X, A.Y, r);
  g.addColorStop(0, `rgba(190,235,255,${0.6 * f * out})`); g.addColorStop(1, 'rgba(120,200,255,0)');
  e.save(); e.fillStyle = g; e.fillRect(A.X - r, A.Y - r, r * 2, r * 2); e.restore();
}

function checkLayer(c, e, p, cam, t, under) {
  const ck = activeCheck(t);
  if (!ck) return;
  const { m, age, i } = ck;
  const k = m.king_xy; const [kx, ky] = [Math.floor(k[0]), Math.floor(k[1])];
  const throb = 0.62 + 0.38 * Math.sin(age * 9.5);
  const fadeIn = smooth(age / 0.08);
  if (under) {
    const q = squareQuad(p, kx, ky);
    c.save(); c.fillStyle = rgb(RED, 0.78 * throb * fadeIn); c.fill(q); c.restore();
    e.save(); e.fillStyle = rgb(RED, 0.5 * throb * fadeIn); e.fill(q); e.restore();
    // ray(s) from the checking piece(s)
    for (const ch of m.checkers) {
      const path = (ch.sym.toLowerCase() === 'n')
        ? wpoly(p, [ch.xy, [k[0], ch.xy[1]], k])
        : wline(p, ch.xy, k);
      const pulseHit = S.sinceHit(t + age * 0, 0.5);
      const w = 0.07 + 0.05 * Math.exp(-S.sinceHit(t, 0.6) / 0.12);
      glowLine(c, e, path, [255, 140, 120], w * cam.z, 0.85 * fadeIn * (0.7 + 0.3 * throb), 0.8);
      // each audible hit fires a bright pulse down the ray into the king
      const A = pt(p, ch.xy[0], ch.xy[1]), B = pt(p, k[0], k[1]);
      for (const [h, s] of S.HITS) {
        const u = (t - h) / 0.26;
        if (u < 0 || u > 1 || s < 0.3 || h < S.LAND[i]) continue;
        const e1 = u * u * (3 - 2 * u);
        const X = lerp(A.X, B.X, e1), Y = lerp(A.Y, B.Y, e1), r = (0.07 + 0.07 * s) * cam.z;
        const g = c.createRadialGradient(X, Y, 0, X, Y, r * 2.2); g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.35, 'rgba(255,170,150,0.55)'); g.addColorStop(1, 'rgba(255,90,80,0)');
        c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = g; c.fillRect(X - r * 2.2, Y - r * 2.2, r * 4.4, r * 4.4); c.restore();
        e.save(); e.fillStyle = g; e.fillRect(X - r * 2.2, Y - r * 2.2, r * 4.4, r * 4.4); e.restore();
      }
    }
  } else {
    // expanding red shock rings on every strong hit while in check
    for (const [h, s] of S.HITS) {
      const a = t - h; if (a < 0 || a > 0.75 || s < 0.5 || h < S.LAND[i]) continue;
      const u = a / 0.75;
      const ring = new Path2D(); const q = pt(p, k[0], k[1]); const r = (0.4 + 2.2 * easeOutCubic(u)) * cam.z * q.s * 0.5;
      ring.arc(q.X, q.Y, r, 0, TAU);
      c.save(); c.strokeStyle = rgb(RED, 0.8 * (1 - u)); c.lineWidth = 0.07 * cam.z * (1 - u * 0.7); c.stroke(ring); c.restore();
      e.save(); e.strokeStyle = rgb(RED, 0.7 * (1 - u)); e.lineWidth = 0.14 * cam.z * (1 - u * 0.7); e.stroke(ring); e.restore();
    }
  }
}

function guardianShield(c, e, p, cam, t) {
  // 5.Bd2 blocks the check: the "guardian" (sung at ~32.4)
  const age = t - 32.36; if (age < 0 || age > 1.6) return;
  const cx = 3.5, cy = 6.5; const q = pt(p, cx, cy);
  const u = clamp(age / 1.2);
  const ring = new Path2D(); ring.arc(q.X, q.Y, (0.5 + 0.9 * easeOutCubic(u)) * cam.z * q.s * 0.5 + 0.2 * cam.z, 0, TAU);
  const a = (1 - u) * 0.9;
  c.save(); c.strokeStyle = rgb([150, 205, 255], a); c.lineWidth = 0.07 * cam.z; c.stroke(ring); c.restore();
  e.save(); e.strokeStyle = rgb([120, 190, 255], a); e.lineWidth = 0.16 * cam.z; e.stroke(ring); e.restore();
  // blocked ray: b4 -> d2 (white-hot at the impact)
  const fadeIn = smooth(age / 0.1) * (1 - smooth((age - 1.0) / 0.5));
  glowLine(c, e, wline(p, [1.5, 4.5], [3.5, 6.5]), [255, 150, 120], 0.08 * cam.z, 0.8 * fadeIn, 0.8);
}

function threatReticle(c, e, p, cam, t) {
  // g1 knight is about to be taken by the f2 pawn
  const a = smooth((t - 39.6) / 0.4) * (1 - smooth((t - 46.30) / 0.09));
  if (a <= 0.001) return;
  const cx = 6.5, cy = 7.5; const q = pt(p, cx, cy);
  const rot = t * 1.6;
  const br = 0.42 * (1 + 0.12 * Math.exp(-S.sinceHit(t, 0.25) / 0.12)), arm = 0.2;
  c.save(); c.strokeStyle = rgb([255, 170, 80], 0.95 * a); c.lineWidth = 0.05 * cam.z; c.lineCap = 'round';
  for (let k = 0; k < 4; k++) {
    const ang = rot + k * TAU / 4;
    const path = new Path2D();
    const pts = [[cx + Math.cos(ang - 0.35) * br * 1.45, cy + Math.sin(ang - 0.35) * br * 1.45], [cx + Math.cos(ang) * br * 1.45, cy + Math.sin(ang) * br * 1.45], [cx + Math.cos(ang + 0.35) * br * 1.45, cy + Math.sin(ang + 0.35) * br * 1.45]];
    pts.forEach(([x, y], i) => { const o = pt(p, x, y); i ? path.lineTo(o.X, o.Y) : path.moveTo(o.X, o.Y); });
    c.stroke(path); e.save(); e.strokeStyle = rgb([255, 130, 40], 0.5 * a); e.lineWidth = 0.08 * cam.z; e.stroke(path); e.restore();
  }
  c.restore();
  // the threat itself: the f2 pawn takes g1 (pulses on every kick)
  const pu = Math.exp(-S.sinceHit(t, 0.25) / 0.15);
  const ar = arrowPath(p, [5.5 + 0.18, 6.5 + 0.18], [6.5 - 0.2, 7.5 - 0.2], 0.13 + 0.05 * pu, 0.4);
  c.save(); c.fillStyle = rgb([255, 150, 60], (0.38 + 0.5 * pu) * a); c.fill(ar); c.restore();
  e.save(); e.fillStyle = rgb([255, 130, 40], (0.3 + 0.5 * pu) * a); e.fill(ar); e.restore();
  const f2 = squareQuad(p, 5, 6); const g1 = squareQuad(p, 6, 7);
  e.save(); e.fillStyle = rgb([255, 120, 40], 0.22 * a * (0.4 + 0.6 * pu)); e.fill(f2); e.fill(g1); e.restore();
}

function finalLines(c, e, p, cam, t) {
  if (t < S.LAND[15] - 0.02) return;
  const king = [4.5, 6.5], queen = [3.5, 7.5], bish = [6.5, 4.5], bq = [3.5, 0.5];
  const a = smooth((t - S.LAND[15]) / 0.15);
  const hitP = Math.exp(-S.sinceHit(t, 0.6) / 0.14);
  // x-ray through the king to the queen
  const ray = wline(p, bish, queen);
  const calm = 1 - 0.78 * smooth((t - 52.34) / 0.5);          // step back once the type arrives
  glowLine(c, e, ray, [255, 110, 90], (0.05 + 0.035 * hitP) * cam.z, 0.85 * a * calm, 0.3);
  // the d-file: Qd8 -> Qd1
  const df = wline(p, bq, queen);
  const dfa = smooth((t - 50.0) / 0.4);
  glowLine(c, e, df, [255, 170, 70], (0.04 + 0.03 * hitP) * cam.z, 0.6 * dfa * (1 - 0.7 * smooth((t - 52.34) / 0.5)), 0.3);
  // queen target rings
  const qa = smooth((t - 49.3) / 0.3);
  if (qa > 0) {
    const q = pt(p, queen[0], queen[1]);
    const r = 0.55 * cam.z * q.s * (1 + 0.08 * Math.sin(t * 8));
    c.save(); c.strokeStyle = rgb(RED, 0.9 * qa); c.lineWidth = 0.05 * cam.z; c.beginPath(); c.arc(q.X, q.Y, r, 0, TAU); c.stroke();
    c.beginPath(); c.moveTo(q.X - r * 1.3, q.Y); c.lineTo(q.X - r * 0.8, q.Y); c.moveTo(q.X + r * 1.3, q.Y); c.lineTo(q.X + r * 0.8, q.Y); c.moveTo(q.X, q.Y - r * 1.3); c.lineTo(q.X, q.Y - r * 0.8); c.moveTo(q.X, q.Y + r * 1.3); c.lineTo(q.X, q.Y + r * 0.8); c.stroke(); c.restore();
    e.save(); e.strokeStyle = rgb(RED, 0.5 * qa); e.lineWidth = 0.1 * cam.z; e.beginPath(); e.arc(q.X, q.Y, r, 0, TAU); e.stroke(); e.restore();
  }
  // "nowhere to run": every flight square of the white king is marked (hits 52.34 / 53.0 / 53.2 / 53.39)
  const marks = [['d2', 52.34, 'att'], ['d3', 52.34, 'att'], ['f3', 52.34, 'att'], ['e1', 53.0, 'trap'], ['f2', 53.2, 'trap'], ['e3', 53.39, 'trap']];
  for (const [sq, th, kind] of marks) {
    const age = t - th; if (age < 0) continue;
    const [x, y] = [sq.charCodeAt(0) - 97, 8 - parseInt(sq[1])];
    const col = kind === 'att' ? RED : [255, 160, 50];
    const k = Math.exp(-age / 0.35);
    const q = squareQuad(p, x, y, 0.02);
    c.save(); c.fillStyle = rgb(col, (0.55 + 0.25 * k) * smooth(age / 0.06)); c.fill(q); c.restore();
    e.save(); e.fillStyle = rgb(col, (0.2 + 0.5 * k)); e.fill(q); e.restore();
    // X mark
    const x1 = wline(p, [x + 0.28, y + 0.28], [x + 0.72, y + 0.72]), x2 = wline(p, [x + 0.72, y + 0.28], [x + 0.28, y + 0.72]);
    c.save(); c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 0.05 * cam.z; c.lineCap = 'round'; c.stroke(x1); c.stroke(x2); c.restore();
  }
}

// =====================================================================================================
// OVER-PIECE effects
// =====================================================================================================
export function drawOver(c, e, p, cam, t) {
  checkLayer(c, e, p, cam, t, false);
  shardsFx(c, e, p, cam, t);
  landingSparks(c, e, p, cam, t);
  promotionFx(c, e, p, cam, t);
  fireFx(c, e, p, cam, t);
  shockwaves(c, e, p, cam, t);
}

function shardsFx(c, e, p, cam, t) {
  for (const m of S.MOVES) {
    if (!m.captured) continue;
    const l = S.LAND[m.i], age = t - l;
    if (age < 0 || age > 0.95) continue;
    const white = m.captured.sym === m.captured.sym.toUpperCase();
    const base = white ? [236, 238, 240] : [96, 96, 102]; const edge = white ? [130, 134, 140] : [30, 30, 34];
    const hot = S.squareHeat(t, m.captured.xy[0], m.captured.xy[1]);
    const u = age / 0.9;
    for (let k = 0; k < 18; k++) {
      const h1 = hash3(m.i, k, 1), h2 = hash3(m.i, k, 2), h3 = hash3(m.i, k, 3), h4 = hash3(m.i, k, 4);
      const a = h1 * TAU, d = (0.4 + 1.7 * h2) * easeOutCubic(u);
      const q = pt(p, m.captured.xy[0] + Math.cos(a) * d, m.captured.xy[1] + Math.sin(a) * d);
      const up = cam.z * (0.25 + 0.5 * h3) * Math.sin(Math.PI * Math.min(u * 1.1, 1)) * 0.9;
      const sz = (0.055 + 0.1 * h4) * cam.z * q.s * (1 - 0.3 * u);
      const rot = h1 * TAU + age * (5 + 9 * h2) * (h3 < 0.5 ? -1 : 1);
      c.save(); c.translate(q.X, q.Y - up); c.rotate(rot);
      c.globalAlpha = Math.pow(1 - u, 0.8);
      c.beginPath();
      const nv = 4 + (k % 2);
      for (let v = 0; v < nv; v++) { const ang = (v / nv) * TAU + h2 * 2, rr = sz * (0.55 + 0.6 * hash3(m.i * 31 + k, v, 5)); v ? c.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr) : c.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr); }
      c.closePath();
      c.fillStyle = rgb(mixColor(base, [255, 170, 90], hot * 0.6)); c.fill(); c.lineWidth = Math.max(1.2, sz * 0.14); c.strokeStyle = rgb(edge); c.lineJoin = 'round'; c.stroke();
      c.restore();
    }
    // impact flash + shock ring
    if (age < 0.22) {
      const q = pt(p, m.captured.xy[0], m.captured.xy[1]); const f = 1 - age / 0.22;
      const r = 0.9 * cam.z * q.s;
      const g = e.createRadialGradient(q.X, q.Y, 0, q.X, q.Y, r);
      g.addColorStop(0, `rgba(255,255,255,${0.45 * f})`); g.addColorStop(1, 'rgba(255,200,120,0)');
      e.save(); e.fillStyle = g; e.fillRect(q.X - r, q.Y - r, r * 2, r * 2); e.restore();
    }
  }
}

function landingSparks(c, e, p, cam, t) {
  for (let i = 0; i < S.MOVES.length; i++) {
    const age = t - S.LAND[i];
    if (age < 0 || age > 0.5) continue;
    const m = S.MOVES[i]; const col = mixColor(S.CCOL[S.CLASS[i]], [255, 255, 255], 0.45);
    const q = pt(p, m.to_xy[0], m.to_xy[1]);
    const u = age / 0.5; const n = m.captured ? 18 : 10;
    for (let k = 0; k < n; k++) {
      const a = hash3(i, k, 11) * TAU, sp = 0.5 + hash3(i, k, 12) * 1.1;
      const r0 = cam.z * q.s * (0.2 + sp * 0.9 * easeOutCubic(u)), r1 = r0 + cam.z * q.s * 0.28 * (1 - u) * sp;
      c.save(); c.strokeStyle = rgb(col, 0.9 * (1 - u)); c.lineWidth = 2.5 * (1 - u) + 1; c.lineCap = 'round';
      c.beginPath(); c.moveTo(q.X + Math.cos(a) * r0, q.Y + Math.sin(a) * r0); c.lineTo(q.X + Math.cos(a) * r1, q.Y + Math.sin(a) * r1); c.stroke(); c.restore();
      e.save(); e.strokeStyle = rgb(col, 0.6 * (1 - u)); e.lineWidth = 5 * (1 - u) + 2; e.lineCap = 'round';
      e.beginPath(); e.moveTo(q.X + Math.cos(a) * r0, q.Y + Math.sin(a) * r0); e.lineTo(q.X + Math.cos(a) * r1, q.Y + Math.sin(a) * r1); e.stroke(); e.restore();
    }
  }
}

// ---- promotion menu (43.4 "you thought I'd queen" -> 46.39 "but I chose the knight") -------------------
const PROMO = { t0: 43.4, tSel: 45.35, t1: 46.30 };
function promotionFx(c, e, p, cam, t) {
  const { t0, tSel, t1 } = PROMO;
  if (t < t0 || t > S.LAND[13] + 0.6) return;
  const out = 1 - smooth((t - t1) / 0.09);
  const gx = 6, gy0 = 7; // g1 is (6,7), panel grows towards g4
  const opts = [['q', 0], ['n', 1], ['r', 2], ['b', 3]];
  const sel = t < tSel ? 0 : 1;
  const hop = smooth((t - tSel) / 0.12);
  for (const [sym, k] of opts) {
    const appear = easeOutBack((t - (t0 + 0.07 * k)) / 0.26, 2.0) * out;
    if (appear <= 0.01) continue;
    const cy = gy0 - k;           // card squares g1,g2,g3,g4
    const A = p.affine(gx, cy);
    const isSel = (k === 0 && t < tSel) || (k === 1 && t >= tSel);
    const dim = (k === 0 && t >= tSel) ? 1 - 0.55 * hop : 1;
    c.save();
    c.setTransform(A[0] * SC, A[1] * SC, A[2] * SC, A[3] * SC, A[4] * SC, A[5] * SC);
    // card
    const pad = 0.08;
    const rr = 0.14;
    c.translate(0.5, 0.5); c.scale(appear, appear); c.translate(-0.5, -0.5);
    c.beginPath(); c.roundRect(pad, pad, 1 - 2 * pad, 1 - 2 * pad, rr);
    const glow = isSel ? 1 : 0;
    c.fillStyle = isSel ? 'rgba(255,255,255,0.97)' : 'rgba(225,228,232,0.9)'; c.globalAlpha = dim;
    c.shadowColor = isSel ? 'rgba(80,220,255,0.95)' : 'rgba(0,0,0,0.5)'; c.shadowBlur = isSel ? 0.3 * cam.z : 0.1 * cam.z; c.fill(); c.shadowBlur = 0;
    if (isSel) { c.lineWidth = 0.035; c.strokeStyle = 'rgb(60,200,255)'; c.stroke(); }
    c.save(); c.translate(0.5, 0.5); c.scale(0.9, 0.9); c.translate(-0.5, -0.5); c.scale(1 / 45, 1 / 45);
    drawPiece(c, sym, { heat: 0.0 }); c.restore();
    c.restore();
    if (isSel) { const a = pt(p, gx + 0.5, cy + 0.5); const r = cam.z * 0.7 * a.s; const g = e.createRadialGradient(a.X, a.Y, 0, a.X, a.Y, r); g.addColorStop(0, 'rgba(90,220,255,0.55)'); g.addColorStop(1, 'rgba(90,220,255,0)'); e.save(); e.fillStyle = g; e.fillRect(a.X - r, a.Y - r, 2 * r, 2 * r); e.restore(); }
  }
  // selection "click" ring
  const age = t - tSel;
  if (age > 0 && age < 0.5) {
    const a = pt(p, gx + 0.5, gy0 - 1 + 0.5); const u = age / 0.5;
    c.save(); c.strokeStyle = rgb([100, 225, 255], 0.9 * (1 - u)); c.lineWidth = 3; c.beginPath(); c.arc(a.X, a.Y, cam.z * a.s * (0.5 + 0.8 * u), 0, TAU); c.stroke(); c.restore();
  }
}

// ---- fire: embers, flames ------------------------------------------------------------------------------
export function fireFx(c, e, p, cam, t) {
  const H0 = S.heatAt(t);
  if (H0 < 0.05 || t < S.IGNITE.t) return;
  const zs = Math.min(2, Math.max(0.75, cam.z / 250));
  // embers
  const N = 230;
  c.save(); c.globalCompositeOperation = 'lighter';
  for (let n = 0; n < N; n++) {
    const L = 1.4 + hash2(n, 1) * 2.4, ph = hash2(n, 2) * L;
    const cyc = Math.floor((t + ph) / L), u = ((t + ph) % L) / L;
    const sx = Math.floor(hash3(n, cyc, 3) * 8), sy = Math.floor(hash3(n, cyc, 4) * 8);
    const hs = S.squareHeat(t, sx + 0.5, sy + 0.5);
    if (hs < 0.25) continue;
    const wx = sx + hash3(n, cyc, 5), wy = sy + hash3(n, cyc, 6);
    const q = pt(p, wx, wy);
    const rise = u * L * (60 + 120 * hash2(n, 7)) * zs * 1.6;
    const X = q.X + Math.sin(u * 7 + n) * 18 * zs + (hash2(n, 8) - 0.5) * 30 * u * zs, Y = q.Y - rise;
    if (X < -60 || X > W + 60 || Y < -60 || Y > H + 60) continue;
    const sz = (6 + 14 * hash2(n, 9)) * zs * Math.pow(1 - u, 0.6) * (0.6 + 0.8 * H0);
    const a = Math.pow(1 - u, 1.1) * hs * (0.5 + 0.5 * noise1(t * 9 + n, 4));
    c.globalAlpha = Math.min(1, a); c.drawImage(EMBER, X - sz, Y - sz, sz * 2, sz * 2);
    if (n % 3 === 0) { e.save(); e.globalAlpha = Math.min(1, a) * 0.8; e.drawImage(EMBER, X - sz * 1.6, Y - sz * 1.6, sz * 3.2, sz * 3.2); e.restore(); }
  }
  // fire sheet: soft particles streaming up from the glowing seams between squares
  const NF = 150;
  for (let n = 0; n < NF; n++) {
    const L = 0.55 + hash2(n, 31) * 0.8, ph = hash2(n, 32) * L;
    const cyc = Math.floor((t + ph) / L), u = ((t + ph) % L) / L;
    const sx = Math.floor(hash3(n, cyc, 33) * 8), sy = Math.floor(hash3(n, cyc, 34) * 8);
    const hs = S.squareHeat(t, sx + 0.5, sy + 0.5); if (hs < 0.3) continue;
    const vert = hash3(n, cyc, 35) > 0.5;
    const wx = vert ? sx + (hash3(n, cyc, 36) > 0.5 ? 0 : 1) : sx + hash3(n, cyc, 37);
    const wy = vert ? sy + hash3(n, cyc, 38) : sy + (hash3(n, cyc, 39) > 0.5 ? 0 : 1);
    const q = pt(p, wx, wy);
    const fl = 0.6 + 0.4 * noise1(t * 7 + n * 1.9, n);
    const X = q.X + Math.sin(u * 5 + n) * 10 * zs, Y = q.Y - u * L * 210 * zs * (0.7 + 0.6 * H0);
    const w = (42 + 34 * hash2(n, 40)) * zs * (1 - 0.65 * u) * (0.7 + 0.5 * H0), h2 = w * (1.5 + 0.7 * fl);
    c.globalAlpha = 0.30 * hs * (1 - u) * fl * (0.6 + 0.6 * H0);
    c.drawImage(EMBER, X - w, Y - h2, w * 2, h2 * 2);
    if (n % 2 === 0) { e.save(); e.globalAlpha = 0.18 * hs * (1 - u) * fl; e.drawImage(EMBER, X - w * 1.4, Y - h2 * 1.4, w * 2.8, h2 * 2.8); e.restore(); }
  }
  c.restore();
}

// big expanding fire shockwaves on the song's biggest hits
const SHOCKS = [[30.24, [4.5, 6.5]], [36.93, [5.5, 6.5]], [52.34, [4.5, 6.5]]];
function shockwaves(c, e, p, cam, t) {
  for (const [t0, xy] of SHOCKS) {
    const age = t - t0; if (age < 0 || age > 0.85) continue;
    const u = age / 0.85, q = pt(p, xy[0], xy[1]);
    const r = (0.15 + 5.2 * easeOutCubic(u)) * cam.z * q.s * 0.62;
    const a = Math.pow(1 - u, 1.4);
    c.save(); c.strokeStyle = rgb([255, 210, 150], 0.75 * a); c.lineWidth = 0.2 * cam.z * (1 - u) + 2; c.beginPath(); c.arc(q.X, q.Y, r, 0, TAU); c.stroke(); c.restore();
    e.save(); e.strokeStyle = rgb([255, 120, 40], 0.6 * a); e.lineWidth = 0.34 * cam.z * (1 - u) + 4; e.beginPath(); e.arc(q.X, q.Y, r, 0, TAU); e.stroke(); e.restore();
    // spark spray riding the ring
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 46; k++) {
      const ang = hash3(Math.floor(t0 * 10), k, 5) * TAU, jit = 0.85 + 0.3 * hash3(Math.floor(t0 * 10), k, 6);
      const x0 = q.X + Math.cos(ang) * r * jit, y0 = q.Y + Math.sin(ang) * r * jit * 0.9;
      const len = cam.z * 0.25 * (1 - u) * (0.5 + hash3(Math.floor(t0 * 10), k, 7));
      c.strokeStyle = rgb([255, 190, 110], 0.8 * a); c.lineWidth = 3 * (1 - u) + 1; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len); c.stroke();
    }
    c.restore();
  }
}

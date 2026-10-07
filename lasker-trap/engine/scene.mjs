// Frame renderer: draws the whole shot for time t onto a 1080x1350 skia canvas.
import { Canvas, FontLibrary, Path2D } from 'skia-canvas';
import fs from 'fs';
import { clamp, lerp, smooth, smoother, easeOutCubic, easeOutBack, easeInOutCubic, TAU, DEG, hash, hash2, hash3, noise1, mixColor, rgb } from './util.mjs';
import { W, H, SCALE, camAt, makeProj } from './camera.mjs';
import * as FX from './fx.mjs';
import * as FIN from './finale.mjs';
import * as HUD from './hud.mjs';
import * as S from './state.mjs';
import { drawPiece } from './pieces.mjs';

const FD = new URL('../fonts/', import.meta.url).pathname;
FontLibrary.use('Anton', [FD + 'Anton.woff']);
FontLibrary.use('Bebas', [FD + 'BebasNeue.woff']);
FontLibrary.use('InterX', [FD + 'Inter-ExtraBold.woff']);
FontLibrary.use('InterS', [FD + 'Inter-SemiBold.woff']);

const mk = (w, h) => new Canvas(Math.round(w), Math.round(h));
export const main = mk(W * SCALE, H * SCALE);
const M = main.getContext('2d');
const Ec = mk(W / 2 * SCALE, H / 2 * SCALE), E = Ec.getContext('2d');     // emissive layer (blurred later)
const B1c = mk(W / 2 * SCALE, H / 2 * SCALE), B1 = B1c.getContext('2d');
const B2c = mk(W / 8 * SCALE, H / 8 * SCALE), B2 = B2c.getContext('2d');
const B3c = mk(W / 8 * SCALE, H / 8 * SCALE), B3 = B3c.getContext('2d');

// film grain tile
const GR = 256;
const grainC = mk(GR, GR), grainX = grainC.getContext('2d');
{
  const id = grainX.createImageData(GR, GR);
  for (let i = 0; i < GR * GR; i++) { const v = Math.floor(hash(i + 991) * 255); id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; }
  grainX.putImageData(id, 0, 0);
}

export const COL = {
  lightC: [222, 225, 220], darkC: [33, 34, 37], lightH: [118, 80, 64], darkH: [14, 9, 7],
  fire: [255, 140, 40], hot: [255, 205, 120], red: [238, 56, 56],
};

// ---- helpers ---------------------------------------------------------------------------------------------
function quad(p, x, y, w = 1, h = 1) {
  const a = p(x, y, {}), b = p(x + w, y, {}), c = p(x + w, y + h, {}), d = p(x, y + h, {});
  const path = new Path2D();
  path.moveTo(a.X, a.Y); path.lineTo(b.X, b.Y); path.lineTo(c.X, c.Y); path.lineTo(d.X, d.Y); path.closePath();
  return { path, pts: [a, b, c, d] };
}
function onScreen(pts, pad = 80) {
  let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
  for (const q of pts) { minx = Math.min(minx, q.X); maxx = Math.max(maxx, q.X); miny = Math.min(miny, q.Y); maxy = Math.max(maxy, q.Y); }
  return !(maxx < -pad || minx > W + pad || maxy < -pad || miny > H + pad);
}
function ringPoly(p, cx, cy, r, n = 56) {
  const path = new Path2D();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU, q = p(cx + Math.cos(a) * r, cy + Math.sin(a) * r, {});
    if (i === 0) path.moveTo(q.X, q.Y); else path.lineTo(q.X, q.Y);
  }
  path.closePath();
  return path;
}
function polyLine(p, pts) {
  const path = new Path2D();
  pts.forEach(([x, y], i) => { const q = p(x, y, {}); i ? path.lineTo(q.X, q.Y) : path.moveTo(q.X, q.Y); });
  return path;
}

// jagged (burnt) square outline, deterministic per square
function squarePath(p, sx, sy, heat) {
  if (heat < 0.35) return quad(p, sx, sy);
  const j = smooth((heat - 0.35) / 0.5);
  const path = new Path2D(); const pts = [];
  const N = 5;
  const edge = (x0, y0, x1, y1, e) => {
    for (let k = 0; k < N; k++) {
      const u = k / N;
      const n = (hash3(sx * 8 + sy, e, k) - 0.5) * 2;
      const nx = -(y1 - y0), ny = (x1 - x0);   // normal
      const amp = 0.055 * j * (k === 0 ? 0.3 : 1);
      const x = lerp(x0, x1, u) + nx * n * amp, y = lerp(y0, y1, u) + ny * n * amp;
      const q = p(x, y, {}); pts.push({ ...q });
    }
  };
  edge(sx, sy, sx + 1, sy, 0); edge(sx + 1, sy, sx + 1, sy + 1, 1); edge(sx + 1, sy + 1, sx, sy + 1, 2); edge(sx, sy + 1, sx, sy, 3);
  pts.forEach((q, i) => (i ? path.lineTo(q.X, q.Y) : path.moveTo(q.X, q.Y)));
  path.closePath();
  return { path, pts };
}

// ---- main render -------------------------------------------------------------------------------------------
const PROF = !!process.env.PROFILE; const prof = {}; let _pt = 0;
const lap = (n) => { if (!PROF) return; main.toBufferSync('raw'); const now = performance.now(); prof[n] = (prof[n] || 0) + now - _pt; _pt = now; };
export function profReport() { return prof; }
export function renderFrame(t, opts = {}) {
  if (PROF) _pt = performance.now();
  const cam = camAt(t);
  const p = makeProj(cam);
  const heatG = S.heatAt(t);
  const beat = S.pulse(t);

  M.setTransform(SCALE, 0, 0, SCALE, 0, 0); M.globalAlpha = 1; M.globalCompositeOperation = 'source-over'; M.filter = 'none';
  E.setTransform(1, 0, 0, 1, 0, 0); E.clearRect(0, 0, Ec.width, Ec.height);
  E.setTransform(0.5 * SCALE, 0, 0, 0.5 * SCALE, 0, 0); E.globalCompositeOperation = 'lighter'; E.globalAlpha = 1;

  drawBackground(M, t, heatG, beat); lap('bg');
  drawBoard(M, E, p, cam, t); lap('board');
  FX.drawUnder(M, E, p, cam, t); lap('fxUnder');
  drawPieces(M, E, p, cam, t); lap('pieces');
  FX.drawOver(M, E, p, cam, t); lap('fxOver');
  drawOverlays(M, E, p, cam, t); HUD.drawCoords(M, p, cam, t); lap('overlays');
  drawDust(M, E, p, cam, t); lap('dust');
  HUD.drawNotation(M, t);
  FIN.drawFinale(M, E, t); lap('finale');
  if (opts.extra) opts.extra(M, E, p, cam, t);

  postProcess(t, heatG, beat); lap('post');
  return main;
}

function drawBackground(c, t, heat, beat) {
  const g = c.createRadialGradient(W / 2, H * 0.48, 40, W / 2, H * 0.48, 900);
  const cold = [[30, 33, 38], [10, 11, 13]], hot = [[40, 18, 8], [6, 3, 2]];
  const a = mixColor(cold[0], hot[0], heat), b = mixColor(cold[1], hot[1], heat);
  g.addColorStop(0, rgb(a)); g.addColorStop(1, rgb(b));
  c.fillStyle = g; c.fillRect(0, 0, W, H);
}

function drawBoard(c, e, p, cam, t) {
  // board slab (dark base so there are no AA seams) + frame
  const slab = quad(p, -0.28, -0.28, 8.56, 8.56);
  const hmean = S.heatAt(t);
  c.save();
  c.shadowColor = hmean > 0.3 ? 'rgba(255,110,20,0.55)' : 'rgba(0,0,0,0.6)'; c.shadowBlur = 60 * cam.z / 200;
  c.fillStyle = rgb(mixColor([14, 15, 17], [20, 10, 6], hmean)); c.fill(slab.path);
  c.restore();
  // base fill for the playfield (dark squares colour)
  const field = quad(p, 0, 0, 8, 8);
  c.fillStyle = rgb(mixColor(COL.darkC, COL.darkH, hmean)); c.fill(field.path);

  const hls = S.highlights(t);
  const hlAt = new Map();
  for (const h of hls) { const k = `${Math.floor(h.xy[0])},${Math.floor(h.xy[1])}`; (hlAt.get(k) || hlAt.set(k, []).get(k)).push(h); }

  for (let sy = 0; sy < 8; sy++) for (let sx = 0; sx < 8; sx++) {
    const light = (sx + sy) % 2 === 0;
    const hs = S.squareHeat(t, sx + 0.5, sy + 0.5);
    const sp = squarePath(p, sx, sy, hs);
    if (!onScreen(sp.pts)) continue;
    const base = light ? mixColor(COL.lightC, COL.lightH, hs) : mixColor(COL.darkC, COL.darkH, hs);
    // light squares in the inferno get a dimmer, warmer look
    const dim = light ? lerp(1, 0.9, hs) : 1;
    if (light || hs > 0.2) {
      c.fillStyle = rgb(base.map((v) => Math.round(v * dim)));
      c.fill(sp.path);
    }
    if (hs > 0.15) {
      // glowing rim (burnt-paper edge)
      c.save(); c.strokeStyle = `rgba(255,${Math.round(110 + 60 * hash2(sx, sy))},40,${0.8 * hs})`; c.lineWidth = 0.035 * cam.z * (0.7 + 0.5 * hash2(sy, sx));
      c.lineJoin = 'round'; c.stroke(sp.path); c.restore();
      e.save(); e.strokeStyle = `rgba(255,120,30,${0.32 * hs})`; e.lineWidth = 0.06 * cam.z; e.stroke(sp.path); e.restore();
      // glowing paper centre + burnt edges
      const cc = p(sx + 0.5, sy + 0.5, {});
      const rad = 0.78 * cam.z * cc.s;
      const fl = 0.7 + 0.3 * noise1(t * 3 + sx * 1.7 + sy * 2.9, 5);
      const g = c.createRadialGradient(cc.X, cc.Y, 0, cc.X, cc.Y, rad);
      if (light) { g.addColorStop(0, `rgba(250,180,130,${0.30 * hs * fl})`); g.addColorStop(0.7, `rgba(190,110,70,${0.12 * hs})`); g.addColorStop(1, `rgba(40,12,4,${0.55 * hs})`); }
      else { g.addColorStop(0, `rgba(255,120,30,${0.16 * hs * fl})`); g.addColorStop(1, `rgba(0,0,0,${0.3 * hs})`); }
      c.save(); c.fillStyle = g; c.fill(sp.path); c.restore();
    }
    // highlights (last move etc.)
    const hl = hlAt.get(`${sx},${sy}`);
    if (hl) for (const h of hl) {
      const colr = light ? h.col : h.col.map((v) => Math.round(v * 0.62));
      c.save(); c.fillStyle = rgb(colr, h.a * (light ? 0.9 : 0.95)); c.fill(sp.path); c.restore();
      e.save(); e.fillStyle = rgb(h.col, h.a * 0.16); e.fill(sp.path); e.restore();
      if (h.kind === 'to' && h.landed) {
        const fl = Math.exp(-h.since / 0.10);
        if (fl > 0.02) { e.save(); e.fillStyle = rgb(mixColor(h.col, [255, 255, 255], 0.2), 0.16 * fl); e.fill(sp.path); e.restore(); }
      }
    }
  }
}

function drawPieces(c, e, p, cam, t) {
  const pcs = S.piecesAt(t);
  const order = pcs.filter((q) => !q.gone).sort((a, b) => (a.moving - b.moving) || (a.y - b.y));
  for (const q of order) {
    const hs = S.squareHeat(t, q.x, q.y);
    const A = p.affine(q.x - 0.5, q.y - 0.5);
    const cs = p(q.x, q.y, {});
    if (cs.X < -200 || cs.X > W + 200 || cs.Y < -200 || cs.Y > H + 200) continue;
    let sc = 1 + 0.30 * q.lift;
    if (!q.moving && q.justLanded < 0.4) { const u = q.justLanded / 0.4; sc *= 1 + 0.10 * Math.sin(u * TAU * 1.0) * Math.exp(-u * 3.5); }
    if (q.morph > 0 && q.morph < 0.6) sc *= 1 + 0.35 * Math.exp(-q.morph / 0.12) * Math.cos(q.morph * 40);
    // soft shadow
    c.save(); c.setTransform(...A.map((v, i) => v * (i < 4 ? SCALE : SCALE)));
    const sh = 0.26 + 0.55 * q.lift;
    const g = c.createRadialGradient(0.5 + 0.04 * (1 + 2 * q.lift), 0.66 + 0.10 * q.lift, 0, 0.5 + 0.04 * (1 + 2 * q.lift), 0.66 + 0.10 * q.lift, 0.36 * (1 + 0.3 * q.lift));
    g.addColorStop(0, `rgba(0,0,0,${0.42 * (1 - 0.4 * q.lift)})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(-0.5, 0, 2, 1.6);
    c.restore();
    // piece
    c.save(); c.setTransform(...A.map((v) => v * SCALE));
    c.translate(0.5, 0.5 - 0.07 * q.lift); c.scale(sc * 0.94, sc * 0.94); c.translate(-0.5, -0.5);
    c.scale(1 / 45, 1 / 45);
    drawPiece(c, q.sym, { heat: hs });
    c.restore();
    if (hs > 0.3) { // warm rim light on pieces in the fire
      e.save(); e.setTransform(...A.map((v) => v * 0.5 * SCALE)); e.translate(0.5, 0.5 - 0.07 * q.lift); e.scale(sc * 0.94, sc * 0.94); e.translate(-0.5, -0.5); e.scale(1 / 45, 1 / 45);
      e.globalAlpha = 0.22 * hs; drawPiece(e, q.sym, { heat: 1 }); e.restore();
    }
  }
}

function badgeAt(c, e, p, cam, t) {
  for (let i = 0; i < S.MOVES.length; i++) {
    const b = S.BADGE[S.CLASS[i]];
    if (!b) continue;
    const l = S.LAND[i], nextS = i + 1 < S.MOVES.length ? S.START[i + 1] : 1e9;
    const age = t - l;
    if (age < 0) continue;
    const out = smooth((t - (nextS - 0.05)) / 0.18);
    if (out >= 1) continue;
    const m = S.MOVES[i];
    const pop = easeOutBack(age / 0.28, 2.2) * (1 - out);
    if (pop <= 0.01) continue;
    const q = p(m.to_xy[0] + 0.40, m.to_xy[1] - 0.40, {});
    const r = 0.25 * cam.z * q.s * pop;
    // ripple rings
    for (let k = 0; k < 2; k++) {
      const u = clamp((age - k * 0.16) / 0.75);
      if (u <= 0 || u >= 1) continue;
      c.save(); c.strokeStyle = rgb(b.bg, 0.8 * (1 - u)); c.lineWidth = 3; c.beginPath(); c.arc(q.X, q.Y, r * (1 + 1.6 * easeOutCubic(u)), 0, TAU); c.stroke(); c.restore();
      e.save(); e.strokeStyle = rgb(b.bg, 0.8 * (1 - u)); e.lineWidth = 6; e.beginPath(); e.arc(q.X, q.Y, r * (1 + 1.6 * easeOutCubic(u)), 0, TAU); e.stroke(); e.restore();
    }
    // glow + disc
    e.save(); e.fillStyle = rgb(b.bg, 0.35); e.beginPath(); e.arc(q.X, q.Y, r * 1.15, 0, TAU); e.fill(); e.restore();
    c.save();
    c.shadowColor = rgb(b.bg, 0.9); c.shadowBlur = r * 0.9;
    const g = c.createRadialGradient(q.X - r * 0.3, q.Y - r * 0.35, r * 0.1, q.X, q.Y, r);
    g.addColorStop(0, rgb(mixColor(b.bg, [255, 255, 255], 0.35))); g.addColorStop(1, rgb(b.bg));
    c.fillStyle = g; c.beginPath(); c.arc(q.X, q.Y, r, 0, TAU); c.fill();
    c.shadowBlur = 0; c.lineWidth = Math.max(2, r * 0.1); c.strokeStyle = 'rgba(255,255,255,0.85)'; c.stroke();
    c.fillStyle = '#fff'; c.strokeStyle = '#fff';
    if (b.glyph === 'star') {
      c.beginPath();
      for (let k = 0; k < 10; k++) { const rr = k % 2 ? r * 0.28 : r * 0.62; const a = -Math.PI / 2 + (k * Math.PI) / 5; c.lineTo(q.X + Math.cos(a) * rr, q.Y + Math.sin(a) * rr + r * 0.03); }
      c.closePath(); c.fill();
    } else {
      c.font = `${Math.round(r * (b.glyph.length > 1 ? 1.15 : 1.35))}px InterX`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(b.glyph, q.X, q.Y + r * 0.06);
    }
    c.restore();
  }
}

function drawOverlays(c, e, p, cam, t) {
  // landing rings on the board plane
  for (let i = 0; i < S.MOVES.length; i++) {
    const age = t - S.LAND[i];
    if (age < 0 || age > 0.9) continue;
    const m = S.MOVES[i]; const col = S.CCOL[S.CLASS[i]];
    for (let k = 0; k < 2; k++) {
      const u = clamp((age - k * 0.09) / 0.7);
      if (u <= 0 || u >= 1) continue;
      const r = 0.25 + 1.6 * easeOutCubic(u);
      const path = ringPoly(p, m.to_xy[0], m.to_xy[1], r);
      c.save(); c.strokeStyle = rgb(mixColor(col, [255, 255, 255], 0.3), 0.75 * (1 - u)); c.lineWidth = 0.05 * cam.z * (1 - 0.6 * u); c.stroke(path); c.restore();
      e.save(); e.strokeStyle = rgb(col, 0.45 * (1 - u)); e.lineWidth = 0.07 * cam.z * (1 - 0.6 * u); e.stroke(path); e.restore();
    }
  }
  badgeAt(c, e, p, cam, t);
}

function drawDust(c, e, p, cam, t) {
  // floating motes, so the empty space between moves still feels alive (cold section)
  const cold = 1 - smooth((t - 26.5) / 0.6); if (cold <= 0.01) return;
  c.save(); c.globalCompositeOperation = 'lighter';
  for (let n = 0; n < 70; n++) {
    const x = ((hash2(n, 1) * 1.4 + t * 0.012 * (0.4 + hash2(n, 3)) + cam.cx * 0.0) % 1.4) / 1.4 * W;
    const par = 0.4 + hash2(n, 2) * 0.8;
    const X = (hash2(n, 1) * W + Math.sin(t * 0.4 + n) * 30 - cam.ox * par * 2 + (cam.cx * cam.z * 0.25 * par)) % W;
    const Y = ((hash2(n, 4) * H - t * 14 * par + (cam.cy * cam.z * 0.25 * par)) % H + H) % H;
    const r = (1.2 + 3 * hash2(n, 5)) * par;
    c.globalAlpha = (0.10 + 0.22 * hash2(n, 6)) * cold * (0.6 + 0.4 * Math.sin(t * 1.3 + n));
    c.fillStyle = '#cfe3ff'; c.beginPath(); c.arc(((X % W) + W) % W, Y, r, 0, TAU); c.fill();
  }
  c.restore();
}

function postProcess(t, heat, beat) {
  const k = SCALE;
  // bloom from the emissive layer
  B1.setTransform(1, 0, 0, 1, 0, 0); B1.clearRect(0, 0, B1c.width, B1c.height); B1.filter = `blur(${6 * k}px)`; B1.drawImage(Ec, 0, 0); B1.filter = 'none';
  B2.setTransform(1, 0, 0, 1, 0, 0); B2.clearRect(0, 0, B2c.width, B2c.height); B2.drawImage(Ec, 0, 0, B2c.width, B2c.height);
  B3.setTransform(1, 0, 0, 1, 0, 0); B3.clearRect(0, 0, B3c.width, B3c.height); B3.filter = `blur(${5 * k}px)`; B3.drawImage(B2c, 0, 0); B3.filter = 'none';
  lap('p_blurs');
  M.setTransform(1, 0, 0, 1, 0, 0);
  M.globalCompositeOperation = 'lighter';
  M.globalAlpha = (0.55 - 0.12 * heat) + 0.18 * beat; M.drawImage(B1c, 0, 0, main.width, main.height);
  M.globalAlpha = 0.5 + 0.1 * heat + 0.16 * beat; M.drawImage(B3c, 0, 0, main.width, main.height);
  M.globalAlpha = 1; M.globalCompositeOperation = 'source-over';
  lap('p_bloomadd');
  // vignette
  const vg = M.createRadialGradient(main.width / 2, main.height * 0.48, main.height * 0.3, main.width / 2, main.height * 0.48, main.height * 0.82);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,0,${0.5 + 0.15 * heat})`);
  M.fillStyle = vg; M.fillRect(0, 0, main.width, main.height);
  lap('p_vig');
  // grain
  M.globalCompositeOperation = 'overlay'; M.globalAlpha = 0.045;
  const gx = Math.floor(hash(Math.floor(t * 60) * 3 + 1) * GR), gy = Math.floor(hash(Math.floor(t * 60) * 3 + 2) * GR);
  for (let yy = -GR; yy < main.height; yy += GR) for (let xx = -GR; xx < main.width; xx += GR) M.drawImage(grainC, xx + gx, yy + gy);
  M.globalAlpha = 1; M.globalCompositeOperation = 'source-over';
  lap('p_grain');
  // flashes
  FIN.drawFlashes(M, main.width, main.height, t);
  // chromatic aberration on big hits
  const ca = FIN.caAmount(t) * SCALE;
  if (ca > 0.4) chromatic(ca);
  const gl = FIN.glitchAmount(t) * SCALE;
  if (gl > 0.5) glitchSlices(gl, Math.floor(t * 60));
  // fades
  const fin = 1 - smooth(clamp((t - 0.05) / 1.3)), fout = smooth(clamp((t - 58.55) / 0.7));
  const f = Math.max(fin, fout);
  if (f > 0.001) { M.fillStyle = `rgba(0,0,0,${f})`; M.fillRect(0, 0, main.width, main.height); }
}

// Pixel-array post passes (no canvas->canvas feedback, so cost is constant per frame)
function chromatic(d) {
  const w = main.width, h = main.height, di = Math.max(1, Math.round(d));
  const id = M.getImageData(0, 0, w, h); const dst = id.data; const src = new Uint8ClampedArray(dst);
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      const xr = x - di < 0 ? 0 : x - di, xb = x + di >= w ? w - 1 : x + di;
      const o = row + x * 4;
      dst[o] = src[row + xr * 4]; dst[o + 2] = src[row + xb * 4 + 2];
    }
  }
  M.putImageData(id, 0, 0);
}
function glitchSlices(a, frame) {
  const w = main.width, h = main.height;
  const id = M.getImageData(0, 0, w, h); const buf = id.data; const src = new Uint8ClampedArray(buf);
  const n = 16;
  for (let k = 0; k < n; k++) {
    if (hash3(frame, k, 9) < 0.45) continue;
    const y0 = Math.floor((k * h) / n), y1 = Math.min(h, Math.ceil(((k + 1) * h) / n));
    const dx = Math.round((hash3(frame, k, 10) - 0.5) * 2 * a);
    if (!dx) continue;
    for (let y = y0; y < y1; y++) {
      const row = y * w * 4;
      if (dx > 0) { buf.set(src.subarray(row, row + (w - dx) * 4), row + dx * 4); }
      else { buf.set(src.subarray(row - dx * 4, row + w * 4), row); }
    }
  }
  M.putImageData(id, 0, 0);
}

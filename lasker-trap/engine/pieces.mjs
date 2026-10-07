// Vector piece rendering (cburnett silhouettes restyled into a flat, rounded "neo cartoon" look).
import fs from 'fs';
import { Path2D } from 'skia-canvas';
import { mixColor, rgb, hex } from './util.mjs';

const RAW = JSON.parse(fs.readFileSync(new URL('../data/pieces.json', import.meta.url)));
const PATHS = {};
for (const [sym, ops] of Object.entries(RAW)) PATHS[sym] = ops.map((o) => ({ ...o, path: new Path2D(o.d) }));

const isWhite = (s) => s === s.toUpperCase();
const isLight = (c) => !c || c === '#fff' || c === '#ffffff' || c === 'white';

// palette: [cold, hot] pairs
const WHITE = { top: [255, 255, 253], bot: [214, 217, 222], line: [118, 122, 128], hotTop: [255, 238, 222], hotBot: [226, 178, 142], hotLine: [120, 66, 40] };
const BLACK = { top: [118, 118, 122], bot: [78, 78, 83], line: [38, 38, 42], hotTop: [150, 128, 120], hotBot: [98, 82, 76], hotLine: [34, 20, 14], detail: [158, 158, 162], hotDetail: [200, 130, 90] };

/** Draws piece `sym` in a 45x45 box at the current transform. */
export function drawPiece(ctx, sym, { heat = 0, alpha = 1, rim = null } = {}) {
  const white = isWhite(sym);
  const P = white ? WHITE : BLACK;
  const top = mixColor(P.top, P.hotTop, heat), bot = mixColor(P.bot, P.hotBot, heat), line = mixColor(P.line, P.hotLine, heat);
  const g = ctx.createLinearGradient(0, 4, 0, 40);
  g.addColorStop(0, rgb(top)); g.addColorStop(1, rgb(bot));
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * alpha;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // pass 1: fat dark outline, then fat gradient fill -> chunky "sticker" silhouette
  const FAT = 1.5;
  // warm rim light so dark pieces separate from the charred dark squares
  if (!white && heat > 0.25) {
    const ra = Math.min(1, (heat - 0.2) / 0.5) * 0.8;
    for (const op of PATHS[sym]) {
      if (!(op.fill && op.fill !== 'none')) continue;
      ctx.save();
      if (op.tf) ctx.transform(...op.tf);
      ctx.strokeStyle = rgb([236, 176, 128], ra); ctx.lineWidth = Math.max(op.sw, 1.5) + FAT + 1.7 + 2.6;
      ctx.stroke(op.path);
      ctx.restore();
    }
  }
  for (const op of PATHS[sym]) {
    if (!(op.fill && op.fill !== 'none')) continue;
    ctx.save();
    if (op.tf) ctx.transform(...op.tf);
    ctx.strokeStyle = rgb(line); ctx.lineWidth = Math.max(op.sw, 1.5) + FAT + 1.7;
    ctx.stroke(op.path);
    ctx.restore();
  }
  for (const op of PATHS[sym]) {
    if (!(op.fill && op.fill !== 'none')) continue;
    ctx.save();
    if (op.tf) ctx.transform(...op.tf);
    ctx.fillStyle = g; ctx.strokeStyle = g; ctx.lineWidth = FAT;
    ctx.fill(op.path, 'evenodd');
    ctx.stroke(op.path);
    ctx.restore();
  }
  // pass 2: interior detail lines (fill none)
  for (const op of PATHS[sym]) {
    if (op.fill && op.fill !== 'none') continue;
    ctx.save();
    if (op.tf) ctx.transform(...op.tf);
    const c = white ? mixColor(P.line, P.hotLine, heat) : mixColor(P.detail, P.hotDetail, heat);
    ctx.strokeStyle = rgb(c, white ? 0.55 : 0.8); ctx.lineWidth = white ? 1.15 : 1.0;
    ctx.stroke(op.path);
    ctx.restore();
  }
  ctx.globalAlpha = prev;
}

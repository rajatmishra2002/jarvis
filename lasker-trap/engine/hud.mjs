// Teaching aids: board coordinates (a-h / 1-8) hugging the board edge + a move-notation chip under the board.
import { clamp, smooth, easeOutBack, rgb, mixColor } from './util.mjs';
import { W, H } from './camera.mjs';
import * as S from './state.mjs';

const FILES = 'abcdefgh';

export function drawCoords(c, p, cam, t) {
  // chess.com / lichess-style coordinates INSIDE the squares. Rank digits "stick" to the first on-screen file of each row
  // and file letters sit at the left of their square, so they stay visible when the camera pushes in a little.
  const heat = S.heatAt(t);
  const fade = smooth(t / 1.6) * (1 - 0.7 * smooth((t - 52.4) / 0.6));
  c.save();
  const tx = (light) => (light ? mixColor([62, 66, 74], [95, 40, 22], heat) : mixColor([214, 220, 230], [255, 196, 130], heat));
  for (let i = 0; i < 8; i++) {
    // rank digit: first file whose top-left corner is on screen
    for (let j = 0; j < 8; j++) {
      const r = p(j + 0.07, i + 0.06, {});
      if (r.X < 6) continue;
      if (r.X < W - 40 && r.Y > 4 && r.Y < H - 30) {
        const size = clamp(0.2 * cam.z * r.s, 11, 34);
        c.font = `${size}px InterS`; c.textAlign = 'left'; c.textBaseline = 'top';
        c.fillStyle = rgb(tx((j + i) % 2 === 0), 0.9 * fade); c.fillText(String(8 - i), r.X, r.Y);
      }
      break;
    }
    // file letter: bottom-left of its rank-1 square
    const f = p(i + 0.07, 7.94, {});
    if (f.X > 4 && f.X < W - 30 && f.Y > 30 && f.Y < H - 4) {
      const size = clamp(0.2 * cam.z * f.s, 11, 34);
      c.font = `${size}px InterS`; c.textAlign = 'left'; c.textBaseline = 'bottom';
      c.fillStyle = rgb(tx((i + 7) % 2 === 0), 0.9 * fade); c.fillText('abcdefgh'[i], f.X, f.Y);
    }
  }
  c.restore();
}

export function drawNotation(c, t) {
  // current move chip, centred under the board; fades away when the closing text takes over
  const out = 1 - smooth((t - 53.15) / 0.35);
  if (out <= 0.01) return;
  let cur = -1;
  for (let i = 0; i < S.MOVES.length; i++) if (t >= S.LAND[i] - 0.02) cur = i;
  if (cur < 0) return;
  const m = S.MOVES[cur], age = t - S.LAND[cur];
  const pop = easeOutBack(age / 0.2, 1.8), a = clamp(age / 0.08) * out;
  const label = m.notation.replace('...', '… ').replace(/^(\d+)\.(?!\.)/, '$1. ');
  const size = 58, cy = H - 70;
  c.save();
  c.translate(W / 2, cy + (1 - clamp(age / 0.16)) * 14); c.scale(0.9 + 0.1 * pop, 0.9 + 0.1 * pop);
  c.font = `${size}px Anton`; c.letterSpacing = '2px'; c.textAlign = 'center'; c.textBaseline = 'middle';
  const w = c.measureText(label).width + 100, h = 78;
  c.globalAlpha = a;
  c.fillStyle = 'rgba(9,10,13,0.58)'; c.beginPath(); c.roundRect(-w / 2, -h / 2, w, h, 24); c.fill();
  const acc = S.CCOL[S.CLASS[cur]];
  c.lineWidth = 3; c.strokeStyle = rgb(acc, 0.85); c.stroke();
  // who moved: white / black disc
  const white = m.color === 'w';
  c.beginPath(); c.arc(-w / 2 + 40, 0, 15, 0, Math.PI * 2); c.fillStyle = white ? '#f3f4f2' : '#1b1c1f'; c.fill();
  c.lineWidth = 3; c.strokeStyle = white ? '#9a9da3' : '#d6d8dc'; c.stroke();
  c.fillStyle = '#ffffff'; c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 8;
  c.fillText(label, 24, 3);
  c.restore();
}

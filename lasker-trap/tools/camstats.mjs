// How much of the board can a viewer actually see?  For every frame: zoom, roll, and the number of the 64
// squares whose centres are on screen (excluding the bottom HUD strip).  usage: node tools/camstats.mjs
import { camAt, makeProj, W, H } from '../engine/camera.mjs';
const N = Math.ceil(59.29 * 60);
const rows = [];
for (let f = 0; f < N; f++) {
  const t = f / 60, c = camAt(t), p = makeProj(c);
  let vis = 0;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const q = p(x + 0.5, y + 0.5, {}); if (q.X > 20 && q.X < W - 20 && q.Y > 20 && q.Y < H - 190) vis++; }
  rows.push({ t, z: c.z, roll: Math.abs(c.roll * 180 / Math.PI), vis });
}
const pct = (a, q) => a.slice().sort((x, y) => x - y)[Math.floor(q * (a.length - 1))];
const z = rows.map((r) => r.z), v = rows.map((r) => r.vis), ro = rows.map((r) => r.roll);
console.log('zoom px/square  min/median/p90/max:', pct(z, 0).toFixed(0), pct(z, .5).toFixed(0), pct(z, .9).toFixed(0), pct(z, 1).toFixed(0));
console.log('visible squares min/median/p10/max :', pct(v, 0), pct(v, .5), pct(v, .1), pct(v, 1));
console.log('|roll| deg      median/p90/max     :', pct(ro, .5).toFixed(1), pct(ro, .9).toFixed(1), pct(ro, 1).toFixed(1));
console.log('frames showing < 24 squares:', (100 * rows.filter((r) => r.vis < 24).length / N).toFixed(1) + '%   < 36:', (100 * rows.filter((r) => r.vis < 36).length / N).toFixed(1) + '%');

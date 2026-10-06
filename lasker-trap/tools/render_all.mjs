// usage: node tools/render_all.mjs <out.mp4> [workers=4] [frameLimit]
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { FPS, DURATION } from '../engine/state.mjs';

const out = path.resolve(process.argv[2] || 'out/lasker_trap.mp4');
const workers = parseInt(process.argv[3] || '4');
const total = process.argv[4] ? parseInt(process.argv[4]) : Math.ceil(DURATION * FPS);
const work = process.env.WORK || path.resolve('out/chunks');
fs.mkdirSync(work, { recursive: true }); fs.mkdirSync(path.dirname(out), { recursive: true });
const per = Math.ceil(total / workers);
const chunks = [];
for (let k = 0; k < workers; k++) { const a = k * per, b = Math.min(total, a + per); if (a < b) chunks.push([a, b, path.join(work, `c${k}.mp4`)]); }
console.log('frames', total, 'chunks', chunks.map((c) => c.slice(0, 2).join('-')).join(' '));
await Promise.all(chunks.map(([a, b, f]) => new Promise((res, rej) => {
  const p = spawn(process.execPath, ['tools/render_chunk.mjs', a, b, f], { stdio: 'inherit', env: process.env });
  p.on('close', (c) => (c === 0 ? res() : rej(new Error('chunk failed ' + a))));
})));
fs.writeFileSync(path.join(work, 'list.txt'), chunks.map((c) => `file '${c[2]}'`).join('\n'));
const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(work, 'list.txt'), '-i', 'data/song_full.wav',
  '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-t', String(DURATION), '-movflags', '+faststart', out], { stdio: 'inherit' });
if (r.status !== 0) process.exit(1);
console.log('wrote', out, (fs.statSync(out).size / 1e6).toFixed(1), 'MB');

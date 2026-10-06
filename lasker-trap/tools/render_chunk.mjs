// usage: node tools/render_chunk.mjs <fromFrame> <toFrameExclusive> <out.mp4>
// Renders frames [from,to) at 60fps and pipes raw RGBA straight into an x264 encoder.
import { spawn } from 'child_process';
import { renderFrame, main } from '../engine/scene.mjs';
import { W, H, SCALE } from '../engine/camera.mjs';
import { FPS } from '../engine/state.mjs';

const [from, to, out] = [parseInt(process.argv[2]), parseInt(process.argv[3]), process.argv[4]];
const w = Math.round(W * SCALE), h = Math.round(H * SCALE);
const crf = process.env.CRF || '16';
const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-r', String(FPS), '-i', '-',
  '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
  '-c:v', 'libx264', '-preset', process.env.PRESET || 'fast', '-crf', crf, '-g', '60', '-keyint_min', '60', '-sc_threshold', '0', '-threads', '2',
  '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-an', out], { stdio: ['pipe', 'inherit', 'inherit'] });
const done = new Promise((res) => ff.on('close', res));
const t0 = performance.now();
for (let f = from; f < to; f++) {
  renderFrame(f / FPS);
  const buf = main.toBufferSync('raw');
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  if ((f - from) % 100 === 0) console.log(`[${from}-${to}) frame ${f} ${(((performance.now() - t0) / 1000) / (f - from + 1)).toFixed(2)}s/frame`);
}
ff.stdin.end();
await done;
console.log(`chunk ${from}-${to} done in ${((performance.now() - t0) / 1000).toFixed(0)}s`);

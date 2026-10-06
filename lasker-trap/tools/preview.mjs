// usage: node tools/preview.mjs outdir t1 t2 ...   (SCALE env for half-res)
import fs from 'fs';
import { renderFrame, main } from '../engine/scene.mjs';
const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
for (const a of process.argv.slice(3)) {
  const t = parseFloat(a); const t0 = performance.now();
  renderFrame(t);
  fs.writeFileSync(`${out}/f_${a.padStart(6, '0')}.png`, main.toBufferSync('png'));
  console.log('t', t, 'ms', (performance.now() - t0).toFixed(0));
}

// walk frames [a,b) and report the last frame started (find hangs / slow frames)
import { renderFrame, main } from '../engine/scene.mjs';
const a = parseInt(process.argv[2]), b = parseInt(process.argv[3]);
for (let f = a; f < b; f++) {
  process.stdout.write(`f${f} `);
  const t0 = performance.now(); renderFrame(f / 60); main.toBufferSync('raw');
  const ms = performance.now() - t0; if (ms > 700) console.log(`SLOW(${ms.toFixed(0)}ms)`);
}
console.log('\nOK');

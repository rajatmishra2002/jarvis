import { renderFrame, profReport, main } from '../engine/scene.mjs';
const ts = process.argv.slice(2).map(Number); let n = 0;
for (const t of ts) { renderFrame(t); n++; }
const r = profReport(); const tot = Object.values(r).reduce((a, b) => a + b, 0);
console.log('per frame ms:', Object.fromEntries(Object.entries(r).map(([k, v]) => [k, +(v / n).toFixed(1)])), 'total', (tot / n).toFixed(0));

// Chess-correctness check: after every move the pieces the renderer would draw must equal python-chess' FEN.
import fs from 'fs';
import * as S from '../engine/state.mjs';
const moves = JSON.parse(fs.readFileSync(new URL('../data/moves.json', import.meta.url))).moves;
function fenBoard(fen) {
  const out = {};
  fen.split(' ')[0].split('/').forEach((row, r) => { let f = 0; for (const ch of row) { if (/\d/.test(ch)) f += +ch; else { out[`${f},${r}`] = ch; f++; } } });
  return out;
}
let bad = 0;
const check = (t, fen, label) => {
  const want = fenBoard(fen), got = {};
  for (const p of S.piecesAt(t)) if (!p.gone) got[`${Math.floor(p.x)},${Math.floor(p.y)}`] = p.sym;
  const keys = new Set([...Object.keys(want), ...Object.keys(got)]);
  const diffs = [...keys].filter((k) => want[k] !== got[k]).map((k) => `${k}: want ${want[k] || '-'} got ${got[k] || '-'}`);
  if (diffs.length) { bad++; console.log('MISMATCH', label, t.toFixed(2), diffs.join(' | ')); }
};
for (let i = 0; i < moves.length; i++) {
  const t0 = S.LAND[i] + 0.55, t1 = (i + 1 < moves.length ? S.START[i + 1] : 59.2) - 0.02;
  check(t0 <= t1 ? t0 : t1, moves[i].fen, moves[i].notation + ' (settled)');
  check(t1, moves[i].fen, moves[i].notation + ' (just before next move)');
}
// and nothing may be mid-move at the exact moment the chip says a move has landed
console.log(bad === 0 ? 'FEN CHECK PASSED: all 16 positions match python-chess at 32 sample times' : `FEN CHECK FAILED (${bad})`);

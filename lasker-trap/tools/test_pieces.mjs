import { Canvas } from 'skia-canvas';
import fs from 'fs';
import { drawPiece } from '../engine/pieces.mjs';
const c = new Canvas(1080, 540), x = c.getContext('2d');
const syms = ['K','Q','R','B','N','P','k','q','r','b','n','p'];
for (let row = 0; row < 3; row++) {
  const heat = [0, 0.5, 1][row];
  for (let i = 0; i < 12; i++) {
    const sx = i * 90, sy = row * 180;
    const light = (i + row) % 2 === 0;
    x.fillStyle = light ? '#e6e8e3' : '#262626'; x.fillRect(sx, sy, 90, 180);
    for (let k=0;k<2;k++){
      x.save(); x.translate(sx + 5, sy + 5 + k*90); x.scale(80 / 45, 80 / 45); drawPiece(x, syms[(i + k*6)%12], { heat }); x.restore();
    }
  }
}
fs.writeFileSync(process.argv[2], c.toBufferSync('png'));

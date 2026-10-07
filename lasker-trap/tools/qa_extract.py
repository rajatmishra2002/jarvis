"""Extract exact QA frames: every 0.5 s (by frame number, no fps-filter drift), one post-move frame per landing,
and per-10-second contact sheets.  usage: python3 tools/qa_extract.py <video.mp4> <outdir>"""
import json, os, subprocess, sys
from PIL import Image, ImageDraw
V, Q = sys.argv[1], sys.argv[2]
for d in ('half', 'land', 'sheets'): os.makedirs(f'{Q}/{d}', exist_ok=True)
mv = json.load(open('data/moves.json'))['moves']
LAND = [3.64, 6.81, 10.28, 13.46, 17.49, 19.62, 21.40, 25.88, 31.13, 34.49, 35.31, 36.93, 39.00, 46.39, 46.93, 48.81]
ts = [k * 0.5 for k in range(119)]
sel = '+'.join(f'eq(n\\,{int(round(t*60))})' for t in ts)
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', V, '-vf', f"select='{sel}',scale=540:675", '-vsync', '0', f'{Q}/half/h_%03d.png'], check=True)
landings = []
for i, (m, l) in enumerate(zip(mv, LAND)):
    t = l + 0.45
    p = f'{Q}/land/L{i+1:02d}_{m["notation"].replace("...","_b_").replace(".","_")}.png'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{t:.3f}', '-i', V, '-frames:v', '1', '-vf', 'scale=720:900', p], check=True)
    landings.append(dict(i=i+1, notation=m['notation'], land=l, sample_t=round(t, 2), file=p, fen=m['fen'].split(' ')[0]))
json.dump(landings, open(Q + '/landings.json', 'w'), indent=1)
res = []
for a, b in [(0, 10), (10, 20), (20, 30), (30, 40), (40, 50), (50, 59.3)]:
    ids = [k for k in range(1, 120) if a <= ts[k-1] < b]
    fl = [f'{Q}/half/h_{k:03d}.png' for k in ids]
    ims = [Image.open(f).convert('RGB').resize((270, 338)) for f in fl]
    sh = Image.new('RGB', (5 * 270, ((len(ims) + 4) // 5) * 338))
    for j, (im, k) in enumerate(zip(ims, ids)):
        ImageDraw.Draw(im).text((6, 6), f't={ts[k-1]:.1f}s', fill=(255, 255, 0)); sh.paste(im, ((j % 5) * 270, (j // 5) * 338))
    sheet = f'{Q}/sheets/seg_{a}_{int(b)}.png'; sh.save(sheet)
    res.append(dict(a=a, b=b, sheet=sheet, frames=[dict(t=ts[k-1], file=f) for k, f in zip(ids, fl)], landings=[l for l in landings if a <= l['land'] < b]))
json.dump(res, open(Q + '/segments.json', 'w'), indent=1)
print('ok', Q)

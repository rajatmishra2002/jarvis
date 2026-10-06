import sys, glob
from PIL import Image, ImageDraw
files = sys.argv[3:]; out = sys.argv[1]; cols = int(sys.argv[2])
ims = [Image.open(f).convert('RGB') for f in files]
w = ims[0].width; h = ims[0].height
rows = (len(ims) + cols - 1) // cols
S = Image.new('RGB', (cols * w, rows * h))
for i, (f, im) in enumerate(zip(files, ims)):
    d = ImageDraw.Draw(im); d.text((6, 6), f.split('/')[-1].replace('f_', '').replace('.png', ''), fill=(255, 255, 0))
    S.paste(im, ((i % cols) * w, (i // cols) * h))
S.save(out)

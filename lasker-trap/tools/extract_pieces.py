"""Extract vector piece art from python-chess (cburnett set, GPLv2+) into data/pieces.json.
Each piece -> list of draw ops: {d, fill, stroke, sw, cap, join, tf}"""
import json, re, xml.etree.ElementTree as ET
import chess.svg

def parse_style(s):
    out = {}
    for part in (s or '').split(';'):
        if ':' in part:
            k, v = part.split(':', 1)
            out[k.strip()] = v.strip()
    return out

def parse_tf(t):
    if not t:
        return None
    m = re.match(r'matrix\(([^)]*)\)', t)
    if m:
        return [float(x) for x in re.split(r'[ ,]+', m.group(1).strip())]
    m = re.match(r'translate\(([^)]*)\)', t)
    if m:
        v = [float(x) for x in re.split(r'[ ,]+', m.group(1).strip())]
        return [1, 0, 0, 1, v[0], v[1] if len(v) > 1 else 0]
    raise ValueError(t)

pieces = {}
INHERIT = ('fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin')

def walk(el, inh, ops):
    tag = el.tag.split('}')[-1]
    a = dict(inh)
    for k in INHERIT:
        if k in el.attrib:
            a[k] = el.attrib[k]
    st = parse_style(el.attrib.get('style'))
    for k, v in st.items():
        a[k] = v
    if tag in ('path', 'circle'):
        if tag == 'path':
            d = el.attrib['d']
        else:
            cx, cy, r = (float(el.attrib[k]) for k in ('cx', 'cy', 'r'))
            d = f'M{cx-r} {cy}a{r} {r} 0 1 0 {2*r} 0a{r} {r} 0 1 0 {-2*r} 0z'
        ops.append(dict(d=d, fill=a.get('fill', 'none'), stroke=a.get('stroke', 'none'),
                        sw=float(a.get('stroke-width', 1.5)), cap=a.get('stroke-linecap', 'round'),
                        join=a.get('stroke-linejoin', 'round'), tf=parse_tf(el.attrib.get('transform'))))
    for ch in el:
        walk(ch, a, ops)

for sym, svg in chess.svg.PIECES.items():
    ops = []
    walk(ET.fromstring(svg), {}, ops)
    pieces[sym] = ops
json.dump(pieces, open('data/pieces.json', 'w'))
print({k: len(v) for k, v in pieces.items()})

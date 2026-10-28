"""Build lossless occupied-cell meshes from ROS maps. Dev dependency: PyYAML.

Uses the same row-run merging as warotrans_simulation/generate_warehouse.py.
ContentHash follows the Navigation import contract: SHA256(PGM bytes + YAML bytes).
Run: python3 scripts/build-map-models.py [path/to/warotrans]
"""
from pathlib import Path
import hashlib
import json
import math
import sys
import yaml

app = Path(__file__).resolve().parents[1]
ros = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else app.parent.parent / 'warotrans'
src = ros / 'ros2_ws/src'


def read_pgm(data):
    tokens, i = [], 0
    while len(tokens) < 4:
        while data[i:i+1].isspace():
            i += 1
        if data[i:i+1] == b'#':
            while data[i:i+1] not in (b'\n', b''):
                i += 1
            continue
        j = i
        while data[j:j+1] and not data[j:j+1].isspace():
            j += 1
        tokens.append(data[i:j])
        i = j
    assert tokens[0] == b'P5' and int(tokens[3]) == 255
    w, h = int(tokens[1]), int(tokens[2])
    pixels = data[i+1:]
    assert len(pixels) == w*h
    return w, h, pixels


def mesh(w, h, cells):
    opened, rects = {}, []
    for y in range(h+1):
        runs, x = set(), 0
        while y < h and x < w:
            if cells[y*w+x]:
                start = x
                while x < w and cells[y*w+x]:
                    x += 1
                runs.add((start, x))
            else:
                x += 1
        for span, start_y in list(opened.items()):
            if span not in runs:
                rects.append([span[0], start_y, span[1]-span[0], y-start_y])
                del opened[span]
        for span in sorted(runs):
            opened.setdefault(span, y)
    return rects


def layout_matches(layout, geometry, occupied):
    """Do not attach semantic rack footprints to a stale generated map."""
    sx, sy = layout['size']['x'], layout['size']['y']
    t, res = layout['wall']['thickness'], layout['map']['resolution']
    border = t + layout['map']['margin']
    w, h = math.ceil((sx+2*border)/res), math.ceil((sy+2*border)/res)
    expected = dict(imageWidthPixels=w, imageHeightPixels=h, resolution=res,
                    originX=-border, originY=-border, originYaw=0)
    if any(abs(expected[k]-geometry[k]) > 1e-8 for k in expected):
        return False
    boxes = [(sx/2,-t/2,sx+2*t,t), (sx/2,sy+t/2,sx+2*t,t),
             (-t/2,sy/2,t,sy), (sx+t/2,sy/2,t,sy)]
    boxes += [(b['x'],b['y'],b['sx'],b['sy']) for b in layout['shelves']+layout.get('obstacles',[])]
    cells = [False] * (w*h)
    for x,y,bx,by in boxes:
        x0,x1 = math.floor((x-bx/2+border)/res), math.ceil((x+bx/2+border)/res)
        y0,y1 = math.floor((y-by/2+border)/res), math.ceil((y+by/2+border)/res)
        for py in range(max(0,y0),min(h,y1)):
            for px in range(max(0,x0),min(w,x1)):
                cells[(h-1-py)*w+px] = True
    return cells == occupied


models = []
layout_path = src/'warotrans_simulation/config/warehouse_layout.yaml'
layout = yaml.safe_load(layout_path.read_text())
source_pgm, source_meta = None, None
if layout.get('source_map'):
    source_yaml = src/'warotrans_simulation'/layout['source_map']
    source_meta = yaml.safe_load(source_yaml.read_text())
    source_pgm = (source_yaml.parent/source_meta['image']).read_bytes()

for package, key in [('warotrans_simulation', 'sim_warehouse'), ('warotrans_navigation', 'warotrans_map3'), ('warotrans_navigation', 'warotrans_map2')]:
    base = src / package / 'maps' / key
    pgm, yml = base.with_suffix('.pgm').read_bytes(), base.with_suffix('.yaml').read_bytes()
    meta = yaml.safe_load(yml)
    w, h, pixels = read_pgm(pgm)
    occupancy = [(p/255 if meta['negate'] else 1-p/255) for p in pixels]
    occupied = [p > meta['occupied_thresh'] for p in occupancy]
    unknown = [meta['free_thresh'] <= p <= meta['occupied_thresh'] for p in occupancy]
    geometry = dict(imageWidthPixels=w, imageHeightPixels=h, resolution=meta['resolution'], originX=meta['origin'][0], originY=meta['origin'][1], originYaw=meta['origin'][2])
    model = dict(key=key, contentHash=hashlib.sha256(pgm+yml).hexdigest(), geometry=geometry, occupied=mesh(w,h,occupied), unknown=mesh(w,h,unknown))
    if source_meta and pgm == source_pgm and all(meta[k] == source_meta[k] for k in ('resolution','origin','negate','occupied_thresh','free_thresh')):
        # The web-uploaded scan and navigation scan may have differently formatted YAML.
        # Rack footprints still apply only to the byte-identical PGM with identical calibration.
        model['shelves'] = [dict(code=s['code'], name=s.get('name', s['code']),
                                 x=(s['x0']+s['x1'])/2, y=(s['y0']+s['y1'])/2,
                                 sx=s['x1']-s['x0'], sy=s['y1']-s['y0'], levels=s.get('levels',2))
                            for s in layout.get('shelves',[])]
    elif key == 'sim_warehouse':
        # Semantic rack footprints are only valid for the generated layout, never source_map scans.
        if layout['name'] == key and not layout.get('source_map') and layout_matches(layout, geometry, occupied):
            model['shelves'] = [{k: s[k] for k in ('code','name','x','y','sx','sy','levels')} for s in layout['shelves']]
            model['floorPaint'] = [{k: z[k] for k in ('name','x0','y0','x1','y1')} for z in layout['floor_zones'] if z.get('fill') or z.get('line_color')]
    models.append(model)
output = app/'src/shared/maps/rosMapModels.json'
output.write_text(json.dumps(models, separators=(',', ':'))+'\n')
print(f'Built {len(models)} map models ({output.stat().st_size} bytes)')

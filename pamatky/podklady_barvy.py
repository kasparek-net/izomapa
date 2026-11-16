# vzorkování barev z fotek památky: průměr (a medián) RGB z ručně zvolené oblasti -> podklady-soukrome/pamatky/<slug>/barvy.json
# .venv/bin/python pamatky/podklady_barvy.py slug "co" foto x0 y0 x1 y1 [...další šestice "co" foto x0 y0 x1 y1]
#   foto = 03 (fotky/03.jpg) nebo jméno souboru v <slug>/ (orto_raw.jpg) nebo cesta (fotky/<slug>/IMG_1.jpg); x0..y1 = podíl šířky/výšky (0–1)
#   --nahled  uloží <slug>/barvy_nahled.jpg s vyznačenými oblastmi; --smaz vymaže barvy.json
import json, os, sys
from PIL import Image, ImageDraw, ImageStat
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
a = sys.argv[1:]; slug = a.pop(0); d = os.path.join(ROOT, 'podklady-soukrome', 'pamatky', slug); f = os.path.join(d, 'barvy.json')
nahled = '--nahled' in a; a = [x for x in a if x != '--nahled']
if '--smaz' in a: a.remove('--smaz'); os.makedirs(d, exist_ok=True); json.dump([], open(f, 'w', encoding='utf-8'))
B = json.load(open(f, encoding='utf-8')) if os.path.exists(f) else []
def path(ph):
    if os.path.exists(os.path.join(d, 'fotky', ph + '.jpg')): return os.path.join(d, 'fotky', ph + '.jpg'), ph + '.jpg'
    if os.path.exists(os.path.join(d, ph)): return os.path.join(d, ph), ph
    return ph, os.path.basename(ph)
marks = {}
while a:
    co, ph, x0, y0, x1, y1 = a[:6]; a = a[6:]
    p, nm = path(ph); im = Image.open(p).convert('RGB'); W, H = im.size
    box = [float(x0), float(y0), float(x1), float(y1)]
    c = im.crop((int(box[0] * W), int(box[1] * H), int(box[2] * W), int(box[3] * H)))
    m = [round(v) for v in ImageStat.Stat(c).mean]; md = [round(v) for v in ImageStat.Stat(c).median]
    B = [b for b in B if b['co'] != co] + [{'co': co, 'foto': nm, 'box': box, 'rgb': m, 'median': md, 'hex': '#%02x%02x%02x' % tuple(m)}]
    marks.setdefault(p, []).append((co, box))
    print(co, nm, m, '#%02x%02x%02x' % tuple(m), 'medián', md)
json.dump(B, open(f, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
if nahled:
    ims = []
    for p, ms in marks.items():
        im = Image.open(p).convert('RGB'); W, H = im.size; dr = ImageDraw.Draw(im)
        for co, b in ms:
            dr.rectangle((b[0] * W, b[1] * H, b[2] * W, b[3] * H), outline=(255, 0, 0), width=4); dr.text((b[0] * W + 4, b[1] * H + 4), co, fill=(255, 255, 0))
        im.thumbnail((900, 700)); ims.append(im)
    w = sum(i.width for i in ims); h = max(i.height for i in ims); o = Image.new('RGB', (w, h), 'white'); x = 0
    for i in ims: o.paste(i, (x, 0)); x += i.width
    o.save(os.path.join(d, 'barvy_nahled.jpg'), quality=80)

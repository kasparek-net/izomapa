# ortofoto ČÚZK (CC BY 4.0) s obrysy budov z dat (build/…/info_src.json), oid a laserovou výškou pro podklady památek (jen místní, mimo git)
# .venv/bin/python pamatky/podklady_orto.py [slug …] [--r 80] [--znovu]  -> podklady-soukrome/pamatky/<slug>/orto.jpg, orto_raw.jpg, orto.json
import json, math, os, sys, time, urllib.request, urllib.parse
from PIL import Image, ImageDraw, ImageFont
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT); sys.path.insert(0, ROOT)
import geo
OUT = os.path.join(ROOT, 'podklady-soukrome', 'pamatky')
LON0, LAT0, KX, KY = geo.LON0, geo.LAT0, geo.KX, geo.KY
S = 1400
WMS = 'https://ags.cuzk.gov.cz/arcgis1/services/ORTOFOTO/MapServer/WMSServer'

def pismo(n):
    for f in ('/System/Library/Fonts/Helvetica.ttc', 'DejaVuSans.ttf', 'arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'):
        try: return ImageFont.truetype(f, n)
        except Exception: pass
    try: return ImageFont.load_default(size=n)
    except Exception: return ImageFont.load_default()

_C = {}
def load(ct=(0, 0)):
    ct = tuple(ct)
    if ct in _C: return _C[ct]
    I = json.load(open(os.path.join(ROOT, geo.chunk_dir(ct), 'info_src.json'), encoding='utf-8'))
    cx, cy = geo.chunk_center(ct)                  # střed čtverce ve světových metrech
    B = {}
    for b in I['buildings']:
        r = [[x + cx, y + cy] for x, y in b['ring']]
        e = B.setdefault(b['oid'], {'oid': b['oid'], 'rings': [], 'name': b.get('name'), 'cls': b.get('cls'), 'addr': [], 'h': b.get('h'),
                                    'roof': b.get('roof'), 'floors': b.get('floors'), 'top': b.get('top'), 'base': b.get('base')})
        e['rings'].append(r); e['addr'] += [a for a in b.get('addr') or [] if a not in e['addr']]
        e['top'] = max(e['top'] or -1e9, b.get('top') or -1e9); e['base'] = min(e['base'] or 1e9, b.get('base') or 1e9)
    D = {}
    for f in ('dmp_vysky.json', 'dmp_rucne.json'):                  # pozdější přebije dřívější
        fp = os.path.join(ROOT, 'assets', f)
        if not os.path.exists(fp): continue
        for k, v in json.load(open(fp, encoding='utf-8')).items():
            if not k.startswith('_'): D[k] = (v, f)
    _C[ct] = (B, D)
    return B, D

def area(r):
    return abs(sum(r[i][0] * r[i - 1][1] - r[i - 1][0] * r[i][1] for i in range(len(r)))) / 2

def centroid(r):
    return sum(p[0] for p in r) / len(r), sum(p[1] for p in r) / len(r)

def inside(p, r):
    x, y = p; c = False
    for i in range(len(r)):
        (x1, y1), (x2, y2) = r[i - 1], r[i]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1: c = not c
    return c

def dist_seg(p, a, b):
    ax, ay = a; bx, by = b; px, py = p; dx, dy = bx - ax, by - ay
    t = 0 if dx == dy == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - ax - t * dx, py - ay - t * dy)

def dist_ring(p, r):
    if inside(p, r): return 0.0
    return min(dist_seg(p, r[i - 1], r[i]) for i in range(len(r)))

def ring_gap(r1, r2):
    return min(min(dist_ring(p, r2) for p in r1), min(dist_ring(p, r1) for p in r2))

def run(slug, B, D, R=None):
    P = json.load(open(os.path.join(ROOT, 'pamatky', slug + '.json'), encoding='utf-8'))
    d = os.path.join(OUT, slug); os.makedirs(d, exist_ok=True)
    ram = P.get('ram') or {}; L = ram.get('L') or 0
    bx, by = (ram['x'], ram['y']) if L else P['bod']
    R = R or max(45.0, L * 0.85 + 22)
    lat, lon = LAT0 + by / KY, LON0 + bx / KX
    dl, dla = R / KX, R / KY
    raw = os.path.join(d, 'orto_raw.jpg')
    if not os.path.exists(raw) or os.path.getsize(raw) < 5000 or '--znovu' in sys.argv:
        q = urllib.parse.urlencode({'SERVICE': 'WMS', 'VERSION': '1.3.0', 'REQUEST': 'GetMap', 'LAYERS': '0', 'STYLES': '', 'CRS': 'EPSG:4326',
                                    'BBOX': f'{lat - dla},{lon - dl},{lat + dla},{lon + dl}', 'WIDTH': S, 'HEIGHT': S, 'FORMAT': 'image/jpeg'})
        for k in range(4):
            try:
                data = urllib.request.urlopen(urllib.request.Request(WMS + '?' + q, headers={'User-Agent': 'izomapa-pamatky/0.1 (orthophoto)'}), timeout=90).read(); break
            except Exception:
                if k == 3: raise
                time.sleep(5 * (k + 1))
        open(raw, 'wb').write(data)
    im = Image.open(raw).convert('RGB'); dr = ImageDraw.Draw(im)
    f13 = pismo(13); f20 = pismo(20)
    X = lambda x, y: ((x - (bx - R)) / (2 * R) * S, ((by + R) - y) / (2 * R) * S)
    mine = {o for o in B if any(o.startswith(m) for m in P.get('oids') or [])}; rows = []   # json má někdy jen prefix oid
    for oid, b in B.items():
        if not any(abs(x - bx) < R * 1.05 and abs(y - by) < R * 1.05 for r in b['rings'] for x, y in r): continue
        a = sum(area(r) for r in b['rings'])
        if a < 12: continue
        main = max(b['rings'], key=area); c = centroid(main)
        pd = [x for x in P.get('budovy') or []]
        gap = min((ring_gap(main, m['ring']) for m in pd), default=None) if pd else None
        dm = D.get(oid)
        rows.append({'oid': oid, 'addr': b['addr'], 'name': b['name'], 'cls': b['cls'], 'plocha': round(a), 'roof': b['roof'], 'floors': b['floors'],
                     'h_mapa': b['h'], 'top_base': round(b['top'] - b['base'], 1) if b['top'] and b['base'] else None,
                     'dmp': dm[0] if dm else None, 'dmp_zdroj': dm[1] if dm else None, 'pamatka': oid in mine,
                     'vzdal_od_bodu': round(dist_ring(P['bod'], main), 1), 'mezera_k_pamatce': None if gap is None else round(gap, 1)})
        col = (0, 230, 255) if oid in mine else (255, 0, 255)
        for r in b['rings']:
            dr.line([X(*q) for q in r + r[:1]], fill=col, width=4 if oid in mine else 2)
        u, v = X(*c)
        t = oid[:8] + ('\n' + (f'{dm[0][0]:.1f}/{dm[0][1]:.1f} m' if dm else 'laser ?'))
        bb = dr.multiline_textbbox((u, v), t, font=f13, anchor='mm', align='center')
        dr.rectangle((bb[0] - 3, bb[1] - 2, bb[2] + 3, bb[3] + 2), fill=(0, 0, 0))
        dr.multiline_text((u, v), t, fill=(0, 230, 255) if oid in mine else ((255, 255, 0) if dm else (255, 120, 120)), font=f13, anchor='mm', align='center')
    # bod z Wikidat (červený křížek), sever, měřítko, zdroj
    u, v = X(*P['bod'])
    for w, c in ((6, 'white'), (3, (230, 30, 30))): dr.line((u - 16, v, u + 16, v), fill=c, width=w); dr.line((u, v - 16, u, v + 16), fill=c, width=w)
    m10 = 10 / (2 * R) * S; dr.rectangle((20, S - 50, 20 + m10 * (2 if R > 60 else 1), S - 40), fill='white', outline='black')
    dr.text((20, S - 72), f'{20 if R > 60 else 10} m', fill='white', font=f20, stroke_width=2, stroke_fill='black')
    dr.polygon([(S - 40, 40), (S - 52, 72), (S - 28, 72)], fill='white', outline='black'); dr.text((S - 40, 78), 'S', fill='white', font=f20, anchor='mt', stroke_width=2, stroke_fill='black')
    dr.text((20, 20), f"{P['nazev']}  (tyrkys = oids památky, purpur = ostatní; popisek = oid[:8], laser medián/p90)", fill='white', font=f20, stroke_width=2, stroke_fill='black')
    dr.text((S - 20, S - 20), 'ortofoto © ČÚZK, budovy © přispěvatelé OpenStreetMap', fill='white', font=f13, anchor='rb', stroke_width=2, stroke_fill='black')
    im.save(os.path.join(d, 'orto.jpg'), quality=86)
    rows.sort(key=lambda r: (not r['pamatka'], r['mezera_k_pamatce'] if r['mezera_k_pamatce'] is not None else r['vzdal_od_bodu']))
    json.dump({'stred': [lat, lon], 'polomer_m': round(R, 1), 'budovy': rows}, open(os.path.join(d, 'orto.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(slug, 'R', round(R), 'budov', len(rows), flush=True)

if __name__ == '__main__':
    a = sys.argv[1:]; R = None
    if '--r' in a: R = float(a[a.index('--r') + 1]); a = [x for i, x in enumerate(a) if x != '--r' and (i == 0 or a[i - 1] != '--r')]
    for s in [x for x in a if not x.startswith('--')] or json.load(open(os.path.join(ROOT, 'pamatky', 'seznam.json'), encoding='utf-8')):
        try:
            B, D = load(json.load(open(os.path.join(ROOT, 'pamatky', s + '.json'), encoding='utf-8')).get('ctverec') or (0, 0))
            run(s, B, D, R)
        except Exception as e: print(s, 'CHYBA', e, flush=True)

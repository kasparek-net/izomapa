# viditelnost staveb z pohledu mapy (kamera od jihozápadu): kolik pixelů fasád a střechy zůstane vidět za sousedy
#   .venv/bin/python pamatky/viditelnost.py            památky ze seznam.json -> podklady-soukrome/pamatky/viditelnost.md
# Jako modul ji používá pamatky/kandidati.py (pořadí kandidátů). Každou budovu čtverce promítne jako hranol (zdi obrácené ke kameře
# + střecha) a kreslí od nejvzdálenější (malířův algoritmus). Stromy se nepočítají (v parcích bude skutečnost horší).
# Jednotky: pixely mapy při největším přiblížení (0,2 m/px); podíl = kolik ze zdí obrácených ke kameře není zakryto.
import json, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT); sys.path.insert(0, ROOT)
import numpy as np, geo
from PIL import Image, ImageDraw
from shapely.geometry import Polygon

MPP = 0.4; K = (MPP / 0.2) ** 2                      # počítá se v 0,4 m/px, pixel je 4 pixely mapy při 0,2 m/px


def budovy(C):
    """budovy čtverce C z info_src.json (světové souřadnice) s viditelnými pixely zdí a střechy"""
    with np.errstate(all='ignore'):                    # numpy na Macu hlásí u matmul falešná varování (výsledky jsou v pořádku)
        return _budovy(C)


def _budovy(C):
    f = f'{geo.chunk_dir(C)}/info_src.json'
    if not os.path.exists(f): return None
    info = json.load(open(f, encoding='utf-8'))['buildings']
    cx, cy = geo.chunk_center(C)
    B = []
    for b in info:
        ring = [(x + cx, y + cy) for x, y in b['ring']]
        if len(ring) < 3: continue
        P = Polygon(ring)
        if not P.is_valid or P.area < 4: continue
        if P.exterior.is_ccw is False: ring = ring[::-1]
        rg = b.get('roof_geometry')
        top = (rg['eave'] + 0.5 * rg['height']) if rg else b['top']      # šikmá střecha: hranol do půlky střechy
        B.append({'i': len(B), 'oid': b['oid'], 'name': b.get('name'), 'cls': b.get('cls'), 'addr': (b.get('addr') or [None])[0], 'ring': ring,
                  'poly': P, 'base': b['base'], 'top': max(top, b['base'] + 2), 'full': b['top'], 'lat': b['lat'], 'lon': b['lon']})
    if not B: return B
    allx = np.array([p for b in B for p in b['ring']])
    vx0, vy0, _ = geo.view(allx[:, 0], allx[:, 1], np.full(len(allx), min(b['base'] for b in B)))
    vx1, vy1, _ = geo.view(allx[:, 0], allx[:, 1], np.full(len(allx), max(b['full'] for b in B)))
    X0, X1 = min(vx0.min(), vx1.min()) - 5, max(vx0.max(), vx1.max()) + 5
    Y0, Y1 = min(vy0.min(), vy1.min()) - 5, max(vy0.max(), vy1.max()) + 5
    img = Image.new('I', (int((X1 - X0) / MPP) + 1, int((Y1 - Y0) / MPP) + 1), 0); dr = ImageDraw.Draw(img)
    def px(x, y, h):
        vx, vy, _ = geo.view(x, y, h); return ((float(vx) - X0) / MPP, (Y1 - float(vy)) / MPP)
    def area(pts): return abs(sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))) / 2
    for b in B:
        c = b['poly'].centroid; b['depth'] = float(geo.view(c.x, c.y, b['base'])[2])
        b['zdi'] = []; r = b['ring']
        for i in range(len(r)):
            (x0, y0), (x1, y1) = r[i], r[(i + 1) % len(r)]
            nx, ny = y1 - y0, -(x1 - x0)                               # vnější normála (obrys proti směru hodin)
            if nx * -1 + ny * -1 <= 0: continue                       # zeď odvrácená od kamery (ta je na JZ)
            b['zdi'].append([px(x0, y0, b['base']), px(x1, y1, b['base']), px(x1, y1, b['top']), px(x0, y0, b['top'])])
        b['strecha'] = [px(x, y, b['top']) for x, y in r]
        b['zdi_px'] = sum(area(q) for q in b['zdi']); b['strecha_px'] = area(b['strecha'])
    for b in sorted(B, key=lambda b: -b['depth']):                     # od nejvzdálenější
        for q in b['zdi']: dr.polygon(q, fill=b['i'] * 2 + 2)
        dr.polygon(b['strecha'], fill=b['i'] * 2 + 3)
    cnt = np.bincount(np.asarray(img).ravel(), minlength=len(B) * 2 + 4)
    for b in B: b['zdi_vid'] = int(cnt[b['i'] * 2 + 2]); b['strecha_vid'] = int(cnt[b['i'] * 2 + 3])
    return B


def souhrn(kusy):
    """viditelnost skupiny budov (díly jedné stavby)"""
    zp, zv = sum(b['zdi_px'] for b in kusy), sum(b['zdi_vid'] for b in kusy)
    sp, sv = sum(b['strecha_px'] for b in kusy), sum(b['strecha_vid'] for b in kusy)
    return {'plocha_m2': round(sum(b['poly'].area for b in kusy)), 'vyska_m': round(max(b['full'] - b['base'] for b in kusy), 1),
            'fasady_px': round(zv * K), 'fasady_podil': round(zv / zp, 2) if zp else 0,
            'strecha_px': round(sv * K), 'strecha_podil': round(sv / sp, 2) if sp else 0, 'celkem_px': round((zv + sv) * K)}


def kusy_podle_oid(B, oids):
    return [b for b in B if any(o and b['oid'].startswith(o) for o in oids)]


if __name__ == '__main__':
    seznam = json.load(open('pamatky/seznam.json', encoding='utf-8')) if os.path.exists('pamatky/seznam.json') else []
    if not seznam: sys.exit('pamatky/seznam.json je prázdný – nejdřív pamatky/kandidati.py a pamatky/sestav.py --novy')
    D = {s: json.load(open(f'pamatky/{s}.json', encoding='utf-8')) for s in seznam}
    cache, out = {}, []
    for s, d in D.items():
        gx, gy = geo.to_local(d['lon'], d['lat']); C = geo.chunk_of(float(gx), float(gy))
        if C not in cache: cache[C] = budovy(C) or []
        kusy = kusy_podle_oid(cache[C], d.get('oids') or [])
        e = {'slug': s, 'nazev': d['nazev'], 'skupina': d.get('skupina'), 'model': os.path.exists(f'pamatky/{s}.js'), 'adresa': kusy[0]['addr'] if kusy else None}
        e.update(souhrn(kusy) if kusy else {'fasady_px': 0, 'fasady_podil': 0, 'strecha_px': 0, 'strecha_podil': 0, 'vyska_m': None})
        out.append(e)
    out.sort(key=lambda e: -e['fasady_px'])
    os.makedirs('podklady-soukrome/pamatky', exist_ok=True)
    with open('podklady-soukrome/pamatky/viditelnost.md', 'w', encoding='utf-8') as f:
        f.write('# Viditelnost památek ze seznamu z pohledu mapy (od JZ)\n\nfasády px = viditelná plocha zdí v pixelech mapy při největším '
                'přiblížení (0,2 m/px); podíl = kolik ze zdí obrácených ke kameře není zakryto. Stromy se nepočítají. Bez budovy (sloup, socha) = 0.\n\n')
        f.write('| # | slug | název | skupina | model | fasády px | podíl fasád | střecha px | výška m | adresa |\n|---|---|---|---|---|---|---|---|---|---|\n')
        for i, e in enumerate(out):
            f.write(f"| {i + 1} | `{e['slug']}` | {e['nazev']} | {e['skupina'] or ''} | {'ano' if e['model'] else ''} | {e['fasady_px']} | "
                    f"{int(e['fasady_podil'] * 100)} % | {e['strecha_px']} | {e['vyska_m'] or ''} | {e['adresa'] or ''} |\n")
    for e in out[:15]: print(f"{e['fasady_px']:>8} px  {e['slug']:24} {e['nazev']}")
    print('památek', len(out), '→ podklady-soukrome/pamatky/viditelnost.md')

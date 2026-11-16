# vlastní modely památek: výběr a napárování památky na budovy z dat a rámec modelu
#   .venv/bin/python pamatky/sestav.py --novy slug1 slug2 …    založí pamatky/<slug>.json z pamatky/kandidati.json (pamatky/kandidati.py)
#   .venv/bin/python pamatky/sestav.py --novy --top 10        prvních 10 kandidátů podle viditelnosti (jen se stavbou, bez drobných)
#        volitelně --skupina "Náměstí" (skupina v dashboardu, jinak „1. výběr“)
#   .venv/bin/python pamatky/sestav.py                         všechny památky ze seznam.json znovu
#   .venv/bin/python pamatky/sestav.py radnice                 jen jedna (po změně "oids" v pamatky/radnice.json)
# Do pamatky/<slug>.json doplní: bod (světové x, y = souřadnice čtverce 0,0), ctverec, budovy [{oid, ring}] (světové),
# ram {x, y, a, L, W} (opsaný obdélník všech budov, a = úhel delší strany v radiánech), z (výška terénu v bodě, přibližně).
# render.html pak budovy scény, jejichž vnitřní bod leží v některém "ring", nekreslí obecně, ale zavolá pamatky/<slug>.js.
import json, math, os, sys, tempfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT); sys.path.insert(0, ROOT)
import geo
import numpy as np
from shapely.geometry import Polygon, Point
from shapely.ops import unary_union

D = 'pamatky'
_INFO = {}
def info(c):
    c = tuple(c)
    if c not in _INFO:
        f = f'{geo.chunk_dir(c)}/info_src.json'
        if not os.path.exists(f): sys.exit(f'chybí {f} – čtverec {c} ještě není postavený (./postav.sh)')
        _INFO[c] = json.load(open(f, encoding='utf-8'))['buildings']
    return _INFO[c]


def zapis(f, data):
    """atomický zápis (render.html může soubor číst zrovna ve chvíli zápisu)"""
    fd, tmp = tempfile.mkstemp(dir=D, suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as fh: json.dump(data, fh, ensure_ascii=False, indent=1)
    os.replace(tmp, f)


def seznam():
    return json.load(open(f'{D}/seznam.json', encoding='utf-8')) if os.path.exists(f'{D}/seznam.json') else []


def novy(chci, top, skupina):
    if not os.path.exists(f'{D}/kandidati.json'): sys.exit('chybí pamatky/kandidati.json – nejdřív .venv/bin/python pamatky/kandidati.py')
    K = json.load(open(f'{D}/kandidati.json', encoding='utf-8')); by = {k['slug']: k for k in K}
    if top: chci = [k['slug'] for k in K if k['oids'] and not k.get('vybrano')][:top]
    S = seznam(); nove = []
    for slug in chci:
        f = f'{D}/{slug}.json'
        if slug in S or os.path.exists(f): print(f'  {slug}: už je, nechávám'); S += [] if slug in S else [slug]; continue
        if slug not in by: print(f'  ! {slug}: v kandidati.json není (překlep? .venv/bin/python pamatky/kandidati.py)'); continue
        k = by[slug]
        d = {'nazev': k['nazev'], 'skupina': skupina, 'druh': k['druh'], 'wikidata': k.get('wikidata'), 'uskp': k.get('uskp'),
             'lat': k['lat'], 'lon': k['lon'], 'foto': k.get('foto'), 'commons': k.get('commons'), 'wp': k.get('cswiki'), 'text': k.get('popis'),
             'typ': k.get('typ') or [], 'oids': k['oids']}
        zapis(f, d); S.append(slug); nove.append(slug)
    zapis(f'{D}/seznam.json', S)
    print(f'nových {len(nove)}, v seznamu {len(S)}')
    return nove


def sestav(slug):
    f = f'{D}/{slug}.json'; d = json.load(open(f, encoding='utf-8'))
    gx, gy = geo.to_local(d['lon'], d['lat']); gx, gy = float(gx), float(gy)
    c = geo.chunk_of(gx, gy); cx, cy = geo.chunk_center(c)
    full = []
    for o in d.get('oids', []):                                            # oid stačí zkrácené (začátek), musí být jednoznačné
        hit = [b for b in info(c) if o and b['oid'].startswith(o)]
        if not hit: print(f'  ! {slug}: budova {o} ve čtverci {c} není'); continue
        if len({b['oid'] for b in hit}) > 1: print(f'  ! {slug}: {o} není jednoznačné'); continue
        full += hit
    bud = [{'oid': b['oid'], 'ring': [[round(x + cx, 2), round(y + cy, 2)] for x, y in b['ring']], 'base': b['base'], 'top': b['top'],
            'addr': (b.get('addr') or [None])[0], 'name': b.get('name')} for b in full]
    d['ctverec'] = list(c); d['bod'] = [round(gx, 2), round(gy, 2)]; d['budovy'] = bud
    if bud:
        U = unary_union([Polygon(b['ring']).buffer(0) for b in bud]); o = U.minimum_rotated_rectangle
        cs = np.array(o.exterior.coords)[:4]; e1, e2 = cs[1] - cs[0], cs[2] - cs[1]
        if np.linalg.norm(e1) < np.linalg.norm(e2): e1, e2 = e2, e1
        d['ram'] = {'x': round(o.centroid.x, 2), 'y': round(o.centroid.y, 2), 'a': round(math.atan2(e1[1], e1[0]), 4),
                    'L': round(float(np.linalg.norm(e1)), 2), 'W': round(float(np.linalg.norm(e2)), 2)}
        d['z'] = round(min(b['base'] for b in bud) + 0.6, 2)
    else:                                                                  # samostatná stavba bez budovy (sloup, socha)
        d['ram'] = {'x': d['bod'][0], 'y': d['bod'][1], 'a': 0.0, 'L': 0.0, 'W': 0.0}
        near = min(info(c), key=lambda b: Polygon(b['ring']).distance(Point(gx - cx, gy - cy)))
        d['z'] = round(near['base'] + 0.6, 2)
    zapis(f, d)
    r = d['ram']
    print(f"{slug:28} čtverec {c} budov {len(bud)} rám {r['L']:.1f} × {r['W']:.1f} m úhel {math.degrees(r['a']):.0f}°")


if __name__ == '__main__':
    a = sys.argv[1:]
    sk = '1. výběr'
    if '--skupina' in a: i = a.index('--skupina'); sk = a[i + 1]; del a[i:i + 2]
    top = 0
    if '--top' in a: i = a.index('--top'); top = int(a[i + 1]); del a[i:i + 2]
    if '--novy' in a:
        a.remove('--novy')
        for s in novy(a, top, sk): sestav(s)
    else:
        for s in (a or seznam()): sestav(s)

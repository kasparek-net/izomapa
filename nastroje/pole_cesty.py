# Rozdělí velké bloky orné půdy ze ZABAGED podle polních cest, silnic, tratí a potoků na menší pole
# (každé pak v prep.py dostane vlastní plodinu a směr řádků, místo jedné barvy přes kilometry).
# Dělí se jednou pro celou mapu (cesty ze všech čtverců), aby pole přes hranici čtverců navazovala.
# -> assets/zabaged.json klíč 'orna_dil' (polygony [[lat, lon], ...], první kruh vnější, další díry)
# spouštět z kořene repa po nastroje/zabaged.py a nastroje/pole.py: python nastroje/pole_cesty.py
import sys, os, json, glob; sys.path.insert(0, '.')
import numpy as np, shapely, pyarrow.parquet as pq, geo
from shapely.geometry import Polygon

CESTY = {'track', 'path', 'unclassified', 'tertiary', 'secondary', 'primary', 'trunk', 'motorway', 'residential',
         'service', 'living_street', 'cycleway', 'unknown', 'standard_gauge', 'narrow_gauge'}
VODA = {'stream', 'river', 'canal', 'ditch', 'drain'}
MIN_POLE = 5000          # m²; menší kusy (klíny u křižovatek cest) se přidají k sousednímu poli
SIRKA = 1.0              # polovina šířky pásu, který cesta z pole vyřízne (m); cestu pak stejně kreslí prep.py


def loc(g): return shapely.transform(g, lambda c: np.column_stack(geo.to_local(c[:, 0], c[:, 1])))


def polys(g):
    if g.is_empty: return []
    if g.geom_type == 'Polygon': return [g]
    return [p for q in getattr(g, 'geoms', []) for p in polys(q)]


cary = {}
for d in sorted(glob.glob('data*/')):
    for jm, tridy in (('segment', CESTY), ('water', VODA)):
        try: t = pq.read_table(f'{d}{jm}.parquet', columns=['id', 'class', 'geometry']).to_pandas()
        except FileNotFoundError: continue
        for i, c, g in zip(t['id'], t['class'], t['geometry']):
            if i in cary or c not in tridy: continue
            g = shapely.from_wkb(g)
            if g.geom_type in ('LineString', 'MultiLineString'): cary[i] = loc(g)
cary = list(cary.values())
strom = shapely.STRtree(cary)
print('cest a potoků', len(cary))

# --- 2. krok: zbytky dál podle ortofota (build/orto_cele.jpg z nastroje/les.py, 2 m/px) a plodina podle barvy ---
# Barva pole na ortofotu (vyhlazená na ~22 m) -> jas -> plodina: světle hnědé obilí/strniště = wheat, šedohnědé = rape,
# šedozelené = soil (v létě zelená), tmavě zelené = maize. Oblasti pod MIN_OBLAST se přidají k okolí.
# Mimo ortofoto (okraj za mapou) zůstane pole celé a plodinu vylosuje prep.py (None).
MIN_OBLAST = 40000       # m² (4 ha)
PRAHY = [(125, 'wheat'), (92, 'rape'), (60, 'soil'), (-1, 'maize')]   # jas 0–255, podle shluků barev polí v Kyjově
ORTO = None
if os.path.exists('build/orto_cele.jpg') and os.path.exists('build/les_maska.json'):
    from PIL import Image, ImageDraw
    from scipy import ndimage
    Image.MAX_IMAGE_PIXELS = None
    ORTO = np.asarray(Image.open('build/orto_cele.jpg').convert('RGB')).astype(np.float32)
    OX0, OY1, OM = json.load(open('build/les_maska.json'))['x0y1m']
    JAS = ndimage.uniform_filter(ORTO.mean(-1), 11)
    TMA = ndimage.uniform_filter((ORTO.sum(-1) < 15).astype(np.float32), 7) > 0.5      # bez snímku (černá)


def _maska_poly(m, c0, r0):
    """pixely masky (okno od sloupce c0, řádku r0) -> polygon v metrech (po řádcích, sloučené úseky)"""
    bx = []
    for i, row in enumerate(m):
        d = np.diff(np.concatenate([[0], row.astype(np.int8), [0]]))
        for a, b in zip(np.flatnonzero(d == 1), np.flatnonzero(d == -1)):
            y = OY1 - (r0 + i) * OM
            bx.append(shapely.box(OX0 + (c0 + a) * OM, y - OM, OX0 + (c0 + b) * OM, y))
    return shapely.union_all(bx).simplify(OM * 4) if bx else Polygon()      # rovné hranice jako u parcel


def ortofoto(p):
    """pole p -> [(polygon, plodina | None)]"""
    if ORTO is None: return [(p, None)]
    if p.area < 2 * MIN_OBLAST: return [(p, _plodina1(p) if _vidi(p) else None)]
    x0, y0, x1, y1 = p.bounds
    c0, r0 = max(0, int((x0 - OX0) / OM)), max(0, int((OY1 - y1) / OM))
    c1, r1 = min(ORTO.shape[1], int((x1 - OX0) / OM) + 2), min(ORTO.shape[0], int((OY1 - y0) / OM) + 2)
    if c1 - c0 < 3 or r1 - r0 < 3: return [(p, None)]
    mk = Image.new('L', (c1 - c0, r1 - r0)); d = ImageDraw.Draw(mk)
    for q in polys(p):
        d.polygon([((x - OX0) / OM - c0, (OY1 - y) / OM - r0) for x, y in q.exterior.coords], fill=1)
        for h in q.interiors: d.polygon([((x - OX0) / OM - c0, (OY1 - y) / OM - r0) for x, y in h.coords], fill=0)
    m = np.asarray(mk) > 0
    tma = TMA[r0:r1, c0:c1]
    if (m & ~tma).sum() < 0.5 * m.sum(): return [(p, None)]
    jas = JAS[r0:r1, c0:c1]
    tr = np.full(m.shape, len(PRAHY) - 1)
    for k in range(len(PRAHY) - 2, -1, -1): tr[jas > PRAHY[k][0]] = k
    ok = m & ~tma
    hl = np.stack([ndimage.uniform_filter(((tr == k) & ok).astype(np.float32), 25) for k in range(len(PRAHY))])   # většina v okolí 50 m
    tr = np.where(ok, hl.argmax(0), -1)
    minpx = MIN_OBLAST / OM ** 2
    for _ in range(3):                                 # malé oblasti pryč, doplní je nejbližší velká
        for k in range(len(PRAHY)):
            lab, n = ndimage.label(tr == k)
            if n:
                vel = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
                tr[np.isin(lab, np.flatnonzero(vel < minpx) + 1)] = -1
        if not (m & (tr < 0)).any(): break
        if (tr < 0).all(): return [(p, _plodina1(p))]
        idx = ndimage.distance_transform_edt(tr < 0, return_distances=False, return_indices=True)
        tr = np.where(m, tr[idx[0], idx[1]], -1)
    tridy = [k for k in range(len(PRAHY)) if (tr == k).any()]
    if len(tridy) <= 1: return [(p, PRAHY[tridy[0]][1] if tridy else None)]
    obl = sorted(((_maska_poly(tr == k, c0, r0).intersection(p), PRAHY[k][1]) for k in tridy), key=lambda o: -o[0].area)
    zbytek = p.difference(shapely.union_all([o[0] for o in obl[1:]]))                   # největší oblast = zbytek pole (bez mezer)
    return [(q, cr) for g, cr in [(zbytek, obl[0][1])] + obl[1:] for q in polys(shapely.make_valid(g))]


def _vidi(p):
    if ORTO is None: return False
    x, y = p.representative_point().coords[0]
    c, r = int((x - OX0) / OM), int((OY1 - y) / OM)
    return 0 <= r < ORTO.shape[0] and 0 <= c < ORTO.shape[1] and not TMA[r, c]


def _plodina1(p):
    """malé pole: jedna plodina podle průměrného jasu"""
    if not _vidi(p): return None
    x, y = p.representative_point().coords[0]
    c, r = int((x - OX0) / OM), int((OY1 - y) / OM)
    j = JAS[r, c]
    return next(cr for pr, cr in PRAHY if j > pr)


Z = json.load(open('assets/zabaged.json'))
bloky = Z['orna'] + [Z['ttp'][i] for i in sorted(set(Z.get('pole', [])))]
vysl, plod, n0 = [], [], 0
for rings in bloky:
    sh = [list(zip(*geo.to_local(np.array([q[1] for q in r]), np.array([q[0] for q in r])))) for r in rings]
    blok = shapely.make_valid(Polygon(sh[0], sh[1:]))
    if blok.is_empty: continue
    n0 += 1
    kand = [cary[k] for k in strom.query(blok, predicate='intersects')]
    kusy = polys(blok.difference(shapely.unary_union([l.buffer(SIRKA, cap_style=2) for l in kand]))) if kand else polys(blok)
    velke = [p for p in kusy if p.area >= MIN_POLE]
    if not velke: velke = [max(kusy, key=lambda p: p.area)] if kusy else []
    for p in kusy:                                   # malé kusy k nejbližšímu velkému poli (přes vyříznutý pás cesty)
        if p.area >= MIN_POLE or p in velke: continue
        k = min(range(len(velke)), key=lambda k: velke[k].distance(p))
        if velke[k].distance(p) < 3 * SIRKA:
            try: u = shapely.union(shapely.make_valid(velke[k].buffer(SIRKA * 1.2, join_style=2)), shapely.make_valid(p.buffer(SIRKA * 1.2, join_style=2))).buffer(-SIRKA * 1.2, join_style=2)
            except shapely.errors.GEOSException: continue
            if polys(u): velke[k] = max(polys(u), key=lambda q: q.area)
    for p in velke:
        for q, cr in ortofoto(p):
            q = q.simplify(0.5)
            if q.is_empty or q.geom_type != 'Polygon' or q.area < 400: continue
            out = []
            for r in [q.exterior, *q.interiors]:
                xs, ys = np.array(r.coords).T
                lo, la = geo.to_lonlat(xs, ys)
                out.append([[round(float(a), 6), round(float(b), 6)] for a, b in zip(la, lo)])
            vysl.append(out); plod.append(cr)
Z['orna_dil'] = vysl
Z['orna_plodina'] = plod
json.dump(Z, open('assets/zabaged.json', 'w'))
from collections import Counter
print('bloků orné půdy', n0, '-> polí', len(vysl), 'plodiny podle ortofota', dict(Counter(plod)))

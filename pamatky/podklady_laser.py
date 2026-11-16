# laserové výšky památek z mračna bodů ČÚZK DMP 1G (CC BY 4.0; build/dmp/*.laz, třída 6 budova, 2 terén) – jen místní podklad
#   .venv/bin/python pamatky/podklady_laser.py [slug …]
# Chybějící listy DMP 1G kolem památek si stáhne sám (jako dmp_fetch.py, jen ty potřebné) do build/dmp/.
# -> podklady-soukrome/pamatky/<slug>/laser.json: výšky nad terénem (medián, p90, p98, max) pro budovy památky a sousedy,
#    nejvyšší body (vrcholy věží/hřebenů) po buňkách 3 m s polohou vůči středu rámu (v = na východ, s = na sever, m)
import glob, io, json, math, os, re, sys, urllib.request, zipfile
import numpy as np, laspy, shapely
from pyproj import Transformer
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT); sys.path.insert(0, ROOT)
import geo
OUT = os.path.join(ROOT, 'podklady-soukrome', 'pamatky')
LON0, LAT0, KX, KY = geo.LON0, geo.LAT0, geo.KX, geo.KY
T = Transformer.from_crs(4326, 5514, always_xy=True)
UA = {'User-Agent': 'izomapa-pamatky/0.1 (laser heights)'}


def listy(lon0, lat0, lon1, lat1):
    """stáhne listy DMP 1G, které protínají obdélník (stupně) a v build/dmp/ ještě nejsou"""
    os.makedirs('build/dmp', exist_ok=True); A = 'build/dmp/atom.xml'
    if not os.path.exists(A):
        print('stahuji seznam listů DMP 1G (~24 MB)…', flush=True)
        open(A, 'wb').write(urllib.request.urlopen(urllib.request.Request('https://atom.cuzk.gov.cz/DMP1G-SJTSK/DMP1G-SJTSK.xml', headers=UA), timeout=300).read())
    s = open(A, encoding='utf8').read()
    for e in s.split('<entry>')[1:]:
        p = re.search(r'<georss:polygon>(.*?)<', e); k = re.search(r'DMP1G-SJTSK_([A-Z0-9]+)\.xml', e)
        if not (p and k): continue
        v = list(map(float, p.group(1).split()))
        if max(v[1::2]) < lon0 or min(v[1::2]) > lon1 or max(v[0::2]) < lat0 or min(v[0::2]) > lat1: continue
        n = k.group(1)
        if os.path.exists(f'build/dmp/{n}.laz'): continue
        print('stahuji list', n, flush=True)
        z = urllib.request.urlopen(urllib.request.Request(f'https://openzu.cuzk.cz/opendata/DMP1G/epsg-5514/{n}.zip', headers=UA), timeout=300).read()
        zipfile.ZipFile(io.BytesIO(z)).extractall('build/dmp')

def w2k(pts):
    a = np.asarray(pts, float); x, y = T.transform(LON0 + a[:, 0] / KX, LAT0 + a[:, 1] / KY)
    return np.column_stack([x, y])

def main(slugs):
    PP = {s: json.load(open(os.path.join(ROOT, 'pamatky', s + '.json'), encoding='utf-8')) for s in slugs}
    RINGS = {}
    for ct in {tuple(P.get('ctverec') or (0, 0)) for P in PP.values()}:
        I = json.load(open(os.path.join(ROOT, geo.chunk_dir(ct), 'info_src.json'), encoding='utf-8'))
        cx, cy = geo.chunk_center(ct)
        for b in I['buildings']:
            RINGS.setdefault(b['oid'], []).append([[x + cx, y + cy] for x, y in b['ring']])
    allp = np.array([P['bod'] for P in PP.values()])
    (lo0, lo1), (la0, la1) = geo.to_lonlat([allp[:, 0].min() - 300, allp[:, 0].max() + 300], [allp[:, 1].min() - 300, allp[:, 1].max() + 300])
    listy(float(lo0), float(la0), float(lo1), float(la1))
    kb = w2k(allp); x0, y0 = kb.min(0) - 250; x1, y1 = kb.max(0) + 250
    X, Y, Z, C = [], [], [], []
    for f in sorted(glob.glob(os.path.join(ROOT, 'build', 'dmp', '*.laz'))):
        h = laspy.open(f).header
        if h.maxs[0] < x0 or h.mins[0] > x1 or h.maxs[1] < y0 or h.mins[1] > y1: continue
        l = laspy.read(f); xx, yy = np.array(l.x), np.array(l.y)
        m = (xx > x0) & (xx < x1) & (yy > y0) & (yy < y1)
        X.append(xx[m]); Y.append(yy[m]); Z.append(np.array(l.z)[m]); C.append(np.array(l.classification)[m])
        print('list', os.path.basename(f), int(m.sum()), flush=True)
    if not X: sys.exit('v build/dmp/ není žádný list DMP 1G kolem památek')
    X, Y, Z, C = map(np.concatenate, (X, Y, Z, C))
    PTS = shapely.points(X, Y); TREE = shapely.STRtree(PTS)
    def inpoly(g):
        return TREE.query(g, predicate='contains')
    def stats(g, ring_ground=None):
        idx = inpoly(g); b = idx[C[idx] == 6]
        gr = inpoly(shapely.difference(shapely.buffer(g, 14), shapely.buffer(g, 1))) if ring_ground is None else ring_ground
        gr = gr[C[gr] == 2]
        if not len(gr): return None, b, None
        g0 = float(np.median(Z[gr]))
        if not len(b): return {'bodu': 0, 'teren_mnm': round(g0, 1)}, b, g0
        hz = Z[b] - g0
        return {'bodu': int(len(b)), 'teren_mnm': round(g0, 1), 'median': round(float(np.median(hz)), 1), 'p90': round(float(np.percentile(hz, 90)), 1),
                'p98': round(float(np.percentile(hz, 98)), 1), 'max': round(float(hz.max()), 1)}, b, g0
    for s, P in PP.items():
        d = os.path.join(OUT, s); os.makedirs(d, exist_ok=True)
        ram = P.get('ram') or {}; cx, cy = (ram['x'], ram['y']) if ram.get('L') else P['bod']
        ck = w2k([[cx, cy]])[0]
        res = {'pozn': 'DMP 1G (ČÚZK, CC BY 4.0, staré několik let), hustota ~0,25 bodu/m² – úzké špice věží laser často mine, max je spíš dolní odhad. Výšky v m nad terénem (medián okolního terénu).',
               'budovy': [], 'vrcholy': []}
        mine = [o for o in RINGS if any(o.startswith(m) for m in P.get('oids') or [])]   # json má někdy jen prefix oid
        orto = json.load(open(os.path.join(d, 'orto.json'), encoding='utf-8')) if os.path.exists(os.path.join(d, 'orto.json')) else {'budovy': []}
        sous = [r['oid'] for r in orto['budovy'] if not r['pamatka'] and r.get('mezera_k_pamatce') is not None and r['mezera_k_pamatce'] < 1.5][:12]
        geoms = {}
        for oid in mine + sous:
            rs = RINGS.get(oid)
            if not rs: continue
            g = shapely.union_all([shapely.make_valid(shapely.Polygon(w2k(r))) for r in rs])
            geoms[oid] = g
            st, b, g0 = stats(g)
            res['budovy'].append({'oid': oid, 'pamatka': oid in mine, **(st or {})})
        if mine and any(o in geoms for o in mine):
            G = shapely.union_all([geoms[o] for o in mine if o in geoms])
            st, b, g0 = stats(G)
            if st and len(b):
                # vrcholy: max v buňkách 3 m, lokální maxima
                gx = np.floor((X[b] - ck[0]) / 3).astype(int); gy = np.floor((Y[b] - ck[1]) / 3).astype(int)
                cells = {}
                for i, (u, v) in enumerate(zip(gx, gy)):
                    k = (u, v)
                    if k not in cells or Z[b[i]] > Z[b[cells[k]]]: cells[k] = i
                tops = []
                for (u, v), i in cells.items():
                    z = Z[b[i]]
                    if all(z >= Z[b[cells[(u + du, v + dv)]]] for du in (-1, 0, 1) for dv in (-1, 0, 1) if (u + du, v + dv) in cells): tops.append(i)
                tops.sort(key=lambda i: -Z[b[i]])
                # S-JTSK: osy jsou otočené (x roste na západ, y na jih) -> převod zpět přes lon/lat
                inv = Transformer.from_crs(5514, 4326, always_xy=True)
                for i in tops[:8]:
                    lo, la = inv.transform(X[b[i]], Y[b[i]])
                    wx, wy = (lo - LON0) * KX, (la - LAT0) * KY
                    res['vrcholy'].append({'v': round(wx - cx, 1), 's': round(wy - cy, 1), 'h': round(float(Z[b[i]] - g0), 1)})
                res['celek'] = st
        else:
            # bez budovy (sloup, socha): všechny body kromě terénu v okruhu 5 m od bodu
            pk = w2k([P['bod']])[0]; g = shapely.Point(*pk).buffer(5)
            idx = inpoly(g); gr = inpoly(shapely.difference(shapely.Point(*pk).buffer(20), shapely.Point(*pk).buffer(6)))
            gr = gr[C[gr] == 2]
            if len(gr):
                g0 = float(np.median(Z[gr])); nz = idx[C[idx] != 2]
                res['bod_okoli_5m'] = {'teren_mnm': round(g0, 1), 'bodu_nad_terenem': int(len(nz)),
                                       'max': round(float((Z[nz] - g0).max()), 1) if len(nz) else None,
                                       'tridy': sorted(set(int(c) for c in C[nz]))}
        json.dump(res, open(os.path.join(d, 'laser.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        c = res.get('celek') or res.get('bod_okoli_5m')
        print(s, c, res['vrcholy'][:3], flush=True)

if __name__ == '__main__':
    main(sys.argv[1:] or json.load(open(os.path.join(ROOT, 'pamatky', 'seznam.json'), encoding='utf-8')))

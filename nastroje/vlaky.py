# Vlaky podle celostátního jízdního řádu -> build/vlaky/vlaky_mhd.json, přidá je mhd.py k tramvajím a autobusům.
# Vstup: build/vlaky/vlaky.json (nastroje/vlaky_vyber.py), koleje z data_all/segment.parquet, polohy stanic z Overture.
# Trasa jde po kolejích mezi stanicemi na mapě; na okraj mapy se dopočítá směrem ke stanici za okrajem. Čas mezi stanicemi je rovnoměrný.
import datetime, hashlib, json, math, os, re, sys, difflib, collections
sys.path.insert(0, '.')
import numpy as np, shapely, pyarrow.parquet as pq, pyarrow.dataset as ds, pyarrow.fs as fs
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import dijkstra
from scipy.spatial import cKDTree
from geo import to_local, bbox_lonlat, extent

DRUH = {'50': 'EC', '63': 'IC', '69': 'Ex', '70': 'EN', '84': 'Os', '94': 'SC', '122': 'Sp', '157': 'R', '209': 'rj', '9000': 'Rx', '9001': 'TLX', '9002': 'TL', '9003': 'LE', '9004': 'RJ'}
VOZU = {'Os': 2, 'Sp': 2, 'R': 5, 'Rx': 6, 'Ex': 7, 'EC': 7, 'IC': 7, 'SC': 7, 'EN': 8, 'rj': 7, 'LE': 5, 'RJ': 6, 'TL': 2, 'TLX': 2}
BARVA = {'1154': '#2a5ba8', '3616': '#1e1e22', '3246': '#f2c21a', '1156': '#b5302c', '3990': '#2f8f5b', '1251': '#32407a'}

# ---- stanice v širším okolí ----
STANICE = 'build/vlaky/stanice.json'
if not os.path.exists(STANICE):
    X0, X1, Y0, Y1 = bbox_lonlat(0)
    s3 = fs.S3FileSystem(anonymous=True, region='us-west-2')
    d = ds.dataset('overturemaps-us-west-2/release/2026-10-21.0/theme=base/type=infrastructure/', filesystem=s3, format='parquet')
    f = (ds.field('bbox', 'xmin') < X1 + 0.5) & (ds.field('bbox', 'xmax') > X0 - 0.5) & (ds.field('bbox', 'ymin') < Y1 + 0.35) & (ds.field('bbox', 'ymax') > Y0 - 0.35)
    t = d.to_table(filter=f, columns=['names', 'class', 'bbox']).to_pylist()
    st = {}
    for r in t:
        if r['class'] in ('railway_station', 'railway_halt'):
            n = (r['names'] or {}).get('primary')
            if n: st[n] = [(r['bbox']['xmin'] + r['bbox']['xmax']) / 2, (r['bbox']['ymin'] + r['bbox']['ymax']) / 2]
    json.dump(st, open(STANICE, 'w', encoding='utf-8'), ensure_ascii=False)
ST = json.load(open(STANICE, encoding='utf-8'))
print('stanic v okolí', len(ST))


def norm(n):
    n = n.replace('hl. n.', 'hlavní nádraží').replace('zast.', 'zastávka').replace('Mar.Údolí', 'Mariánské Údolí').replace('n.L.', 'nad Labem')
    return re.sub(r'\s+', ' ', n).strip()


KLIC = {norm(k).lower(): k for k in ST}
def poloha(n, nezname=collections.Counter()):
    k = KLIC.get(norm(n).lower())
    if k is None: return None
    x, y = to_local(*ST[k])
    return float(x), float(y)


# ---- koleje ----
rows = pq.read_table('data_all/segment.parquet', columns=['subtype', 'class', 'geometry']).to_pylist()
ids, xy, I, J, W = {}, [], [], [], []
def nid(p):
    k = (round(p[0] * 2), round(p[1] * 2))
    if k not in ids: ids[k] = len(xy); xy.append(p)
    return ids[k]
for r in rows:
    if r['subtype'] != 'rail' or r['class'] not in ('standard_gauge', 'unknown'): continue
    g = shapely.transform(shapely.from_wkb(r['geometry']), lambda c: np.column_stack(to_local(c[:, 0], c[:, 1])))
    c = shapely.get_coordinates(shapely.segmentize(g, 10.0))
    for a, b in zip(c[:-1], c[1:]):
        ia, ib = nid((float(a[0]), float(a[1]))), nid((float(b[0]), float(b[1])))
        if ia == ib: continue
        d = float(np.hypot(*(b - a))); I += [ia, ib]; J += [ib, ia]; W += [d, d]
XY = np.array(xy); T = cKDTree(XY)
for a, b in T.query_pairs(5.0):
    d = float(np.hypot(*(XY[a] - XY[b]))) * 2 + 2; I += [a, b]; J += [b, a]; W += [d, d]
G = csr_matrix((W, (I, J)), shape=(len(XY), len(XY)))
stupen = np.bincount(np.array(I), minlength=len(XY))
xs, ys = XY[:, 0], XY[:, 1]
x0, y0, x1, y1 = extent(0.0)
OKRAJ = np.where((stupen <= 2) & ((xs < x0 - 200) | (xs > x1 + 200) | (ys < y0 - 200) | (ys > y1 + 200)))[0]
print('uzlů kolejí', len(XY), 'konců na okraji', len(OKRAJ))
CACHE = {}
def od(a):
    if a not in CACHE:
        if len(CACHE) > 300: CACHE.clear()
        CACHE[a] = dijkstra(G, directed=True, indices=a, return_predecessors=True)
    return CACHE[a]
def uzel(p, r=170.0):
    d, i = T.query(p)
    return int(i) if d <= r else None
def cesta(a, b):
    dist, pred = od(a)
    if not np.isfinite(dist[b]): return None, None
    path = [b]
    while path[-1] != a: path.append(int(pred[path[-1]]))
    return path[::-1], float(dist[b])


NA_MAPE = lambda p: x0 - 100 < p[0] < x1 + 100 and y0 - 100 < p[1] < y1 + 100
v = json.load(open('build/vlaky/vlaky.json', encoding='utf-8'))
dnes = int(datetime.date.today().strftime('%Y%m%d'))
routes, shapes, SI, services, trips = [], [], {}, {}, []
stat = collections.Counter(); nezn = collections.Counter()


def sluzba(bitmap, od_):
    z = datetime.date.fromisoformat(od_[:10])
    dny = [(z + datetime.timedelta(days=i), b == '1') for i, b in enumerate(bitmap)]
    key = 'V' + hashlib.md5((bitmap + od_).encode()).hexdigest()[:10]
    if key in services: return key
    tyd = [[] for _ in range(7)]
    for d, b in dny: tyd[d.weekday()].append(b)
    maj = [1 if t and sum(t) * 2 > len(t) else 0 for t in tyd]
    i_ = lambda d: int(d.strftime('%Y%m%d'))
    add = [i_(d) for d, b in dny if b and not maj[d.weekday()] and i_(d) >= dnes]
    rem = [i_(d) for d, b in dny if not b and maj[d.weekday()] and i_(d) >= dnes]
    services[key] = [maj, i_(dny[0][0]), i_(dny[-1][0]), add, rem]
    return key


for t in v:
    body = t['body']
    if not body or t['typ'] not in ('11', 'C1', 'C2', 'C3', 'C4'): stat['jiný typ'] += 1; continue
    pol = []
    for i, q in enumerate(body):
        p = poloha(q[0]) if q[0] else None
        if p: pol.append((i, p))
        elif q[4]: nezn[q[0]] += 1
    na = [k for k, (i, p) in enumerate(pol) if NA_MAPE(p)]
    if not na: stat['bez stanice na mapě'] += 1; continue
    k0, k1 = na[0], na[-1]
    usek = [pol[k] for k in range(k0, k1 + 1)]
    for (i, p) in usek:
        if uzel(p) is None: stat['bez kolejí: ' + str(body[i][0])] += 1
    usek = [(i, p) for i, p in usek if uzel(p) is not None]
    if not usek: stat['stanice mimo koleje'] += 1; continue
    uzly = [uzel(p) for _, p in usek]
    # průjezd po kolejích mezi stanicemi
    trasa = [uzly[0]]; delky = [0.0]; ok = True
    for a, b in zip(uzly[:-1], uzly[1:]):
        if a == b: delky.append(delky[-1]); continue
        pth, dd = cesta(a, b)
        if pth is None: ok = False; break
        trasa += pth[1:]; delky.append(delky[-1] + dd)
    if not ok: stat['koleje nespojité'] += 1; continue
    def okraj(u, cil):
        dist, _ = od(u)
        kand = OKRAJ[np.isfinite(dist[OKRAJ])]
        if not len(kand): return None
        sk = dist[kand] + np.hypot(XY[kand, 0] - cil[0], XY[kand, 1] - cil[1])
        return int(kand[int(np.argmin(sk))])
    seq = []; zac = None
    # vjezd z okraje mapy
    if k0 > 0:
        i_p, p_p = pol[k0 - 1]; i0 = usek[0][0]
        n = okraj(uzly[0], p_p)
        if n is not None and n != uzly[0]:
            pth, dd = cesta(n, uzly[0])
            ds_ = math.hypot(p_p[0] - usek[0][1][0], p_p[1] - usek[0][1][1])
            dt = max(30.0, body[i0][2] - body[i_p][3])
            rychl = max(8.0, min(44.0, ds_ * 1.1 / dt))
            seq.append((body[i0][2] - dd / rychl, 0.0))
            trasa = pth[:-1] + trasa; delky = [x + dd for x in delky]; stat['vjezd'] += 1
    for (i, p), d in zip(usek, delky):
        a_, d_ = body[i][2], body[i][3]
        seq.append((a_, d))
        if d_ > a_: seq.append((d_, d))
    # výjezd na okraj mapy
    if k1 < len(pol) - 1:
        i_n, p_n = pol[k1 + 1]; i1 = usek[-1][0]
        n = okraj(uzly[-1], p_n)
        if n is not None and n != uzly[-1]:
            pth, dd = cesta(uzly[-1], n)
            ds_ = math.hypot(p_n[0] - usek[-1][1][0], p_n[1] - usek[-1][1][1])
            dt = max(30.0, body[i_n][2] - body[i1][3])
            rychl = max(8.0, min(44.0, ds_ * 1.1 / dt))
            seq.append((body[i1][3] + dd / rychl, delky[-1] + dd))
            trasa = trasa + pth[1:]; stat['výjezd'] += 1
    seq.sort(key=lambda q: q[0])
    if len(seq) < 2: stat['krátké'] += 1; continue
    t0 = seq[0][0]
    if seq[-1][0] - t0 > 6 * 3600: stat['moc dlouhé'] += 1; continue
    klic = tuple(trasa)
    if klic not in SI:
        l = shapely.LineString(XY[trasa])
        SI[klic] = len(shapes)
        shapes.append([[round(a, 1), round(b, 1)] for a, b in shapely.simplify(l, 0.8).coords])
    dr = DRUH.get(t['druh'], 'Os')
    routes.append([f"{dr} {t['cislo']}", 2, BARVA.get(t['dop'], '#2a5ba8'), VOZU.get(dr, 3)])
    sq = []
    for a, d in seq: sq += [round(a - t0), round(d)]
    cil = next((q[0] for q in reversed(body) if q[4]), body[-1][0]) or ''
    zs = []
    for (i, p) in usek:
        if body[i][4]: zs += [norm(body[i][0]), round(body[i][2] - t0)]
    trips.append([len(routes) - 1, SI[klic], sluzba(t['bitmap'], t['od']), round(t0), sq, norm(cil), zs])
    stat['ok'] += 1
json.dump({'routes': routes, 'shapes': shapes, 'services': services, 'trips': trips}, open('build/vlaky/vlaky_mhd.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(dict(stat)); print('tras', len(shapes), 'služeb', len(services), 'kB', os.path.getsize('build/vlaky/vlaky_mhd.json') // 1000)
print('neznámé zastávky', nezn.most_common(40))
print(sorted({r[0].split()[0] for r in routes}), collections.Counter(r[2] for r in routes).most_common(8))

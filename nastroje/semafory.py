# semafory na křižovatkách a přechodech (Overture infrastructure, třída traffic_signals = OSM highway=traffic_signals)
# -> assets/semafory.json: [[lat, lon, křižovatka], ...]; body do SHLUK_M od sebe patří k jedné křižovatce (jeden cyklus)
# overlay.py je předá prohlížeči, web/app.html je přiřadí silnicím, auta před červenou stojí ve frontě
# spouštět z kořene repa: python nastroje/semafory.py (stačí pak overlay.py a build_html.py, render není potřeba)
import json, math, sys; sys.path.insert(0, '.')
import pyarrow.parquet as pq, shapely
import geo

SHLUK_M = 40

x0, y0, x1, y1 = geo.extent(geo.MARGIN)
t = pq.read_table('data_all/infrastructure.parquet', columns=['geometry', 'class']).to_pydict()
body = []
for g, c in zip(t['geometry'], t['class']):
    if c != 'traffic_signals': continue
    p = shapely.from_wkb(g)
    if p.geom_type != 'Point': continue
    x, y = (float(v) for v in geo.to_local(p.x, p.y))
    if x0 <= x <= x1 and y0 <= y <= y1: body.append((p.y, p.x, x, y))
body.sort()
# shluky: spojit body blíž než SHLUK_M (union-find)
rodic = list(range(len(body)))
def koren(i):
    while rodic[i] != i: rodic[i] = rodic[rodic[i]]; i = rodic[i]
    return i
for i in range(len(body)):
    for k in range(i + 1, len(body)):
        if math.hypot(body[i][2] - body[k][2], body[i][3] - body[k][3]) < SHLUK_M: rodic[koren(k)] = koren(i)
cislo = {}
out = [[round(la, 7), round(lo, 7), cislo.setdefault(koren(i), len(cislo))] for i, (la, lo, _, _) in enumerate(body)]
json.dump(out, open('assets/semafory.json', 'w'))
print('semaforů', len(out), 'křižovatek', len(cislo))

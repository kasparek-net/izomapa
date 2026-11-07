# železniční přejezdy z OpenStreetMap (Overpass, ODbL, bez registrace) -> assets/prejezdy.json: [[lat, lon], ...]
# auta před nimi čekají, když jede vlak (prep.py je přiřadí kusům silnic, web/app.html je zavírá podle jízdních řádů)
# spouštět z kořene repa: python nastroje/prejezdy.py
import json, math, subprocess, sys; sys.path.insert(0, '.')

DOSAH_M = 6


def na_kusu(p, body):
    """p: [[x, y, …], …] lomená čára kusu silnice, body: [(x, y)] přejezdy v metrech;
    vrátí [[metry od začátku, x, y]] přejezdů do DOSAH_M od kusu, seřazené a bez dvojic blíž než 3 m."""
    out, acc = [], 0.0
    for i in range(1, len(p)):
        ax, ay, bx, by = p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]
        dx, dy = bx - ax, by - ay; l2 = dx * dx + dy * dy; L = math.sqrt(l2)
        for x, y in body:
            t = max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / l2)) if l2 else 0.0
            qx, qy = ax + dx * t, ay + dy * t
            if math.hypot(x - qx, y - qy) <= DOSAH_M:
                s = acc + L * t
                if not any(abs(s - o[0]) < 3 for o in out): out.append([round(s, 1), round(qx, 1), round(qy, 1)])
        acc += L
    return sorted(out)


if __name__ == '__main__':
    import geo
    x0, y0, x1, y1 = geo.extent(geo.MARGIN + 20)
    lo0, la0 = geo.to_lonlat(x0, y0); lo1, la1 = geo.to_lonlat(x1, y1); b = f'{la0},{lo0},{la1},{lo1}'
    q = f'[out:json][timeout:60];node["railway"="level_crossing"]({b});out;'
    t = subprocess.run(['curl', '-s', '-f', '-m', '120', '-A', 'izomapa-tools/1.0', '--data-urlencode', f'data={q}', 'https://overpass-api.de/api/interpreter'],
                       check=True, capture_output=True, text=True).stdout
    uzly = sorted({(e['lat'], e['lon']) for e in json.loads(t)['elements']})
    json.dump([[la, lo] for la, lo in uzly], open('assets/prejezdy.json', 'w'))
    print('přejezdů', len(uzly))

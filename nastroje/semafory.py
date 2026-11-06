# semafory z OpenStreetMap (Overpass, ODbL, bez registrace) -> assets/semafory.json: [[lat, lon, skupina], ...]
# skupina je jedna křižovatka: semafory blíž než 40 m mají společný cyklus
# spouštět z kořene repa: python nastroje/semafory.py
import json, math, subprocess, sys; sys.path.insert(0, '.')
import geo

SKUPINA_M = 40


def skupiny(body):
    """body: [(x, y)] v metrech; vrátí číslo skupiny pro každý bod (spojuje řetězově)."""
    g = list(range(len(body)))
    def root(i):
        while g[i] != i: i = g[i]
        return i
    for i in range(len(body)):
        for j in range(i):
            if math.dist(body[i], body[j]) < SKUPINA_M: g[root(i)] = root(j)
    return [root(i) for i in range(len(body))]


if __name__ == '__main__':
    x0, y0, x1, y1 = geo.extent(geo.MARGIN + 20)
    lo0, la0 = geo.to_lonlat(x0, y0); lo1, la1 = geo.to_lonlat(x1, y1); b = f'{la0},{lo0},{la1},{lo1}'
    q = f'[out:json][timeout:60];(node["highway"="traffic_signals"]({b});node["crossing"="traffic_signals"]({b}););out;'
    t = subprocess.run(['curl', '-s', '-f', '-m', '120', '-A', 'izomapa-tools/1.0', '--data-urlencode', f'data={q}', 'https://overpass-api.de/api/interpreter'],
                       check=True, capture_output=True, text=True).stdout
    uzly = sorted({(e['lat'], e['lon']) for e in json.loads(t)['elements']})
    g = skupiny([geo.to_local(lo, la) for la, lo in uzly])
    json.dump([[la, lo, s] for (la, lo), s in zip(uzly, g)], open('assets/semafory.json', 'w'))
    print('semaforů', len(uzly), 'křižovatek', len(set(g)))

# komíny a chladicí věže z OpenStreetMap (Overpass, ODbL, bez registrace) -> assets/kominy.json
# [{"lat", "lon", "h", "k": "komin" | "vez", "r": poloměr paty nebo null}]; spouštět z kořene repa: python nastroje/kominy.py
import json, math, subprocess, sys; sys.path.insert(0, '.')
import geo

SHODA_M = 15          # stejný komín bývá v OSM jako bod i jako plocha
VYCHOZI_H = {'komin': 25.0, 'vez': 40.0}


def vyska(t):
    try: return float(str(t.get('height', '')).replace('m', '').replace(',', '.').strip())
    except ValueError: return None


def vyber(prvky):
    """Prvky Overpass -> jedna položka na stavbu; plocha má přednost před bodem, pak vyšší údaj."""
    out = []
    for e in prvky:
        t = e.get('tags', {}); c = e.get('center') or e; b = e.get('bounds')
        k = 'vez' if t.get('tower:type') == 'cooling' else 'komin'
        r = None
        if b:
            sirka = (b['maxlon'] - b['minlon']) * 111320 * math.cos(math.radians(c['lat'])); delka = (b['maxlat'] - b['minlat']) * 111320
            r = round(min(sirka, delka) / 2, 1)
        out.append({'lat': c['lat'], 'lon': c['lon'], 'h': vyska(t), 'k': k, 'r': r, 'plocha': 'center' in e})
    out.sort(key=lambda q: (not q['plocha'], -(q['h'] or 0)))
    jeden = []
    for q in out:
        y = (q['lat'] * 111320, q['lon'] * 111320 * math.cos(math.radians(q['lat'])))
        for p in jeden:
            if math.dist(y, (p['lat'] * 111320, p['lon'] * 111320 * math.cos(math.radians(p['lat'])))) < SHODA_M:
                p['h'] = p['h'] or q['h']; break
        else: jeden.append(q)
    for p in jeden: p['h'] = p['h'] or VYCHOZI_H[p['k']]; del p['plocha']
    return jeden


if __name__ == '__main__':
    x0, y0, x1, y1 = geo.extent(geo.MARGIN + 20)
    lo0, la0 = geo.to_lonlat(x0, y0); lo1, la1 = geo.to_lonlat(x1, y1); b = f'{la0},{lo0},{la1},{lo1}'
    q = f'[out:json][timeout:60];(nwr["man_made"="chimney"]({b});nwr["tower:type"~"^(stack|cooling)$"]({b}););out tags center bb;'
    t = subprocess.run(['curl', '-s', '-f', '-m', '120', '-A', 'izomapa-tools/1.0', '--data-urlencode', f'data={q}', 'https://overpass-api.de/api/interpreter'],
                       check=True, capture_output=True, text=True).stdout
    v = vyber(json.loads(t)['elements'])
    json.dump(v, open('assets/kominy.json', 'w'), indent=0)
    print('komínů', sum(p['k'] == 'komin' for p in v), 'chladicích věží', sum(p['k'] == 'vez' for p in v))

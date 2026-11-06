# komíny, chladicí věže, vysílače, nádrže a nadzemní potrubí z OpenStreetMap (Overpass, ODbL, bez registrace)
# assets/kominy.json: [{"lat", "lon", "h", "k": "komin" | "vez" | "stozar" | "nadrz", "r": poloměr paty nebo null}]
# assets/potrubi.json: [[[lat, lon], ...]]; spouštět z kořene repa: python nastroje/kominy.py
import json, math, subprocess, sys; sys.path.insert(0, '.')
import geo

SHODA_M = 15          # stejný komín bývá v OSM jako bod i jako plocha
VYCHOZI_H = {'komin': 25.0, 'vez': 40.0, 'stozar': 30.0, 'nadrz': 10.0}


def vyska(t):
    try: return float(str(t.get('height', '')).replace('m', '').replace(',', '.').strip())
    except ValueError: return None


def vyber(prvky):
    """Prvky Overpass -> jedna položka na stavbu; plocha má přednost před bodem, pak vyšší údaj."""
    out = []
    for e in prvky:
        t = e.get('tags', {}); b = e.get('bounds')
        c = {'lat': (b['minlat'] + b['maxlat']) / 2, 'lon': (b['minlon'] + b['maxlon']) / 2} if b else e.get('center') or e   # Overpass u "center bb" vrací jen bounds
        tt = t.get('tower:type')
        k = 'vez' if tt == 'cooling' else 'nadrz' if t.get('man_made') == 'storage_tank' else 'stozar' if tt == 'communication' else 'komin'
        r = None
        if b:
            sirka = (b['maxlon'] - b['minlon']) * 111320 * math.cos(math.radians(c['lat'])); delka = (b['maxlat'] - b['minlat']) * 111320
            r = round(min(sirka, delka) / 2, 1)
        out.append({'lat': c['lat'], 'lon': c['lon'], 'h': vyska(t), 'k': k, 'r': r, 'plocha': 'center' in e or 'bounds' in e})
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


def potrubi(prvky):
    """Jen nad zemí: podzemní nebo pod vodou se vynechá, u potrubí bez údaje se počítá s nadzemním."""
    return [[[round(p['lat'], 6), round(p['lon'], 6)] for p in e['geometry']] for e in prvky
            if e.get('geometry') and e.get('tags', {}).get('location') not in ('underground', 'underwater')]


if __name__ == '__main__':
    x0, y0, x1, y1 = geo.extent(geo.MARGIN + 20)
    lo0, la0 = geo.to_lonlat(x0, y0); lo1, la1 = geo.to_lonlat(x1, y1); b = f'{la0},{lo0},{la1},{lo1}'
    def dotaz(q):
        t = subprocess.run(['curl', '-s', '-f', '-m', '120', '-A', 'izomapa-tools/1.0', '--data-urlencode', f'data={q}', 'https://overpass-api.de/api/interpreter'],
                           check=True, capture_output=True, text=True).stdout
        return json.loads(t)['elements']
    v = vyber(dotaz(f'[out:json][timeout:60];(nwr["man_made"="chimney"]({b});nwr["tower:type"~"^(stack|cooling|communication)$"]({b});nwr["man_made"="storage_tank"]({b}););out tags center bb;'))
    json.dump(v, open('assets/kominy.json', 'w'), indent=0)
    tr = potrubi(dotaz(f'[out:json][timeout:60];way["man_made"="pipeline"]({b});out tags geom;'))
    json.dump(tr, open('assets/potrubi.json', 'w'))
    print({k: sum(p['k'] == k for p in v) for k in VYCHOZI_H}, 'potrubí', len(tr))

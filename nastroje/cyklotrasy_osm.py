# značené cyklotrasy z OpenStreetMap (Overpass, ODbL, bez registrace): úseky relací route=bicycle v okolí města
# -> assets/cyklotrasy.json: [[druh, [[lat, lon], ...]], ...], druh c = po silnici (cyklista u pravého okraje), d = po cestě (středem).
# Úseky po cyklostezkách vynechá (ty už jsou v pěších čarách jako druh k). Pak overlay.py a build_html.py.
# spouštět z kořene repa: python nastroje/cyklotrasy_osm.py
import json, subprocess, sys; sys.path.insert(0, '.')
import geo

SILNICE = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'service',
           'primary_link', 'secondary_link', 'tertiary_link'}
x0, y0, x1, y1 = geo.extent(geo.MARGIN)
lo0, la0 = geo.to_lonlat(x0, y0); lo1, la1 = geo.to_lonlat(x1, y1); b = f'{la0},{lo0},{la1},{lo1}'
q = f'[out:json][timeout:90];rel["route"="bicycle"]({b});way(r)({b});out tags geom;'
t = None
for url in ('https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'):   # záložní server
    try:
        t = subprocess.run(['curl', '-s', '-f', '-m', '150', '-A', 'izomapa-tools/1.0', '--data-urlencode', f'data={q}', url],
                           check=True, capture_output=True, text=True).stdout; json.loads(t); break
    except (subprocess.CalledProcessError, ValueError) as ex: print(url, str(ex)[:120]); t = None
CACHE = 'build/cyklotrasy_osm.json'               # poslední odpověď Overpassu, když je server přetížený
if t is not None: open(CACHE, 'w').write(t)
else:
    try: t = open(CACHE).read(); print('Overpass nedostupný, beru', CACHE)
    except OSError: sys.exit('Overpass nedostupný, zkus to později')
out = []
for e in json.loads(t)['elements']:
    hw = e.get('tags', {}).get('highway')
    if e['type'] != 'way' or 'geometry' not in e or hw in (None, 'cycleway', 'steps', 'proposed', 'construction'): continue
    if e['tags'].get('tunnel') in ('yes', 'building_passage'): continue
    druh = 'c' if hw in SILNICE else 'd'
    pts = [[round(p['lat'], 7), round(p['lon'], 7)] for p in e['geometry']]
    out.append([druh, pts])
json.dump(out, open('assets/cyklotrasy.json', 'w'))
print('úseků', len(out), 'po silnici', sum(d == 'c' for d, _ in out), 'po cestách', sum(d == 'd' for d, _ in out))

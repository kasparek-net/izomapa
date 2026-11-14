# dětská a workoutová hřiště z OpenStreetMap (Overpass, ODbL, bez registrace) -> assets/hriste.json
# {"hriste": [{"id", "k": "detske" | "workout", "poly": [[lat, lon], ...] nebo null, "ll": [lat, lon]}],
#  "prvky": [{"ll": [lat, lon], "t": typ prvku}]}   (prvky = zakreslené houpačky, skluzavky, hrazdy …)
# prep.py na hřiště rozmístí 3D vybavení (zakreslené prvky na své místo, zbytek automaticky podle velikosti hřiště).
# spouštět z kořene repa: python nastroje/hriste.py
import json, subprocess, sys, time; sys.path.insert(0, '.')
import geo

# OSM playground=* / fitness_station=* -> typ modelu v render.html
PRVKY = {'swing': 'houpacka', 'basketswing': 'houpacka', 'slide': 'skluzavka', 'structure': 'skluzavka', 'climbingframe': 'prolezacka',
         'climbingwall': 'prolezacka', 'sandpit': 'piskoviste', 'springy': 'houpadlo', 'seesaw': 'houpadlo', 'roundabout': 'kolotoc',
         'horizontal_bar': 'hrazda', 'parallel_bars': 'bradla', 'wall_bars': 'zebriny', 'sit-up': 'lavice', 'box': 'lavice', 'rings': 'hrazda'}

if __name__ == '__main__':
    x0, y0, x1, y1 = geo.extent(geo.MARGIN + 20)
    lo0, la0 = geo.to_lonlat(x0, y0); lo1, la1 = geo.to_lonlat(x1, y1); b = f'{la0},{lo0},{la1},{lo1}'
    q = (f'[out:json][timeout:90];(nwr["leisure"="playground"]({b});nwr["leisure"="fitness_station"]({b});'
         f'node["playground"]({b});node["fitness_station"]({b}););out tags geom;')
    URL = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter']
    for pokus in range(6):                      # Overpass bývá přetížený: střídat hlavní a záložní server
        try:
            t = subprocess.run(['curl', '-s', '-f', '-m', '150', '-A', 'izomapa-tools/1.0', '--data-urlencode', f'data={q}',
                                URL[pokus % 2]], check=True, capture_output=True, text=True).stdout
            el = json.loads(t)['elements']; break
        except Exception:
            time.sleep(20)
    else: sys.exit('Overpass nedostupný, zkus to později')
    hriste, prvky = [], []
    for e in el:
        tg = e.get('tags', {})
        if tg.get('leisure') in ('playground', 'fitness_station'):
            k = 'detske' if tg['leisure'] == 'playground' else 'workout'
            if e['type'] == 'node': hriste.append({'id': f'n{e["id"]}', 'k': k, 'poly': None, 'll': [round(e['lat'], 6), round(e['lon'], 6)]})
            elif e['type'] == 'way' and e.get('geometry') and len(e['geometry']) >= 4:
                g = e['geometry']
                hriste.append({'id': f'w{e["id"]}', 'k': k, 'poly': [[round(p['lat'], 6), round(p['lon'], 6)] for p in g],
                               'll': [round(sum(p['lat'] for p in g) / len(g), 6), round(sum(p['lon'] for p in g) / len(g), 6)]})
            elif e.get('bounds'):                       # relace (multipolygon): bod uprostřed
                bb = e['bounds']
                hriste.append({'id': f'r{e["id"]}', 'k': k, 'poly': None, 'll': [round((bb['minlat'] + bb['maxlat']) / 2, 6), round((bb['minlon'] + bb['maxlon']) / 2, 6)]})
        elif e['type'] == 'node':
            t_ = PRVKY.get(tg.get('playground') or tg.get('fitness_station'))
            if t_: prvky.append({'ll': [round(e['lat'], 6), round(e['lon'], 6)], 't': t_})
    json.dump({'hriste': hriste, 'prvky': prvky}, open('assets/hriste.json', 'w'), ensure_ascii=False, indent=0)
    print('dětská', sum(h['k'] == 'detske' for h in hriste), 'workout', sum(h['k'] == 'workout' for h in hriste), 'prvků', len(prvky))

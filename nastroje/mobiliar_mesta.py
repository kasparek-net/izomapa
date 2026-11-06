# mobiliář z pasportů města Kopřivnice (mapy na webu města, se souhlasem města) -> assets/mobiliar_mesta.json
# {"bench": [[lat, lon]], "bin": [...], "recycling": [...], "shelter": [...], "susak": [...], "klepadlo": [...]}
# bere jen stávající prvky a veřejná stanoviště odpadu, bez adres; soubor se nepřidává do gitu; spouštět z kořene repa
import json, subprocess
import xml.etree.ElementTree as ET

ROOT = 'https://mapserver.koprivnice.cz/services/mapserver/common'
M = '{http://mapserver.gis.umn.edu/mapserver}'; G = '{http://www.opengis.net/gml/3.2}'
TYPY = {'Lavičky, sedátka': 'bench', 'Sušáky na prádlo': 'susak', 'Klepadla na koberce': 'klepadlo', 'Kryté zastávky': 'shelter'}


def prvky(xml):
    """GML -> řádky {lat, lon, pole...}, jen bodové prvky."""
    out = []
    for m in ET.fromstring(xml):
        for f in m:
            if not f.tag.startswith(M): continue
            pos = f.find(f'{M}msGeometry/{G}Point/{G}pos')
            if pos is None: continue
            la, lo = (float(v) for v in pos.text.split())
            out.append({'lat': round(la, 6), 'lon': round(lo, 6), **{c.tag.replace(M, ''): (c.text or '').strip() for c in f if c.tag.startswith(M)}})
    return out


def roztrid(pam, odpad_kose, stanoviste):
    v = {k: [] for k in ('bench', 'bin', 'recycling', 'shelter', 'susak', 'klepadlo')}
    for r in pam:
        if r.get('stav', 'Stávající') != 'Stávající': continue
        k = TYPY.get(r.get('typ'))
        if not k and r.get('popis', '').lower().startswith(('koš', 'kamínkový koš')): k = 'bin'
        if k: v[k].append([r['lat'], r['lon']])
    v['bin'] += [[r['lat'], r['lon']] for r in odpad_kose]
    v['recycling'] = [[r['lat'], r['lon']] for r in stanoviste if r.get('verej') == 'A' and r.get('separ')]
    return {k: sorted({tuple(q) for q in x}) for k, x in v.items()}


def stahni(sluzba, vrstva):
    q = f'{ROOT}/{sluzba}/gservice?service=WFS&version=2.0.0&request=GetFeature&typeNames={vrstva}&srsName=EPSG:4326&count=2000'
    return prvky(subprocess.run(['curl', '-s', '-f', '-m', '180', '-A', 'izomapa-tools/1.0', q], check=True, capture_output=True, text=True).stdout)


if __name__ == '__main__':
    v = roztrid(stahni('pamob', 'mob-nab') + stahni('pamob', 'mob-dop'), stahni('paod', 'odko-i'), stahni('paod', 'odst-i'))
    json.dump(v, open('assets/mobiliar_mesta.json', 'w'))
    print({k: len(x) for k, x in v.items()})

# stromy a keře z Pasportu zeleně města Kopřivnice (mapa zeleně na webu města, se souhlasem města) -> assets/stromy_mesta.json
# [[lat, lon, výška m, jehličnan 0/1, keř 0/1]] a veřejné trávníky -> assets/zelen_mesta.json [[[lat, lon], ...]]
# soubory se nepřidávají do gitu; spouštět z kořene repa: python nastroje/stromy_mesta.py
import json, subprocess, sys
import xml.etree.ElementTree as ET

URL = 'https://mapserver.koprivnice.cz/services/mapserver/common/pazel/gservice'
M = '{http://mapserver.gis.umn.edu/mapserver}'; G = '{http://www.opengis.net/gml/3.2}'
VYCHOZI = {(0, 0): 9.0, (1, 0): 8.0, (0, 1): 2.5, (1, 1): 2.0}     # (jehličnan, keř) -> výška, když chybí


def radky(xml):
    """GML -> řádky [lat, lon, výška, jehličnan, keř]; bez bodové polohy se přeskočí."""
    out = []
    for m in ET.fromstring(xml):
        for f in m:
            if not f.tag.startswith(M): continue
            pos = f.find(f'{M}msGeometry/{G}Point/{G}pos')
            if pos is None: continue
            la, lo = (float(v) for v in pos.text.split())
            druh = f.findtext(f'{M}druh_nazev') or ''
            jeh, ker = int('jehličnat' in druh), int('keř' in druh.lower())
            try: h = float(f.findtext(f'{M}vyska_taxonu') or 0)
            except ValueError: h = 0.0
            if not 0.5 <= h <= 45: h = VYCHOZI[(jeh, ker)]
            out.append([round(la, 6), round(lo, 6), round(h, 1), jeh, ker])
    return out


TRAVNIKY = {'Parkový trávník', 'Luční trávník'}


def travniky(xml):
    """GML -> obrysy veřejných trávníků (jen vnější hranice), počet všech prvků."""
    out, n = [], 0
    for m in ET.fromstring(xml):
        for f in m:
            if not f.tag.startswith(M): continue
            n += 1
            if f.findtext(f'{M}druh_nazev') not in TRAVNIKY: continue
            for pl in f.iter(f'{G}exterior'):
                v = [float(x) for x in pl.find(f'.//{G}posList').text.split()]
                out.append([[round(v[i], 6), round(v[i + 1], 6)] for i in range(0, len(v), 2)])
    return out, n


def stahni(vrstva, zpracuj):
    vse, start = [], 0
    while True:
        q = f'{URL}?service=WFS&version=2.0.0&request=GetFeature&typeNames={vrstva}&srsName=EPSG:4326&count=2000&startIndex={start}'
        t = subprocess.run(['curl', '-s', '-f', '-m', '180', '-A', 'izomapa-tools/1.0', q], check=True, capture_output=True, text=True).stdout
        r, n = zpracuj(t)
        vse += r; start += 2000
        if n < 2000: return vse


if __name__ == '__main__':
    vse = stahni('pz-biob-ver', lambda t: (lambda r: (r, len(r)))(radky(t)))
    json.dump(vse, open('assets/stromy_mesta.json', 'w'))
    tr = stahni('pz-p-ver', travniky)
    json.dump(tr, open('assets/zelen_mesta.json', 'w'))
    print('trávníků', len(tr))
    print('prvků', len(vse), 'stromů', sum(not x[4] for x in vse), 'keřů', sum(x[4] for x in vse))

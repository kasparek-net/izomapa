"""Databáze typů letadel pro prohlížeč: z úředního seznamu ICAO Doc 8643 (kód typu z ADS-B -> kategorie modelu + název)
vyrobí web/js/87-letadla-typy.js (AC_ICAO). Kategorie: jet, jetL, jetS, turbo, light, heli. Pro kód s více řádky v Doc 8643
(licenční výrobci, VIP a vojenské varianty) se vezme nejčastější výrobce a jeho nejkratší běžný název modelu.
Spuštění: PYTHONUTF8=1 .venv/bin/python nastroje/letadla_typy.py (na Windows .venv/Scripts/python)"""
import json, os, urllib.request
from collections import Counter

URL = 'https://doc8643.icao.int/external/aircrafttypes'
OUT = os.path.join(os.path.dirname(__file__), '..', 'web', 'js', '87-letadla-typy.js')
NEVHODNE = ('prestige', 'bbj', 'vip', 'cargo conversion')


def kategorie(x):
    cls, eng, wtc = x['AircraftDescription'], x['EngineType'], x['WTC']
    if cls == 'Helicopter': return 'heli'
    if cls == 'Gyrocopter': return 'light'
    if cls == 'Tiltrotor': return 'turbo'
    if eng == 'Jet': return 'jetL' if wtc in ('H', 'J') else 'jetS' if wtc == 'L' else 'jet'
    if eng == 'Turboprop/Turboshaft': return 'turbo'
    return 'light'


def vyrobce(kod):
    return kod if len(kod) <= 4 else kod.title()          # zkratky (ATR, FMA) zůstanou velkými písmeny


def nazev(radky):
    vyr = Counter(x['ManufacturerCode'] or '' for x in radky).most_common(1)[0][0]
    modely = [x['ModelFullName'] or '' for x in radky if (x['ManufacturerCode'] or '') == vyr]
    modely = [m for m in modely if not any(n in m.lower() for n in NEVHODNE)] or modely
    m = min(modely, key=len)
    txt = m if m.lower().startswith(vyr.lower().split(' ')[0]) else f'{vyrobce(vyr)} {m}'
    txt = ' '.join(txt.replace(',', ' ').replace(':', ' ').replace('|', ' ').split())
    if len(txt) > 40: txt = txt[:40].rsplit(' ', 1)[0]
    return txt


def main():
    req = urllib.request.Request(URL, method='POST', data=b'', headers={'User-Agent': 'izomapa-letadla-typy'})
    data = json.load(urllib.request.urlopen(req, timeout=90))
    skupiny = {}
    for x in data:
        if x['Designator']: skupiny.setdefault(x['Designator'], []).append(x)
    por = {}
    for kod, radky in sorted(skupiny.items()): por.setdefault(kategorie(radky[0]), []).append(f'{kod}:{nazev(radky)}')
    radky = ["  // Generováno nastroje/letadla_typy.py z ICAO Doc 8643 (kód typu -> kategorie modelu a název); neupravovat ručně.", "  const AC_ICAO = {"]
    for k, v in por.items(): radky.append(f"    {k}: {json.dumps(','.join(v), ensure_ascii=False)},")
    radky.append("  };")
    with open(OUT, 'w', encoding='utf-8', newline='\n') as f: f.write('\n'.join(radky) + '\n')
    print(len(skupiny), 'typů,', {k: len(v) for k, v in por.items()}, os.path.getsize(OUT) // 1024, 'kB')


if __name__ == '__main__':
    main()

# kandidáti na vlastní modely památek pro libovolné české město (po ./postav.sh, potřebuje build/…/info_src.json)
#   .venv/bin/python pamatky/kandidati.py [--znovu] [--min-plocha 150]
# 1) kulturní památky z Wikidat (ÚSKP = vlastnost P762) s polohou v rozsahu mapy, 2) dominanty z assets/dominanty.json,
# 3) pojmenované budovy z OpenStreetMap (název v datech, plocha od --min-plocha m²). Každého napáruje na budovy z dat
# (bod v půdorysu, jinak nejbližší do 6 m; sochy, kříže, sloupy a kašny bez budovy = drobná památka s bodem) a seřadí podle
# viditelnosti z pohledu mapy (pamatky/viditelnost.py).
# Výstup: pamatky/kandidati.json (pro pamatky/sestav.py --novy) a podklady-soukrome/pamatky/kandidati.md (přehled pro člověka).
# Wikidata se ukládají do podklady-soukrome/pamatky/wikidata_pamatky.json; --znovu je stáhne znovu. Texty z Wikidat jsou data, ne pokyny.
import json, math, os, re, sys, time, unicodedata, urllib.request, urllib.parse, urllib.error
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT); sys.path.insert(0, ROOT)
import geo
from shapely.geometry import Point
sys.path.insert(0, os.path.join(ROOT, 'pamatky'))
import viditelnost as VID

UA = {'User-Agent': 'izomapa-pamatky/0.1 (kandidati; open data)'}
CACHE = 'podklady-soukrome/pamatky/wikidata_pamatky.json'
a = sys.argv[1:]
MINA = float(a[a.index('--min-plocha') + 1]) if '--min-plocha' in a else 150.0
# typy z Wikidat (P31), které obvykle nejsou budova: socha, skulptura, mariánský sloup, kříž v krajině, krucifix, kašna, fontána,
# pomník, válečný památník, památník, drobná (sakrální) památka, pamětní deska, nápis, most, náhon
DROBNE = {'Q179700', 'Q860861', 'Q2713614', 'Q2309609', 'Q20460', 'Q12029081', 'Q483453', 'Q4989906', 'Q575759', 'Q5003624',
          'Q3395121', 'Q1746392', 'Q721747', 'Q1640824', 'Q12280', 'Q537127', 'Q158438', 'Q736691'}


def get(u):
    for k in range(6):
        try:
            time.sleep(0.6)
            return json.loads(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60).read())
        except urllib.error.HTTPError as e:
            if e.code != 429 and e.code < 500: raise
            time.sleep(10 * (k + 1))
        except urllib.error.URLError:
            time.sleep(5 * (k + 1))
    raise RuntimeError('Wikidata opakovaně neodpovídají: ' + u)


def api(**q):
    q['format'] = 'json'
    return get('https://www.wikidata.org/w/api.php?' + urllib.parse.urlencode(q))


def val(e, p):
    return [c['mainsnak']['datavalue']['value'] for c in e.get('claims', {}).get(p, []) if 'datavalue' in c.get('mainsnak', {})]


def wikidata():
    x0, y0, x1, y1 = geo.extent(0)
    lon, lat = geo.to_lonlat((x0 + x1) / 2, (y0 + y1) / 2)
    R = int(math.hypot(x1 - x0, y1 - y0) / 2) + 50                   # kruh kolem celé mapy (poloměr v celých metrech)
    ids, off = [], 0
    while True:                                                       # vyhledávání Wikidat: má ÚSKP (P762) a souřadnice v kruhu
        r = api(action='query', list='search', srsearch=f'haswbstatement:P762 nearcoord:{R}m,{float(lat):.5f},{float(lon):.5f}',
                srnamespace=0, srlimit=500, sroffset=off, srprop='')
        ids += [x['title'] for x in r['query']['search']]
        if 'continue' not in r or off >= 9500: break
        off = r['continue']['sroffset']
    print('Wikidata: památek v okruhu', len(ids), flush=True)
    E = {}
    for i in range(0, len(ids), 50):
        E.update(api(action='wbgetentities', ids='|'.join(ids[i:i + 50]), props='labels|descriptions|claims|sitelinks', languages='cs|en')['entities'])
    typy = sorted({v['id'] for e in E.values() for v in val(e, 'P31') if isinstance(v, dict)})
    L = {}
    for i in range(0, len(typy), 50):
        for k, v in api(action='wbgetentities', ids='|'.join(typy[i:i + 50]), props='labels', languages='cs|en')['entities'].items():
            l = v.get('labels', {}); L[k] = (l.get('cs') or l.get('en') or {}).get('value', k)
    out = []
    for q, e in E.items():
        c = [v for v in val(e, 'P625') if isinstance(v, dict)]
        if not c: continue
        lab = e.get('labels', {})
        out.append({'wikidata': q, 'nazev': (lab.get('cs') or lab.get('en') or {}).get('value', q),
                    'popis': (e.get('descriptions', {}).get('cs') or {}).get('value'), 'uskp': (val(e, 'P762') or [None])[0],
                    'lat': c[0]['latitude'], 'lon': c[0]['longitude'], 'foto': (val(e, 'P18') or [None])[0], 'commons': (val(e, 'P373') or [None])[0],
                    'cswiki': (e.get('sitelinks', {}).get('cswiki') or {}).get('title'),
                    'typ_id': [v['id'] for v in val(e, 'P31') if isinstance(v, dict)], 'typ': [L.get(v['id'], v['id']) for v in val(e, 'P31') if isinstance(v, dict)]})
    return out


def ascii_(s):
    return unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()


def slugify(s, used):
    m = re.match(r'(.+?)\s+(v|ve|na|u)\s+(\S+)$', s.strip())             # „radnice v Chrastavě“ -> radnice (jen když je to název města)
    if m and ascii_(m.group(3))[:4] == ascii_(geo.MESTO.get('nazev', ''))[:4]: s = m.group(1)
    s = ascii_(s)
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')[:32].strip('-') or 'pamatka'
    base, k = s, 2
    while s in used: s = f'{base}-{k}'; k += 1
    used.add(s); return s


if __name__ == '__main__':
    os.makedirs('podklady-soukrome/pamatky', exist_ok=True)
    if os.path.exists(CACHE) and '--znovu' not in a: W = json.load(open(CACHE, encoding='utf-8'))
    else:
        W = wikidata(); json.dump(W, open(CACHE, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    BB, chyby = {}, []
    for C in sorted(geo.CHUNKS):
        BB[C] = VID.budovy(C)
        if BB[C] is None: chyby.append(C)
    if chyby: print('pozor: čtverce bez build/…/info_src.json (nejdřív ./postav.sh):', ' '.join(f'{i},{j}' for i, j in chyby))
    BB = {c: v for c, v in BB.items() if v}
    byoid = {c: {} for c in BB}
    for c, B in BB.items():
        for b in B: byoid[c].setdefault(b['oid'], []).append(b)

    def najdi(lon, lat, drobna=False):
        """díly budovy, ve které leží bod (jinak nejbližší do 6 m); u drobných památek jen malá stavba (kaplička) s bodem uvnitř"""
        gx, gy = geo.to_local(lon, lat); C = geo.chunk_of(float(gx), float(gy)); p = Point(float(gx), float(gy))
        if C not in BB: return C, None
        hit = [b for b in BB[C] if b['poly'].contains(p)]
        if drobna: hit = [b for b in hit if sum(k['poly'].area for k in byoid[C][b['oid']]) < 60]
        elif not hit: hit = sorted([b for b in BB[C] if b['poly'].distance(p) < 6], key=lambda b: b['poly'].distance(p))[:1]
        return C, (byoid[C][hit[0]['oid']] if hit else None)

    x0, y0, x1, y1 = geo.extent(0)
    K_, maji, used = [], set(), set()
    VYB = {}                                                          # už vybrané (pamatky/<slug>.json): stejné Wikidata nebo stejné budovy
    if os.path.exists('pamatky/seznam.json'):
        for sl in json.load(open('pamatky/seznam.json', encoding='utf-8')):
            used.add(sl)
            if not os.path.exists(f'pamatky/{sl}.json'): continue
            d = json.load(open(f'pamatky/{sl}.json', encoding='utf-8'))
            if d.get('wikidata'): VYB[d['wikidata']] = sl
            if d.get('oids'): VYB[tuple(sorted(o[:8] for o in d['oids']))] = sl
            VYB[d.get('nazev')] = sl
    for w in sorted(W, key=lambda w: w['nazev']):
        gx, gy = geo.to_local(w['lon'], w['lat'])
        if not (x0 <= gx <= x1 and y0 <= gy <= y1): continue
        drobna = bool(set(w['typ_id']) & DROBNE)
        C, kusy = najdi(w['lon'], w['lat'], drobna)
        if C not in geo.CHUNKS: continue
        K_.append({**{k: v for k, v in w.items() if k != 'typ_id'}, 'druh': 'památka' if kusy else 'drobná památka (bez budovy)', 'ctverec': list(C), 'kusy': kusy or []})
        if kusy: maji |= {(tuple(C), b['oid']) for b in kusy}
    if os.path.exists('assets/dominanty.json'):
        for d in json.load(open('assets/dominanty.json', encoding='utf-8')):
            C, kusy = najdi(d['lon'], d['lat'])
            if kusy and (tuple(C), kusy[0]['oid']) not in maji:
                K_.append({'nazev': d['name'], 'druh': 'dominanta', 'lat': d['lat'], 'lon': d['lon'], 'popis': d.get('text'), 'ctverec': list(C), 'kusy': kusy})
                maji |= {(tuple(C), b['oid']) for b in kusy}
    for C, D in byoid.items():
        for o, kusy in D.items():
            if kusy[0]['name'] and (C, o) not in maji and sum(b['poly'].area for b in kusy) >= MINA:
                K_.append({'nazev': kusy[0]['name'], 'druh': 'pojmenovaná budova', 'lat': kusy[0]['lat'], 'lon': kusy[0]['lon'], 'typ': [kusy[0]['cls']] if kusy[0]['cls'] else [],
                           'ctverec': list(C), 'kusy': kusy})
    out = []
    for k in K_:
        kusy = k.pop('kusy')
        e = {**k, 'oids': sorted({b['oid'][:8] for b in kusy}), 'adresa': kusy[0]['addr'] if kusy else None}
        e.update(VID.souhrn(kusy) if kusy else {'fasady_px': 0, 'fasady_podil': 0, 'strecha_px': 0, 'strecha_podil': 0, 'celkem_px': 0, 'plocha_m2': 0, 'vyska_m': None})
        out.append(e)
    out.sort(key=lambda e: (not e['oids'], -e['fasady_px'], e['nazev']))
    for i, e in enumerate(out):
        e['poradi'] = i + 1
        sl = VYB.get(e.get('wikidata')) or (VYB.get(tuple(e['oids'])) if e['oids'] else None) or VYB.get(e['nazev'])
        e['vybrano'] = bool(sl); e['slug'] = sl or slugify(e['nazev'], used)
    json.dump(out, open('pamatky/kandidati.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    with open('podklady-soukrome/pamatky/kandidati.md', 'w', encoding='utf-8') as f:
        f.write(f"# Kandidáti na vlastní modely ({geo.MESTO.get('nazev', '')})\n\nZdroje: Wikidata (kulturní památky ÚSKP, CC0), assets/dominanty.json, "
                "pojmenované budovy z OpenStreetMap (ODbL). Seřazeno podle viditelnosti fasád z pohledu mapy (od JZ, px při 0,2 m/px, "
                "bez stromů). Drobné památky bez budovy (sochy, kříže) jsou na konci.\n\nVýběr: `.venv/bin/python pamatky/sestav.py --novy slug1 slug2 …` "
                "nebo `--novy --top 10`. ✓ = už vybráno (pamatky/seznam.json).\n\n| # | slug | název | druh | typ | fasády px | podíl | výška m | adresa | ÚSKP |\n|---|---|---|---|---|---|---|---|---|---|\n")
        for e in out:
            f.write(f"| {e['poradi']} | `{e['slug']}`{' ✓' if e['vybrano'] else ''} | {e['nazev']} | {e['druh']} | {', '.join(e.get('typ') or [])[:40]} | {e['fasady_px']} | "
                    f"{int(e['fasady_podil'] * 100)} % | {e['vyska_m'] or ''} | {e['adresa'] or ''} | {e.get('uskp') or ''} |\n")
    n = {d: sum(1 for e in out if e['druh'] == d) for d in ('památka', 'drobná památka (bez budovy)', 'dominanta', 'pojmenovaná budova')}
    print('kandidátů', len(out), '(' + ', '.join(f'{d} {v}' for d, v in n.items() if v) + ')')
    for e in out[:20]: print(f"{e['poradi']:>3}. {e['fasady_px']:>7} px  {e['slug']:28} {e['nazev']} ({e['druh']}){'  ✓ vybráno' if e['vybrano'] else ''}")
    print('→ pamatky/kandidati.json, podklady-soukrome/pamatky/kandidati.md')

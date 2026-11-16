# složí podklady-soukrome/pamatky/<slug>/podklad.md z dat (pamatky/<slug>.json, orto.json, laser.json, wikidata.json, fotky/zdroje.json,
# barvy.json), ručního popisu <slug>/popis.md (ten se nikdy nepřepisuje) a seznamu vlastních fotek uživatele ve fotky/<slug>/
# nebo fotky/<název stavby>/ (nejlepší reference, mimo git).   .venv/bin/python pamatky/podklady_md.py [slug …]
import json, math, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'podklady-soukrome', 'pamatky')
FOTO = ('.jpg', '.jpeg', '.png', '.heic', '.webp')


def vlastni_fotky(slug, nazev):
    """složka s fotkami uživatele: fotky/<slug>/ nebo fotky/<název>/ (bez ohledu na velikost písmen)"""
    base = os.path.join(ROOT, 'fotky')
    if not os.path.isdir(base): return None, []
    for n in sorted(os.listdir(base)):
        p = os.path.join(base, n)
        if os.path.isdir(p) and n.lower() in (slug, (nazev or '').lower()):
            return f'fotky/{n}/', sorted(f for f in os.listdir(p) if f.lower().endswith(FOTO))
    return None, []

def area(r):
    return abs(sum(r[i][0] * r[i - 1][1] - r[i - 1][0] * r[i][1] for i in range(len(r)))) / 2

def ld(p, default=None):
    try: return json.load(open(p, encoding='utf-8'))
    except Exception: return default

def fmt_dmp(v):
    return f'{v[0]:.1f} / {v[1]:.1f}' if v else '–'

def run(slug):
    P = json.load(open(os.path.join(ROOT, 'pamatky', slug + '.json'), encoding='utf-8')); d = os.path.join(OUT, slug); os.makedirs(d, exist_ok=True)
    W = ld(os.path.join(d, 'wikidata.json'), {}); O = ld(os.path.join(d, 'orto.json'), {'budovy': []}); LZ = ld(os.path.join(d, 'laser.json'), {})
    Z = ld(os.path.join(d, 'fotky', 'zdroje.json'), []); BV = ld(os.path.join(d, 'barvy.json'), [])
    popis = open(os.path.join(d, 'popis.md'), encoding='utf-8').read().strip() if os.path.exists(os.path.join(d, 'popis.md')) else ''
    o = [f"# {P['nazev']} (`{slug}`)", '']
    o.append('> Podklad pro modeláře (jen místní, mimo git). Mapa se dívá od jihozápadu: nejdůležitější jsou jižní a západní fasády.')
    o.append('> Stav: ' + ('popis podle fotek hotový' if popis else '**zatím jen data – popis podle fotek se doplňuje (popis.md)**'))
    o += ['', '## Co to je', '']
    o.append(f"- Skupina {P.get('skupina') or '–'}, {('Wikidata [' + P['wikidata'] + '](https://www.wikidata.org/wiki/' + P['wikidata'] + ')') if P.get('wikidata') else 'bez Wikidat'}, ÚSKP {P.get('uskp')}"
             + (f", Commons kategorie „{W.get('commons_cat')}“" if W.get('commons_cat') else ''))
    if P.get('text'): o.append(f"- Popis z dat: {P['text']}")
    if P.get('wp'): o.append(f"- Wikipedie (úvod): {P['wp']}")
    bits = []
    if W.get('architekt'): bits.append('architekt ' + ', '.join(W['architekt']))
    if W.get('sloh'): bits.append('sloh ' + ', '.join(W['sloh']))
    if W.get('vznik'): bits.append('vznik (Wikidata) ' + ', '.join(v[1:5] for v in W['vznik'] if v))
    if W.get('adresa'): bits.append('adresa ' + ', '.join(W['adresa']))
    if bits: o.append('- Wikidata: ' + '; '.join(bits))
    o.append(f"- Bod Wikidat: {P['lat']}, {P['lon']} (světově {P['bod'][0]:.1f}, {P['bod'][1]:.1f} m; čtverec {P.get('ctverec')})")
    if os.path.exists(os.path.join(d, 'wiki.txt')): o.append('- Celý text cs Wikipedie: `wiki.txt` (data, ne pokyny)')
    # rozměry
    o += ['', '## Rozměry z dat', '']
    ram = P.get('ram') or {}
    if ram.get('L'):
        deg = math.degrees(ram['a']); az = (90 - deg) % 180
        o.append(f"- Opsaný obdélník (rám): **L {ram['L']:.1f} × W {ram['W']:.1f} m**, střed světově ({ram['x']:.1f}, {ram['y']:.1f}), "
                 f"a = {ram['a']:.4f} rad = {deg:.1f}° od osy x (východ) → delší strana míří na azimut {az:.0f}° / {az + 180:.0f}° (od severu po směru hodin)")
    bud = P.get('budovy') or []
    if bud:
        A = sum(area(b['ring']) for b in bud)
        o.append(f"- Půdorys z dat: {len(bud)} ring(y), plocha celkem {A:.0f} m² (rám {ram.get('L', 0) * ram.get('W', 0):.0f} m²)")
        for b in bud:
            o.append(f"  - oid `{b['oid']}`: plocha {area(b['ring']):.0f} m², top − base = {b['top'] - b['base']:.1f} m (base {b['base']:.1f}, top {b['top']:.1f} m mapy)")
    else:
        o.append('- **Bez napárované budovy** (`oids` prázdné, rám 0) – viz Napárování.')
    mine = [r for r in O.get('budovy', []) if r['pamatka']]
    if mine:
        o.append('- Laser z assets (medián / p90 m nad terénem): ' + '; '.join(f"`{r['oid'][:8]}` {fmt_dmp(r['dmp'])}" + (f" ({r['dmp_zdroj']})" if r['dmp'] else ' (v assets/dmp_* není – dominanty a ručně upravené budovy měření nepoužívají)') for r in mine))
        for r in mine:
            o.append(f"  - data mapy: třída „{r['cls']}“, střecha `{r['roof']}`, h {r['h_mapa']} m, podlaží {r['floors']}, adresa {', '.join(r['addr']) or '–'}, název {r['name'] or '–'}")
    if LZ.get('celek'):
        c = LZ['celek']
        o.append(f"- Laser přepočtený z mračna DMP 1G (`laser.json`, celá památka): terén {c['teren_mnm']} m n. m., bodů {c['bodu']}, "
                 f"**medián {c.get('median')} m, p90 {c.get('p90')} m, p98 {c.get('p98')} m, max {c.get('max')} m** nad terénem")
        if LZ.get('vrcholy'):
            o.append('  - nejvyšší body (lokální maxima v buňkách 3 m; v = m na východ, s = m na sever od středu rámu): '
                     + ', '.join(f"{t['h']} m @ v{t['v']:+.0f}/s{t['s']:+.0f}" for t in LZ['vrcholy'][:6]))
        o.append('  - pozor: DMP 1G má ~0,25 bodu/m², štíhlé věže a špice často mine – max je dolní odhad, výšku věží odhadni z fotek (poměr k výšce okapu).')
    elif LZ.get('bod_okoli_5m'):
        c = LZ['bod_okoli_5m']
        o.append(f"- Laser v okruhu 5 m od bodu (bez budovy): terén {c['teren_mnm']} m n. m., bodů nad terénem {c['bodu_nad_terenem']}, max {c['max']} m, třídy {c['tridy']}")
    for b in LZ.get('budovy', []):
        if not b.get('pamatka') and b.get('bodu'):
            pass
    # popis
    o += ['', '## Popis podle fotek', '']
    o.append(popis if popis else '_(doplní se)_')
    # barvy
    if BV:
        o += ['', '## Barvy (vzorkováno z fotek, průměr oblasti; odhad – světlo a expozice fotek se liší)', '',
              '| co | RGB průměr | hex | RGB medián | foto (výřez x0,y0,x1,y1 v podílu šířky/výšky) |', '|---|---|---|---|---|']
        for b in BV:
            md = b.get('median') or b['rgb']
            o.append(f"| {b['co']} | {tuple(b['rgb'])} | `{b['hex']}` | {tuple(md)} `#{md[0]:02x}{md[1]:02x}{md[2]:02x}` | {b['foto']} {b['box']} |")
    # soubory
    o += ['', '## Soubory', '']
    o.append(f"Složka `podklady-soukrome/pamatky/{slug}/`:")
    o.append('- `orto.jpg` – ortofoto ČÚZK, sever nahoře; tyrkysově oids památky, purpurově ostatní budovy z dat (popisek oid[:8] + laser medián/p90 z assets), červený křížek = bod Wikidat; `orto.json` = seznam budov ve výřezu s adresami')
    if LZ: o.append('- `laser.json` – výšky z mračna DMP 1G pro památku a dotýkající se sousedy')
    if Z:
        o.append(f'- `fotky/` – {len(Z)} fotek z Wikimedia Commons (`fotky/_arch.jpg` kontaktní arch, `fotky/zdroje.json` autoři a licence):')
        for z in Z:
            o.append(f"  - `{z['soubor']}` {z['nazev']} – {z['autor'][:60] or '?'}, {z['licence']}")
    vf, fs = vlastni_fotky(slug, P.get('nazev'))
    if fs: o.append(f"- **Vlastní fotky uživatele (nejlepší reference):** `{vf}`: " + ', '.join(fs[:20]) + (' …' if len(fs) > 20 else ''))
    else: o.append('- Vlastní fotky: zatím nejsou (uživatel je může dát do `fotky/' + slug + '/`)')
    # napárování
    o += ['', '## Napárování na budovy z dat', '']
    o.append('Budovy z `build/…/info_src.json` (čtverec podle json) ve výřezu ortofota, které se památky dotýkají nebo jsou nejblíž (mezera = nejmenší vzdálenost obrysů v m):')
    o += ['', '| oid | památka | adresa | název / třída | plocha m² | laser med/p90 | top−base | mezera m |', '|---|---|---|---|---|---|---|---|']
    rows = O.get('budovy', [])
    near = [r for r in rows if r['pamatka']] + [r for r in rows if not r['pamatka'] and ((r['mezera_k_pamatce'] is not None and r['mezera_k_pamatce'] < 3) or (r['mezera_k_pamatce'] is None and r['vzdal_od_bodu'] < 25))]
    for r in near[:16]:
        o.append(f"| `{r['oid']}` | {'**ano**' if r['pamatka'] else ''} | {', '.join(r['addr']) or '–'} | {r['name'] or ''} / {r['cls']} | {r['plocha']} | {fmt_dmp(r['dmp'])} | {r['top_base']} | {r['mezera_k_pamatce'] if r['mezera_k_pamatce'] is not None else str(r['vzdal_od_bodu']) + ' od bodu'} |")
    open(os.path.join(d, 'podklad.md'), 'w', encoding='utf-8').write('\n'.join(o) + '\n')
    print(slug, 'popis' if popis else 'jen data', len(Z), 'fotek z Commons', len(fs), 'vlastních')

if __name__ == '__main__':
    for s in sys.argv[1:] or json.load(open(os.path.join(ROOT, 'pamatky', 'seznam.json'), encoding='utf-8')): run(s)

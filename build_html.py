"""Z web/app.html a mesto.json vyrobí site/index.html (texty, meta, sitemap). Výsledná složka site/ je statický web."""
import hashlib, html, json, os, re
from PIL import Image
import geo
from geo import MESTO


def og_obrazek(out='site/og.jpg', W=1200, H=630, dolu=1):
    """náhled pro sdílení (og:image) 1200×630: výřez středu města z letních dlaždic (o úroveň menší než plné rozlišení)"""
    t = json.load(open('site/tiles.json')); base = t['base']; I = t['summer']['Image']
    T = int(I['TileSize']); SW, SH = int(I['Size']['Width']), int(I['Size']['Height'])
    lv = max(int(n) for n in os.listdir('site/tiles/summer') if n.isdigit()) - dolu; k = 2 ** dolu
    vx, vy, _ = geo.view(0, 0, 0)
    cx, cy = (vx - base['x0']) / base['mpp'] / k, (base['y1'] - vy) / base['mpp'] / k
    lw, lh = -(-SW // k), -(-SH // k)
    x0 = int(min(max(cx - W / 2, 0), max(lw - W, 0))); y0 = int(min(max(cy - H / 2, 0), max(lh - H, 0)))
    img = Image.new('RGB', (W, H), (27, 33, 48))
    for i in range(x0 // T, (x0 + W) // T + 1):
        for j in range(y0 // T, (y0 + H) // T + 1):
            f = f'site/tiles/summer/{lv}/{i}_{j}.webp'
            if os.path.exists(f):
                q = Image.open(f).convert('RGBA'); img.paste(q, (i * T - x0, j * T - y0), q)
    img.save(out, quality=85)


M = MESTO
SITE_URL = (M.get('url') or '').rstrip('/')          # plná adresa webu (kvůli og:image a sitemap); prázdné = bez nich
mhd = M.get('mhd') or {}
E = lambda t: html.escape(t or '', quote=True)
fill = {
    'TITULEK': E(M['titulek']), 'POPIS': E(M['popis']), 'MESTO': E(M['nazev']), 'H1_A': E(M['h1'][0]), 'H1_B': E(M['h1'][1]),
    'PODTITUL': E(M['podtitul']),
    'HLASENI': 'true' if M.get('hlaseni') else 'false',
    'MHD': 'true' if mhd.get('gtfs') else 'false',
    'VITR': 'true' if M.get('vitr') else 'false',
    'POCASI': 'true' if M.get('pocasi') else 'false',
    'VLAK': json.dumps({'vychozi': (M.get('vlak') or {}).get('vychozi', 'regionova') if isinstance(M.get('vlak'), dict) else M.get('vlak', 'regionova'), 'linky': M['vlak'].get('linky', {}) if isinstance(M.get('vlak'), dict) else {}}),
    'RUIAN_ZDROJ': ', typy budov z RÚIAN' if os.path.exists('assets/ruian_budovy.json') else '',
    'DOPRAVA_ZDROJ': ', intenzity dopravy © <a href="https://www.rsd.cz/silnice-a-dalnice/scitani-dopravy" target="_blank" rel="noopener">ŘSD ČR</a> (Celostátní sčítání dopravy)' if M.get('doprava') else '',
    'VITR_ZDROJ': ', ' + ('počasí a vítr' if M.get('pocasi') and M.get('vitr') else 'počasí' if M.get('pocasi') else 'vítr') + ' © <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> (CC BY 4.0)' + (', kvalita ovzduší z modelu <a href="https://atmosphere.copernicus.eu/" target="_blank" rel="noopener">Copernicus CAMS</a>' if M.get('pocasi') else '') if M.get('vitr') or M.get('pocasi') else '',
    'ZDROJOVY_KOD': f'<p class="muted"><a href="{E(M["zdrojovy_kod"])}" target="_blank" rel="noopener">Zdrojový kód této mapy</a> (AGPL-3.0).</p>'
                    if M.get('zdrojovy_kod') else '',
    'MHD_ZDROJ': f', jízdní řády © <a href="{E(mhd["zdroj_url"])}" target="_blank" rel="noopener">{E(mhd["zdroj"])}</a>'
                 if mhd.get('gtfs') and mhd.get('zdroj') else '',
}
app = re.sub(r'\{\{(\w+)\}\}', lambda m: fill[m.group(1)], open('web/app.html', encoding='utf-8').read())
# social networks cache images by URL, so a changed og.jpg needs a new one
OG_V = hashlib.sha256(open('site/og.jpg', 'rb').read()).hexdigest()[:10] if os.path.exists('site/og.jpg') else '1'
og = f'''<meta property="og:image" content="{SITE_URL}/og.jpg?v={OG_V}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="{E(M['titulek'])}: izometrická pixel-art mapa města">
<meta property="og:url" content="{SITE_URL}/">
<link rel="canonical" href="{SITE_URL}/">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="{SITE_URL}/og.jpg?v={OG_V}">
''' if SITE_URL else ''
LD = json.dumps({'@context': 'https://schema.org', '@type': 'WebApplication', 'name': M['titulek'], 'description': M['popis'],
                 'inLanguage': 'cs', 'applicationCategory': 'TravelApplication', 'operatingSystem': 'Web',
                 'spatialCoverage': {'@type': 'Place', 'name': M['nazev']},
                 'isBasedOn': ['https://www.openstreetmap.org/', 'https://overturemaps.org/', 'https://geoportal.cuzk.cz/']},
                ensure_ascii=False)
head = f'''<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta property="og:title" content="{E(M['titulek'])}">
<meta property="og:description" content="{E(M['popis'])}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="{E(M['titulek'])}">
<meta property="og:locale" content="cs_CZ">
{og}<script type="application/ld+json">{LD}</script>
<style>:root{{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}}body{{margin:0;font:14px system-ui}}[hidden]{{display:none!important}}</style>
'''
body_start = app.index('</style>') + len('</style>')
page = head + app[:body_start] + '\n</head>\n<body>\n' + app[body_start:] + '\n</body>\n</html>\n'
open('site/index.html', 'w', encoding='utf-8').write(page)
open('site/robots.txt', 'w').write('User-agent: *\nAllow: /\n' + (f'Sitemap: {SITE_URL}/sitemap.xml\n' if SITE_URL else ''))
if SITE_URL:
    open('site/sitemap.xml', 'w').write(f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>{SITE_URL}/</loc></url></urlset>\n')
# tiles and previews carry ?v= from set_status.py, so they can be cached forever; Pages reads _headers, other hosts ignore it
open('site/_headers', 'w').write(''.join(f'/{d}/*\n  Cache-Control: public, max-age=31536000, immutable\n' for d in ('tiles', 'preview')))
open('site/404.html', 'w', encoding='utf-8').write(f'''<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Stránka nenalezena | {E(M['titulek'])}</title>
<style>
body{{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;box-sizing:border-box;background:#1b2333;color:#eef1e6;font:18px/1.5 system-ui,sans-serif;text-align:center}}
a{{color:#f2c66d}}
</style>
</head>
<body>
<main>
<h1>Tato stránka tu není</h1>
<p><a href="/">Zpět na mapu: {E(M['titulek'])}</a></p>
</main>
</body>
</html>
''')
if M.get('hlaseni'):                                  # volitelná administrace hlášení (server v hlaseni/)
    open('site/admin.html', 'w', encoding='utf-8').write(open('hlaseni/admin.html', encoding='utf-8').read())
print('site/index.html', len(page))

# og:image: vyrobí se jednou ze středu města; vlastní site/og.jpg (1200×630) se nepřepisuje
if SITE_URL and not os.path.exists('site/og.jpg') and os.path.exists('site/tiles.json'):
    og_obrazek(); print('site/og.jpg')

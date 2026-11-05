"""Z web/app.html a mesto.json vyrobí site/index.html (texty, meta, sitemap). Výsledná složka site/ je statický web."""
import html, json, re
from geo import MESTO

M = MESTO
SITE_URL = (M.get('url') or '').rstrip('/')          # plná adresa webu (kvůli og:image a sitemap); prázdné = bez nich
mhd = M.get('mhd') or {}
E = lambda t: html.escape(t or '', quote=True)
fill = {
    'TITULEK': E(M['titulek']), 'POPIS': E(M['popis']), 'MESTO': E(M['nazev']), 'H1_A': E(M['h1'][0]), 'H1_B': E(M['h1'][1]),
    'PODTITUL': E(M['podtitul']),
    'HLASENI': 'true' if M.get('hlaseni') else 'false',
    'MHD': 'true' if mhd.get('gtfs') else 'false',
    'ZDROJOVY_KOD': f'<p class="muted"><a href="{E(M["zdrojovy_kod"])}" target="_blank" rel="noopener">Zdrojový kód této mapy</a> (AGPL-3.0).</p>'
                    if M.get('zdrojovy_kod') else '',
    'MHD_ZDROJ': f', jízdní řády MHD © <a href="{E(mhd["zdroj_url"])}" target="_blank" rel="noopener">{E(mhd["zdroj"])}</a>'
                 if mhd.get('gtfs') and mhd.get('zdroj') else '',
}
app = re.sub(r'\{\{(\w+)\}\}', lambda m: fill[m.group(1)], open('web/app.html', encoding='utf-8').read())
og = f'''<meta property="og:image" content="{SITE_URL}/og.jpg">
<meta property="og:url" content="{SITE_URL}/">
<link rel="canonical" href="{SITE_URL}/">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="{SITE_URL}/og.jpg">
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

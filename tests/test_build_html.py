"""Run after build_html.py: python tests/test_build_html.py"""
import json
import re

page = open('site/index.html', encoding='utf-8').read()
config = json.load(open('mesto.json', encoding='utf-8'))
assert '{{' not in page, 'unfilled placeholder in index.html'
has_mhd = bool((config.get('mhd') or {}).get('gtfs'))
assert f"if ({'true' if has_mhd else 'false'}) fetch('mhd.json'" in page

has_wind = bool(config.get('vitr'))
assert f"if ({'true' if has_wind else 'false'} || {'true' if config.get('pocasi') else 'false'}) {{ loadWind();" in page
assert ('vítr © ' in page) == has_wind
has_weather = bool(config.get('pocasi'))
assert f"if ({'true' if has_weather else 'false'}) {{ realWeather = wmoWeather" in page
assert ('počasí' in page.split('Open-Meteo')[0][-200:]) == has_weather

headers = open('site/_headers').read()
for prefix in ('/tiles/*', '/preview/*'):
    assert re.search(re.escape(prefix) + r'\n  Cache-Control: public, max-age=31536000, immutable', headers)
assert '/overlay' not in headers and '/index' not in headers, 'unversioned files must not be immutable'

source = config.get('zdrojovy_kod')
assert ('Zdrojový kód této mapy' in page) == bool(source) and (not source or source in page)

if config.get('url'):
    assert re.search(r'property="og:image" content="[^"]+/og\.jpg\?v=\w+"', page) and re.search(r'name="twitter:image" content="[^"]+/og\.jpg\?v=\w+"', page)

missing = open('site/404.html', encoding='utf-8').read()
assert 'noindex' in missing and 'href="/"' in missing and config['titulek'] in missing
train = config.get('vlak', 'regionova')
for name in ([train] if isinstance(train, str) else [train.get('vychozi', 'regionova'), *train.get('linky', {}).values()]):
    assert re.search(rf'\n    {name}: \{{ h:', page), f'unknown train model {name}'
print('ok')

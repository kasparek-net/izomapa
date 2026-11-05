"""Run after build_html.py: python tests/test_build_html.py"""
import json
import re

page = open('site/index.html', encoding='utf-8').read()
config = json.load(open('mesto.json', encoding='utf-8'))
assert '{{' not in page, 'unfilled placeholder in index.html'
has_mhd = bool((config.get('mhd') or {}).get('gtfs'))
assert f"if ({'true' if has_mhd else 'false'}) fetch('mhd.json'" in page

headers = open('site/_headers').read()
for prefix in ('/tiles/*', '/preview/*'):
    assert re.search(re.escape(prefix) + r'\n  Cache-Control: public, max-age=31536000, immutable', headers)
assert '/overlay' not in headers and '/index' not in headers, 'unversioned files must not be immutable'

missing = open('site/404.html', encoding='utf-8').read()
assert 'noindex' in missing and 'href="/"' in missing and config['titulek'] in missing
print('ok')

"""Ruční úpravy v assets odkazují jen na existující třídy povrchů a modely."""
import json, re, pathlib

R = pathlib.Path(__file__).resolve().parent.parent
prep = (R / 'prep.py').read_text()
classes = set(re.findall(r'(\w+)=\d+', prep[prep.index('C = dict('):prep.index('TW = int')]))
up = json.loads((R / 'assets/upresneni.json').read_text())
for pl in up.get('plochy', []):
    assert pl['k'] in classes, pl['k']
    assert len(pl['q']) >= 3
html = (R / 'render.html').read_text()
for d in json.loads((R / 'assets/dominanty.json').read_text()):
    m = d['spec'].get('model')
    if m == 'brana': assert "b.md === 'brana'" in html
    elif m: assert m == 'pavilon', m
palette = prep[prep.index("'summer': {"):prep.index("sp = dict(SEASON_PAL")]
for k in ('plaza', 'plaza2', 'deck'): assert f"'{k}'" in palette, k
print('upresneni ok')
dzi = (R / 'dzi.py').read_text()
assert 'for c in surfaces: p += list(c)' in dzi

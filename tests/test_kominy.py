"""python tests/test_kominy.py: stejný komín z OSM je jeden, plocha má přednost před bodem, chybějící výška má výchozí hodnotu."""
import sys
sys.path.insert(0, '.'); sys.path.insert(0, 'nastroje')
import kominy as k

v = k.vyber([
    {'lat': 49.6, 'lon': 18.0, 'tags': {'man_made': 'tower', 'tower:type': 'stack', 'height': '109'}},
    {'center': {'lat': 49.60003, 'lon': 18.0}, 'bounds': {'minlat': 49.59997, 'maxlat': 49.60009, 'minlon': 17.9999, 'maxlon': 18.0001}, 'tags': {'man_made': 'chimney', 'height': '104 m'}},
    {'lat': 49.61, 'lon': 18.0, 'tags': {'man_made': 'chimney'}},
    {'center': {'lat': 49.62, 'lon': 18.0}, 'bounds': {'minlat': 49.6199, 'maxlat': 49.6201, 'minlon': 17.9998, 'maxlon': 18.0002}, 'tags': {'tower:type': 'cooling', 'height': 'x'}},
])
assert len(v) == 3
assert v[0]['h'] == 104 and v[0]['r'], 'plocha přebírá polohu i výšku'
assert [p for p in v if p['lat'] == 49.61][0]['h'] == k.VYCHOZI_H['komin']
assert [p for p in v if p['k'] == 'vez'][0]['h'] == k.VYCHOZI_H['vez']
print('ok')

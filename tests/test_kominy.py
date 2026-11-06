"""python tests/test_kominy.py: stejný komín z OSM je jeden, plocha má přednost před bodem, chybějící výška má výchozí hodnotu."""
import sys
sys.path.insert(0, '.'); sys.path.insert(0, 'nastroje')
import kominy as k

v = k.vyber([
    {'lat': 49.6, 'lon': 18.0, 'tags': {'man_made': 'tower', 'tower:type': 'stack', 'height': '109'}},
    {'bounds': {'minlat': 49.59997, 'maxlat': 49.60009, 'minlon': 17.9999, 'maxlon': 18.0001}, 'tags': {'man_made': 'chimney', 'height': '104 m'}},
    {'lat': 49.61, 'lon': 18.0, 'tags': {'man_made': 'chimney'}},
    {'center': {'lat': 49.62, 'lon': 18.0}, 'bounds': {'minlat': 49.6199, 'maxlat': 49.6201, 'minlon': 17.9998, 'maxlon': 18.0002}, 'tags': {'tower:type': 'cooling', 'height': 'x'}},
])
assert len(v) == 3
assert v[0]['h'] == 104 and v[0]['r'], 'plocha přebírá polohu i výšku'
assert [p for p in v if p['lat'] == 49.61][0]['h'] == k.VYCHOZI_H['komin']
assert [p for p in v if p['k'] == 'vez'][0]['h'] == k.VYCHOZI_H['vez']
t = k.vyber([{'lat': 49.0, 'lon': 18.0, 'tags': {'man_made': 'mast', 'tower:type': 'communication', 'height': '42'}},
             {'bounds': {'minlat': 49.01, 'maxlat': 49.0101, 'minlon': 18.0, 'maxlon': 18.0002}, 'tags': {'man_made': 'storage_tank'}}])
assert {p['k'] for p in t} == {'stozar', 'nadrz'}
assert [p for p in t if p['k'] == 'nadrz'][0]['h'] == k.VYCHOZI_H['nadrz']
assert len(k.potrubi([{'geometry': [{'lat': 1, 'lon': 2}, {'lat': 1, 'lon': 3}], 'tags': {'location': 'underground'}},
                      {'geometry': [{'lat': 1, 'lon': 2}, {'lat': 1, 'lon': 3}], 'tags': {}}])) == 1
print('ok')

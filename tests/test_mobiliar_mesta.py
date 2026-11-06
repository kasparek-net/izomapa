"""python tests/test_mobiliar_mesta.py: třídění mobiliáře; neveřejná stanoviště odpadu a nestávající prvky se nepoužijí."""
import sys
sys.path.insert(0, 'nastroje')
import mobiliar_mesta as m

v = m.roztrid([{'lat': 1, 'lon': 1, 'typ': 'Lavičky, sedátka', 'stav': 'Stávající'}, {'lat': 1, 'lon': 1, 'typ': 'Lavičky, sedátka', 'stav': 'Stávající'},
               {'lat': 2, 'lon': 2, 'typ': 'Lavičky, sedátka', 'stav': 'Zrušeno'}, {'lat': 3, 'lon': 3, 'typ': 'Ostatní nábytek a vybavení', 'popis': 'Koš Tubo', 'stav': 'Stávající'},
               {'lat': 4, 'lon': 4, 'typ': 'Ostatní nábytek a vybavení', 'popis': 'ochranná mříž', 'stav': 'Stávající'}],
              [{'lat': 5, 'lon': 5}], [{'lat': 6, 'lon': 6, 'verej': 'A', 'separ': 'separovaný odpad'}, {'lat': 7, 'lon': 7, 'verej': 'N', 'separ': 'separovaný odpad'}])
assert v['bench'] == [(1, 1)]
assert v['bin'] == [(3, 3), (5, 5)]
assert v['recycling'] == [(6, 6)]
h = m.hriste('TYP\tWKT\nskluzavka\tMULTIPOINT(18.1 49.6)\nsloupek\tMULTIPOINT(18.2 49.7)\n')
assert h['skluzavka'] == [(49.6, 18.1)] and not h['branka']
p = m.pamatky([{'lat': 1, 'lon': 2, 'np': 'Socha – Žena'}, {'lat': 3, 'lon': 4, 'np': 'Pamětní deska – Socha'}, {'lat': 5, 'lon': 6, 'np': 'Kamenný kříž'}, {'lat': 7, 'lon': 8, 'np': 'Kostel'}])
assert p['plastika'] == [[1, 2]] and p['kriz'] == [[5, 6]] and not p['pomnik']
sys.path.insert(0, '.')
import geo, shapely, shapely.prepared
from shapely.geometry import LineString
pl = LineString([(0, 0), (100, 0)]).buffer(3); pp = shapely.prepared.prep(pl)
assert geo.mimo_vozovku(50, 10, pl, pp) == (50, 10)
x, y = geo.mimo_vozovku(50, 2, pl, pp, 0.5)
assert abs(x - 50) < 0.1 and abs(y - 3.5) < 0.1 and not pl.contains(shapely.Point(x, y))
print('ok')

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
print('ok')

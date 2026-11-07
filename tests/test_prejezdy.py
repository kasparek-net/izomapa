"""python tests/test_prejezdy.py: přejezd z OSM se přiřadí ke kusu silnice v metrech od jeho začátku."""
import sys
sys.path.insert(0, '.'); sys.path.insert(0, 'nastroje')
import prejezdy as p

kus = [[0, 0, 300], [100, 0, 301], [100, 50, 302]]
assert p.na_kusu(kus, [(40, 2)]) == [[40.0, 40.0, 0.0]], 'bod u silnice se promítne na ni'
assert p.na_kusu(kus, [(103, 20)]) == [[120.0, 100.0, 20.0]], 'druhý úsek počítá metry od začátku kusu'
assert p.na_kusu(kus, [(40, 20)]) == [], 'přejezd na jiné silnici dál než 6 m se nepřiřadí'
assert p.na_kusu(kus, [(40, 1), (41, -1)]) == [[40.0, 40.0, 0.0]], 'dva uzly jednoho přejezdu jsou jeden'
assert p.na_kusu(kus, [(200, 0), (10, 0)]) == [[10.0, 10.0, 0.0]]
assert p.na_kusu([[0, 0]], [(0, 0)]) == []
print('ok')

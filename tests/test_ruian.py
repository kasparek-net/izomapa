"""python tests/test_ruian.py: přiřazení objektu RÚIAN k budově."""
import sys
from shapely.geometry import box
sys.path.insert(0, '.'); sys.path.insert(0, 'nastroje')
import ruian as r

obj = [(box(0, 0, 10, 10), 7, 2), (box(20, 0, 30, 10), 19, None), (box(40, 0, 50, 10), 19, 3), (box(60, 0, 70, 10), 18, None)]
out = r.prirad({'dum': box(1, 1, 9, 9), 'jina': box(21, 1, 29, 9), 'podlazi': box(41, 1, 49, 9), 'mimo': box(100, 0, 110, 10),
                'okraj': box(8, 0, 18, 10), 'garaz': box(60, 0, 70, 10)}, obj)
assert out['dum'] == ['house', 2]
assert 'jina' not in out, 'jiná stavba bez podlaží nic neříká'
assert out['podlazi'] == [None, 3]
assert 'mimo' not in out
assert 'okraj' not in out, 'méně než polovina plochy'
assert out['garaz'] == ['garage', None]
assert r.trida(6) == 'apartments' and r.trida(20) is None
print('ok')

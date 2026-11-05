"""python tests/test_povrchy.py: zeleň z ortofota nesmí chytit stíny ani beton."""
import sys
import numpy as np
sys.path.insert(0, '.'); sys.path.insert(0, 'nastroje')
import povrchy as p

def px(rgb): return np.full((4, 4, 3), rgb, np.uint8)
g, l = p.green(px((90, 130, 70))); assert g.all() and l.all()              # tráva
g, l = p.green(px((150, 150, 150))); assert not g.any() and l.all()        # beton
g, l = p.green(px((20, 28, 18))); assert not g.any() and not l.any()       # stín se nepočítá
g, l = p.green(px((170, 80, 60))); assert not g.any()                      # červená střecha
print('ok')

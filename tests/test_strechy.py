"""python tests/test_strechy.py: barva střechy bez korun stromů a stínů."""
import sys
import numpy as np
sys.path.insert(0, '.'); sys.path.insert(0, 'nastroje')
import strechy as s

rng = np.random.default_rng(1)
def px(rgb, n): return np.clip(np.array(rgb) + rng.integers(-3, 4, (n, 3)), 0, 255).astype(np.uint8)
red, grey, tree, shadow = (170, 80, 60), (150, 150, 150), (60, 95, 50), (40, 40, 45)
assert abs(s.roof_color(px(red, 400))[0] - 170) < 6
c = s.roof_color(np.vstack([px(grey, 170), px(shadow, 230)]))         # stín přes půlku střechy ji nesmí ztmavit
assert c[0] > 135, c
c = s.roof_color(np.vstack([px(red, 300), px(tree, 100)]))            # koruna přes roh střechy
assert c[0] > 150 and c[1] < 100, c
assert s.roof_color(px(tree, 400)) is None                            # samá koruna: barvu neznáme
assert s.roof_color(np.vstack([px(tree, 300), px(red, 60)])) is None
assert s.roof_color(px(shadow, 5)) is None or len(px(shadow, 5)) < 10
res = {str(i): [150 + i % 3, 140 + i % 3, 125 + i % 3] for i in range(30)}; res['r'] = [170, 80, 60]
out = s.tone(res)
assert abs(out['0'][0] - out['0'][2]) < 6, out['0']                   # teplý nádech snímku zmizí
assert out['r'][0] - out['r'][1] > 95, out['r']                 # barevná střecha zesílí
print('ok')

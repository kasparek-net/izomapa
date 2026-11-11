"""python tests/test_kruhace.py: ring pieces of a roundabout and the entries that yield to it."""
import math, sys
sys.path.insert(0, '.'); sys.path.insert(0, 'nastroje')
from shapely.geometry import LinearRing
import kruhace as k

R = 15
pts = [(100 + R * math.cos(2 * math.pi * i / 16), 50 + R * math.sin(2 * math.pi * i / 16)) for i in range(16)]
ring = LinearRing(pts)
arc = {'p': [[x, y, 300] for x, y in pts[0:5]]}
leg_in = {'p': [[100 + R + 80, 50, 300], [100 + R, 50, 300]]}
leg_out = {'p': [[100, 50 + R, 300], [100, 50 + R + 40, 300]]}
far = {'p': [[0, 0, 300], [10, 0, 300]]}
g = k.oznac([arc, leg_in, leg_out, far], [ring])
cx, cy, r = arc['rb']
assert abs(cx - 100) < 0.5 and abs(cy - 50) < 0.5 and abs(r - R) < 0.5, 'ring piece carries the ring centre and radius'
assert 'y' not in arc, 'the ring itself does not yield'
assert leg_in['y'] == [[80.0, cx, cy, r]], 'entry yields at its end on the ring'
assert leg_out['y'] == [[0.0, cx, cy, r]], 'leg starting on the ring yields when driven towards it'
assert 'y' not in far and 'rb' not in far
assert k.oznac([far], []) == [far]
print('ok')

"""Run after overlay.py from the build folder: python tests/test_jednosmerky.py"""
import glob, json, math
import shapely
from shapely.geometry import LineString, Point
from shapely.ops import polygonize, unary_union

roads = [r for f in glob.glob('site/overlay/*.json') for r in json.load(open(f))['roads']]
assert all(r.get('o') in (None, 1, -1) for r in roads)
oneway = [r for r in roads if r.get('o') and r['c'] != 'service']
assert oneway, 'no one-way roads in overlay'
short = [LineString(r['w']) for r in roads if r['c'] != 'service' and LineString(r['w']).length < 60]
rings = [shapely.geometry.polygon.orient(p, 1.0).exterior for p in polygonize(unary_union(short))
         if p.length < 250 and 4 * math.pi * p.area / p.length ** 2 > 0.85 and len(p.exterior.coords) >= 8]
on_ring = 0
for r in oneway:
    l = LineString(r['w'])
    for ring in rings:
        if ring.distance(Point(l.coords[0])) < 1 and ring.distance(Point(l.coords[-1])) < 1 and ring.distance(l.interpolate(0.5, normalized=True)) < 1:
            a, b = ring.project(l.interpolate(0.25, normalized=True)), ring.project(l.interpolate(0.75, normalized=True))
            assert (1 if b >= a else -1) == r['o'], ('clockwise roundabout piece', r['w'][0])
            on_ring += 1
assert on_ring, 'no roundabout pieces found'
print('one-way pieces', len(oneway), 'roundabouts', len(rings), 'checked on rings', on_ring)

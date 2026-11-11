"""Roundabouts for the car animation: ring pieces and the entries that must yield to traffic on the ring."""
import math
from shapely.geometry import LineString, Point, Polygon


def ring_info(ring):
    c = Polygon(ring).centroid
    return [round(c.x, 1), round(c.y, 1), round(ring.length / (2 * math.pi), 1)]


def oznac(graph, rings):
    """ring pieces get 'rb' [cx, cy, R]; a piece with an end on a ring gets 'y' [[metres from its start, cx, cy, R]]"""
    infos = [ring_info(r) for r in rings]
    for g in graph:
        p = g['p']
        if len(p) < 2: continue
        line = LineString([(q[0], q[1]) for q in p])
        mid = line.interpolate(0.5, normalized=True)
        for ring, info in zip(rings, infos):
            if line.length < 60 and ring.distance(mid) < 0.5 and ring.distance(Point(p[0][:2])) < 0.5 and ring.distance(Point(p[-1][:2])) < 0.5:
                g['rb'] = info
                break
            if ring.distance(mid) < 1.0: continue
            y = [[0.0] + info] if ring.distance(Point(p[0][:2])) < 1.0 else []
            if ring.distance(Point(p[-1][:2])) < 1.0: y.append([round(line.length, 1)] + info)
            if y: g.setdefault('y', []).extend(y)
    return graph

"""Autobusové trasy z GTFS na silnici (z Liberce, 25. 11. 2026).

Tvary tras dopravce vedou k zastávce do zálivu nebo na chodník a často jedou kousek vedle osy silnice; prohlížeč autobus
posouvá o pruh doprava sám, takže pak stál a jezdil po chodníku nebo v trávě. Tři kroky (mhd.py je pouští jen na autobusy):
  konce   začátek a konec trasy (konečná na chodníku, do 80 m od silnice) na nejbližší bod trasy na silnici,
  k_ose   body 1,5–6 m od osy silnice na osu,
  zkratky rovné úseky přes trávu (dál než 4 m od osy) po silnicích, když objížďka není o víc než 30 % delší.
"""
import numpy as np
import shapely
import shapely.ops


class Silnice:
    def __init__(self, cary, trasa=None):
        """cary: osy sjízdných silnic (shapely LineString), trasa(a, b) -> body cesty po silnicích z bodu a do b, nebo None"""
        self.cary, self.strom, self.trasa = cary, shapely.STRtree(cary), trasa

    def od_osy(self, P):
        (i, _), d = self.strom.query_nearest(P, return_distance=True); out = np.full(len(P), 1e9); np.minimum.at(out, i, d)
        return out

    def konce(self, w, mez=7.0, pahyl=80.0):
        for _ in range(2):
            d = self.od_osy(shapely.points(np.array(w)))
            k = next((i for i in range(len(w)) if d[i] <= mez), None)
            if k and k < len(w) - 1 and shapely.LineString(w[:k + 1]).length <= pahyl:
                L = shapely.LineString(w[k:]); s = L.project(shapely.Point(w[0]))
                w = [list(L.interpolate(s).coords[0])] + [list(q) for q in shapely.ops.substring(L, s, L.length).coords][1:] if 0 < s < L.length else [list(q) for q in w[k:]]
            w = w[::-1]                                        # druhé kolo: konec trasy
        return w

    def k_ose(self, w, od=1.5, mez=6.0):
        P = shapely.points(np.array(w)); (pi, ti), d = self.strom.query_nearest(P, return_distance=True); hotovo = set()
        for a, b, dd in zip(pi, ti, d):
            if a in hotovo: continue
            hotovo.add(a)
            if od < dd <= mez: q = self.cary[b].interpolate(self.cary[b].project(P[a])); w[a] = [q.x, q.y]
        return w

    def zkratky(self, w, mez=4.0, beh=4.0, krok=4.0):
        if not self.trasa: return w
        L = shapely.LineString(w)
        if L.length < 20: return w
        n = int(L.length // krok) + 1; ss = np.linspace(0, L.length, n); P = shapely.line_interpolate_point(L, ss)
        off = self.od_osy(P) > mez; out, i, pos = [], 0, 0.0
        while i < n:
            if not off[i]: i += 1; continue
            j = i
            while j < n and off[j]: j += 1
            if (j - i) * krok < beh: i = j; continue
            a, b = max(0, i - 3), min(n - 1, j + 2)            # kousek před a za, ať se cesta napojí na silnici
            r = self.trasa(P[a].coords[0], P[b].coords[0])
            if r and len(r) > 1 and shapely.LineString([P[a].coords[0]] + list(r)).length <= 1.3 * (ss[b] - ss[a]) + 30:
                out += list(shapely.ops.substring(L, pos, ss[a]).coords) if ss[a] > pos else []
                out += [P[a].coords[0]] + [tuple(q) for q in r]; pos = ss[b]
            i = j
        if not out: return w
        out += list(shapely.ops.substring(L, pos, L.length).coords)
        return [list(q) for q in out]

    def uprav(self, w):
        return self.zkratky(self.k_ose(self.konce([list(q) for q in w])))


def ze_segmentu(parquet):
    """Silnice z Overture segmentů (jen sjízdné třídy jako road_route.py) s trasou po grafu road_route.Graph"""
    import road_route
    G = road_route.Graph(parquet)
    cary = [shapely.LineString([G.xy[a], G.xy[b]]) for a in range(len(G.adj)) for b, _ in G.adj[a] if a < b]

    def trasa(a, b):
        na, nb = G.snap(a), G.snap(b)
        if na is None or nb is None: return None
        r = G.leg(na, nb)
        return None if r is None else [G.xy[na]] + r + [tuple(b)]
    return Silnice(cary, trasa)

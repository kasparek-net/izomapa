"""Doplnění chybějících časů mezizastávek GTFS mezi známými časy."""

def dopln_mezicasy(rows):
    """Seřazené (pořadí, příjezd, odjezd, vzdálenost, stop_id); bez extrapolace konců."""
    rows = sorted(rows)
    znamy = [i for i, r in enumerate(rows) if r[1] is not None]
    if len(znamy) < 2:
        return [r for r in rows if r[1] is not None]
    out = list(rows)
    for a, b in zip(znamy, znamy[1:]):
        start, end = rows[a][2], rows[b][1]
        for i in range(a + 1, b):
            q, _, _, dist, stop = rows[i]
            f = (i - a) / (b - a)
            t = round(start + (end - start) * f)
            d0, d1 = rows[a][3], rows[b][3]
            if d1 > d0 and not d0 < dist < d1: dist = d0 + (d1 - d0) * f
            out[i] = (q, t, t, dist, stop)
    return [r for r in out if r[1] is not None]


def cekani_na_konecne(spoje, druh, okno=1800):
    """Ke každému spoji připíše q[7] = kolik sekund před odjezdem už vůz stojí na první zastávce.
    Spoj [linka, tvar, služba, t0, ..., ..., zastávky [jméno, čas, ...]]: dojezd jiného spoje téže služby a druhu vozidla
    do zastávky stejného jména nejvýš okno sekund před odjezdem se spáruje s nejbližším odjezdem (nejstarší dojezd první).
    Vlaky (druh 2) nečekají. Vrací počet spárovaných spojů."""
    from collections import defaultdict, deque
    doj, odj = defaultdict(list), defaultdict(list)
    for q in spoje:
        q.append(0)
        k = druh(q)
        if k == 2 or len(q[6]) < 4: continue
        doj[(q[2], k, q[6][-2])].append(q[3] + q[6][-1])
        odj[(q[2], k, q[6][0])].append(q)
    n = 0
    for key, ds in odj.items():
        a = deque(sorted(doj.get(key, [])))
        for q in sorted(ds, key=lambda q: q[3]):
            while a and a[0] < q[3] - okno: a.popleft()               # dojel dávno: odjel jinam nebo do vozovny
            if a and a[0] <= q[3]:
                q[7] = q[3] - a.popleft(); n += 1
    return n

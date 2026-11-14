"""Run after overlay.py from the build folder: python tests/test_zastaveni.py
Přejezdy (j) na kusu silnice jsou v metrech od začátku toho kusu, i když prep.py kus rozdělil."""
import glob, json, math

roads = [r for f in glob.glob('site/overlay/*.json') for r in json.load(open(f))['roads']]
assert roads, 'no roads in overlay'


def at(w, s):
    acc = 0.0
    for a, b in zip(w, w[1:]):
        d = math.dist(a[:2], b[:2])
        if acc + d >= s:
            t = (s - acc) / (d or 1)
            return a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
        acc += d
    return w[-1][:2]


n = 0
for r in roads:
    L = sum(math.dist(a[:2], b[:2]) for a, b in zip(r['w'], r['w'][1:]))
    for z in r.get('j', []):
        n += 1
        assert -0.5 <= z[0] <= L + 0.5, f'stop at {z[0]} m on a {L:.1f} m piece'
    for s, x, y in r.get('j', []):
        assert math.dist(at(r['w'], s), (x, y)) < 1.5, 'crossing position does not match its distance along the piece'
print('stops checked', n)

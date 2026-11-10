"""Oficiální jízdní řády autobusů a vlaků CIS JŘ (NeTEx, Ministerstvo dopravy) -> build/gtfs.zip jen pro tuto mapu, zpracuje ho mhd.py.

python nastroje/mhd_cisjr.py [--stahnout]        (v mesto.json: "mhd": {"gtfs": "build/gtfs.zip", ...})

NeTEx nemá polohy zastávek ani trasy. Polohy jsou z OSM (data_all/infrastructure.parquet, párování podle názvu), trasa mezi
zastávkami je nejkratší cesta po silnicích nebo tratích z Overture s preferencí hlavních silnic. Jednosměrky se neřeší, je to tedy odhad.
Vlak má jeden soubor na každou variantu kalendáře: pro každý den platí nejnovější soubor. Spoje s náhradní dopravou na mapě se vynechají, náhradní autobusy se nekreslí.
Spoj se ořízne na úseky se zastávkami uvnitř mapy. Spoje na objednání se vynechají.
"""
import csv, datetime, glob, heapq, io, os, pickle, re, subprocess, sys, zipfile
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict

PORTAL = 'https://portal.cisjr.cz/pub/netex/'
URL = PORTAL + 'NeTEx_VerejnaLinkovaDoprava.zip'
SRC = 'build/netex/NeTEx_VerejnaLinkovaDoprava.zip'
RAIL_DIR = 'build/netex/draha'
RAIL_CACHE = 'build/netex/vlaky.pickle'
OUT = 'build/gtfs.zip'
NS = '{http://www.netex.org.uk/netex}'
ROAD_COST = {'motorway': 1, 'trunk': 1, 'primary': 1, 'secondary': 1, 'tertiary': 1.05, 'unclassified': 1.3,
             'residential': 1.4, 'living_street': 2, 'service': 2.5}
SNAP = {3: 90.0, 2: 200.0}
BUS, RAIL = 3, 2
MAX_DETOUR = 3.0                  # delší objížďka znamená, že spojení po mapě nevede: spoj se v tom místě rozdělí
ABBR = {'autobusovénádraží': 'autnádr', 'náměstí': 'nám', 'rozcestí': 'rozc', 'kulturnídům': 'kultdům', 'restaurace': 'rest'}


def stop_key(name):
    """porovnatelný název zastávky: bez mezer, teček a zdvojených čárek"""
    k = re.sub(r'[\s.]', '', re.sub(r',[,\s]*', ',', name)).casefold()
    for a, b in ABBR.items(): k = k.replace(a, b)
    return k


def stop_label(name):
    """název pro lidi: Kopřivnice,,Čs.armády -> Kopřivnice, Čs.armády"""
    return re.sub(r'\s*,[,\s]*', ', ', name).strip()


def line_label(code):
    """ODIS: 883653 je na zastávkách linka 653"""
    return code[3:] if re.fullmatch(r'88\d{4}', code) else code


def inside_runs(flags):
    """indexy souvislých úseků zastávek uvnitř mapy, aspoň dvě zastávky"""
    out, cur = [], []
    for i, f in enumerate(flags):
        if f: cur.append(i)
        else:
            if len(cur) > 1: out.append(cur)
            cur = []
    if len(cur) > 1: out.append(cur)
    return out


def clip_bits(start, bits, first, last):
    """vynuluje dny provozu mimo first <= den < last (last None = bez konce)"""
    out = []
    for i, b in enumerate(bits):
        d = start + datetime.timedelta(days=i)
        out.append(b if d >= first and (last is None or d < last) else '0')
    return ''.join(out)


def active_versions(versions):
    """verze jedné linky [(od, výluka, cokoli)] -> [(verze, platí do)]: novější verze nahrazuje starší, se stejným začátkem vyhrává výluková"""
    best = {}
    for v in versions:
        if v[0] not in best or v[1] > best[v[0]][1]: best[v[0]] = v
    order = sorted(best)
    return [(best[d], order[i + 1] if i + 1 < len(order) else None) for i, d in enumerate(order)]


def drop_days(start, bits, ranges):
    """vynuluje dny v rozsazích [(od, do)] včetně krajů"""
    out = []
    for i, b in enumerate(bits):
        d = start + datetime.timedelta(days=i)
        out.append('0' if any(a <= d <= z for a, z in ranges) else b)
    return ''.join(out)


def latest_wins(variants):
    """varianty jednoho vlaku od nejstarší [(od, bity)]: den patří poslední variantě, která ho má; vrací upravené bity"""
    taken, out = set(), []
    for start, bits in reversed(variants):
        new = []
        for i, b in enumerate(bits):
            d = start + datetime.timedelta(days=i)
            new.append('1' if b == '1' and d not in taken else '0')
            if b == '1': taken.add(d)
        out.append(''.join(new))
    return out[::-1]


def to_calendar(start, bits):
    """dny provozu z bitů -> (po..ne, od, do, přidané, zrušené): vzor týdne podle většiny, zbytek jako výjimky"""
    days = [start + datetime.timedelta(days=i) for i, b in enumerate(bits) if b == '1']
    if not days: return None
    span = [start + datetime.timedelta(days=i) for i in range((days[-1] - start).days + 1) if start + datetime.timedelta(days=i) >= days[0]]
    on = set(days)
    week = []
    for wd in range(7):
        d = [x for x in span if x.weekday() == wd]
        week.append(1 if d and sum(x in on for x in d) * 2 > len(d) else 0)
    ymd = lambda x: int(x.strftime('%Y%m%d'))
    add = [ymd(x) for x in span if x in on and not week[x.weekday()]]
    rem = [ymd(x) for x in span if x not in on and week[x.weekday()]]
    return week, ymd(days[0]), ymd(days[-1]), add, rem


def shortest(adj, a, b):
    """Dijkstra: (cena, [uzly]) nebo None; adj[u] = [(v, cena, id hrany)]"""
    dist, prev, heap = {a: 0.0}, {}, [(0.0, a)]
    while heap:
        d, u = heapq.heappop(heap)
        if u == b:
            path = [b]
            while path[-1] != a: path.append(prev[path[-1]])
            return d, path[::-1]
        if d > dist[u]: continue
        for v, w, _ in adj.get(u, ()):
            if d + w < dist.get(v, 1e18):
                dist[v] = d + w; prev[v] = u; heapq.heappush(heap, (d + w, v))
    return None


class Net:
    """graf ze segmentů rozdělených v uzlech; zastávka se přichytí na nejbližší hranu"""

    def __init__(self, lines):
        import shapely
        self.shapely = shapely
        self.adj = defaultdict(list)
        self.ends = [(a, b) for a, b, _, _ in lines]
        self.lines = [l for _, _, l, _ in lines]
        self.costs = [c for _, _, _, c in lines]
        for i, (a, b, line, cost) in enumerate(lines):
            self.adj[a].append((b, line.length * cost, i)); self.adj[b].append((a, line.length * cost, i))
        self.tree = shapely.STRtree(self.lines)

    def snap(self, x, y, limit):
        p = self.shapely.Point(x, y)
        best = None
        for i in self.tree.query(p.buffer(limit)):
            d = self.lines[i].distance(p)
            if d <= limit and (best is None or d * self.costs[i] < best[0]): best = (d * self.costs[i], int(i))
        return (best[1], self.lines[best[1]].project(p)) if best else None

    def route(self, s, t):
        """trasa mezi přichycenými body: (souřadnice, délka) nebo None"""
        from shapely.ops import substring
        (ei, si), (ej, sj) = s, t
        if ei == ej:
            part = substring(self.lines[ei], si, sj)
            return (list(part.coords), part.length) if part.geom_type == 'LineString' else None
        (a0, a1), (b0, b1) = self.ends[ei], self.ends[ej]
        li, lj = self.lines[ei].length, self.lines[ej].length
        best = None
        for start, sl, sub_a in ((a0, si, (si, 0)), (a1, li - si, (si, li))):
            for end, el, sub_b in ((b0, sj, (0, sj)), (b1, lj - sj, (lj, sj))):
                r = shortest(self.adj, start, end)
                if r is None: continue
                cost = sl * self.costs[ei] + r[0] + el * self.costs[ej]
                if best is None or cost < best[0]: best = (cost, r[1], sub_a, sub_b)
        if best is None: return None
        _, path, sub_a, sub_b = best
        pts = list(substring(self.lines[ei], *sub_a).coords)
        for u, v in zip(path, path[1:]):
            i = min((e for n, _, e in self.adj[u] if n == v), key=lambda e: self.lines[e].length)
            c = list(self.lines[i].coords)
            if self.ends[i][0] != u: c.reverse()
            pts += c
        pts += list(substring(self.lines[ej], *sub_b).coords)
        clean = [pts[0]]
        for p in pts[1:]:
            if p != clean[-1]: clean.append(p)
        return (clean, self.shapely.LineString(clean).length) if len(clean) > 1 else None


def load_nets():
    import pyarrow.parquet as pq, shapely
    from shapely.ops import substring
    from geo import CHUNKS, chunk_of, to_local
    out = {BUS: [], RAIL: []}
    for r in pq.read_table('data_all/segment.parquet', columns=['subtype', 'class', 'connectors', 'geometry']).to_pylist():
        kind = RAIL if r['subtype'] == 'rail' and r['class'] == 'standard_gauge' else BUS if r['subtype'] == 'road' else None
        cost = 1 if kind == RAIL else ROAD_COST.get(r['class'])
        if kind is None or cost is None: continue
        g = shapely.from_wkb(r['geometry'])
        x, y = to_local(*zip(*g.coords))
        g = shapely.LineString(list(zip(map(float, x), map(float, y))))
        con = sorted(r['connectors'] or [], key=lambda c: c['at'])
        for c0, c1 in zip(con, con[1:]):
            part = substring(g, c0['at'], c1['at'], normalized=True)
            if part.geom_type != 'LineString' or part.length < 0.5: continue
            m = part.interpolate(0.5, normalized=True)
            if chunk_of(m.x, m.y) in CHUNKS: out[kind].append((c0['connector_id'], c1['connector_id'], part, cost))
    return {k: Net(v) for k, v in out.items()}


def load_stops(classes):
    """OSM: klíč názvu -> poloha uvnitř mapy (víc bodů téhož názvu = průměr, zastávky v obou směrech)"""
    import pyarrow.parquet as pq, shapely
    from geo import CHUNKS, chunk_of, to_local
    pts = defaultdict(list)
    for r in pq.read_table('data_all/infrastructure.parquet', columns=['subtype', 'class', 'names', 'geometry']).to_pylist():
        name = (r['names'] or {}).get('primary')
        if r['subtype'] != 'transit' or r['class'] not in classes or not name: continue
        c = shapely.from_wkb(r['geometry']).centroid
        x, y = to_local([c.x], [c.y])
        if chunk_of(float(x[0]), float(y[0])) in CHUNKS: pts[stop_key(name)].append((float(x[0]), float(y[0])))
    return {k: (sum(p[0] for p in v) / len(v), sum(p[1] for p in v) / len(v)) for k, v in pts.items()}


def sec(t, day=0):
    h, m, s = map(int, t.split(':'))
    return h * 3600 + m * 60 + s + int(day or 0) * 86400


def parse_line(xml):
    """jeden soubor linky -> (kód, od, výluka, [(číslo spoje, od, bity, [(název, příjezd, odjezd)])], zastávky s náhradní dopravou)"""
    root = ET.fromstring(xml)
    t = lambda e, n: e.findtext(NS + n)
    ref = lambda e, n: e.find(NS + n).get('ref')
    line = next(root.iter(NS + 'Line'))
    names = {e.get('id'): t(e, 'Name') for e in root.iter(NS + 'ScheduledStopPoint')}
    points = {e.get('id'): (int(e.get('order')), names[ref(e, 'ScheduledStopPointRef')]) for e in root.iter(NS + 'StopPointInJourneyPattern')}
    replaced = {names[ref(e, 'ScheduledStopPointRef')] for e in root.iter(NS + 'StopPointInJourneyPattern')
                if any(k.findtext(NS + 'Key') == 'CZAlternativeTransport' and k.findtext(NS + 'Value') == '1' for k in e.iter(NS + 'KeyValue'))}
    periods = {e.get('id'): (datetime.datetime.fromisoformat(t(e, 'FromDate')).date(), t(e, 'ValidDayBits')) for e in root.iter(NS + 'UicOperatingPeriod')}
    daytype = {}
    for e in root.iter(NS + 'DayTypeAssignment'):
        if t(e, 'isAvailable') != 'false': daytype[ref(e, 'DayTypeRef')] = ref(e, 'OperatingPeriodRef')
    trips = []
    for j in root.iter(NS + 'ServiceJourney'):
        if j.find(NS + 'FlexibleServiceProperties') is not None: continue
        for dt in j.find(NS + 'dayTypes'):
            start, bits = periods[daytype[dt.get('ref')]]
            seq = []
            for p in j.find(NS + 'passingTimes'):
                a, d = t(p, 'ArrivalTime'), t(p, 'DepartureTime')
                if not a and not d: continue                 # průjezd bez času v jízdním řádu
                order, nm = points[ref(p, 'StopPointInJourneyPatternRef')]
                seq.append((order, nm, sec(a or d, t(p, 'ArrivalDayOffset') if a else t(p, 'DepartureDayOffset')), sec(d or a, t(p, 'DepartureDayOffset') if d else t(p, 'ArrivalDayOffset'))))
            seq.sort()
            trips.append((j.get('id').rsplit(':', 1)[1], start, bits, [s[1:] for s in seq]))
    valid = datetime.datetime.fromisoformat(line.find(NS + 'ValidBetween').findtext(NS + 'FromDate')).date()
    detour = any(k.findtext(NS + 'Key') == 'JdfDetourTimetable' and k.findtext(NS + 'Value') == '1' for k in line.iter(NS + 'KeyValue'))
    return t(line, 'PublicCode'), valid, detour, trips, replaced


def download():
    os.makedirs(RAIL_DIR, exist_ok=True)
    subprocess.run(['curl', '-sSfL', '-m', '900', '-o', SRC + '.tmp', URL], check=True); os.replace(SRC + '.tmp', SRC)
    listing = subprocess.run(['curl', '-sSfL', '-m', '60', PORTAL], check=True, capture_output=True, text=True).stdout
    for name in sorted(set(re.findall(r'NeTEx_GVD[\w-]*\.zip', listing))):
        subprocess.run(['curl', '-sSfL', '-m', '900', '-o', f'{RAIL_DIR}/{name}.tmp', PORTAL + name], check=True)
        os.replace(f'{RAIL_DIR}/{name}.tmp', f'{RAIL_DIR}/{name}')
    if os.path.exists(RAIL_CACHE): os.remove(RAIL_CACHE)


def load_trains(stations, first):
    """vlaky přes stanice na mapě: [(číslo, číslo spoje, od, bity, zastávky)], pro každý den jen nejnovější soubor vlaku"""
    if os.path.exists(RAIL_CACHE):                     # rozbalení všech vlaků v republice trvá přes 10 minut
        by_number = pickle.load(open(RAIL_CACHE, 'rb'))
    else:
        files = []
        for path in sorted(glob.glob(f'{RAIL_DIR}/*.zip')):
            files += [(n[-12:-4], n, path) for n in zipfile.ZipFile(path).namelist()]
        files.sort()
        cache, marks, all_files = {}, [f'>{s}<'.encode() for s in stations], defaultdict(list)
        for _, n, path in files:
            raw = cache.setdefault(path, zipfile.ZipFile(path)).read(n)
            m = re.search(rb'<Line .*?<PublicCode>(\d+)', raw, re.S)
            if m: all_files[m[1].decode()].append((n, path, any(k in raw for k in marks)))
        by_number = {k: [cache[p].read(n) for n, p, _ in v] for k, v in all_files.items() if any(h for _, _, h in v)}
        pickle.dump(by_number, open(RAIL_CACHE, 'wb'))
    out = []
    for num, items in by_number.items():
        rows = []
        for raw in items:                               # i soubory bez stanic na mapě: novější verze může vlak odklonit nebo zkrátit
            _, _, _, trips, replaced = parse_line(raw)
            rows += [(t, replaced) for t in trips]
        cleaned = latest_wins([(t[1], t[2]) for t, _ in rows])
        for (t, replaced), bits in zip(rows, cleaned):
            out.append((num, t[0], t[1], clip_bits(t[1], bits, first, None), t[3], replaced))
    return out


def towns(mesto):
    """obce, jejichž linky se berou: mhd.obce v mesto.json, jinak jen název mapy"""
    return list((mesto.get('mhd') or {}).get('obce') or [mesto['nazev']])


def main():
    from geo import MESTO, to_lonlat
    obce = towns(MESTO)
    TOWNS = tuple(o.encode() for o in obce)              # rychlý výběr souborů linek: obce na mapě
    if '--stahnout' in sys.argv or not os.path.exists(SRC): download()
    today = datetime.date.today()
    osm = {BUS: load_stops(('bus_stop', 'bus_station', 'stop_position', 'platform')), RAIL: load_stops(('railway_station', 'railway_halt'))}
    nets = load_nets()
    z = zipfile.ZipFile(SRC)
    def pos(kind, name):                                # OSM občas vynechá obec: Vlčovice, U Kostela
        k = stop_key(name)
        return osm[kind].get(k) or osm[kind].get(k.split(',', 1)[-1])

    snaps, legs, shapes = {}, {}, {}
    trips, times, routes, services, seen, unmatched, xy = [], [], {}, {}, set(), Counter(), {}
    def leg(kind, a, b):
        if (kind, a, b) not in legs:
            sa, sb = [snaps.setdefault((kind, k), nets[kind].snap(*pos(kind, k), SNAP[kind])) for k in (a, b)]
            res = nets[kind].route(sa, sb) if sa and sb else None
            if res:
                pa, pb = pos(kind, a), pos(kind, b)
                air = ((pa[0] - pb[0]) ** 2 + (pa[1] - pb[1]) ** 2) ** 0.5
                if res[1] > max(air * MAX_DETOUR, air + 800): res = None
            legs[(kind, a, b)] = res
        return legs[(kind, a, b)]

    def add_trip(kind, code, label, num, start, bits, seq):
        head = stop_label(seq[-1][0])
        for s in seq:
            if pos(kind, s[0]) is None and stop_key(s[0]).startswith(tuple(o.lower() for o in obce)): unmatched[s[0]] += 1
        seq = [s for s in seq if pos(kind, s[0])]       # zastávka bez polohy: spoj jede dál bez ní (mimo mapu vypadne celá)
        if len(seq) < 2: return
        parts, cur = [], [seq[0]]
        for a, b in zip(seq, seq[1:]):
            if a[2] <= b[1] and leg(kind, a[0], b[0]): cur.append(b)
            else: parts.append(cur); cur = [b]
        parts.append(cur)
        for m, part in enumerate(parts):
            if len(part) < 2: continue
            key = (label, tuple(part), start, bits)
            if key in seen: continue                     # stejný spoj ve dvou verzích linky
            seen.add(key)
            ids = (kind,) + tuple(s[0] for s in part)
            sid = shapes.setdefault(ids, f'SH{len(shapes)}')
            svc = services.setdefault((start, bits), f'S{len(services)}')
            tid = f'{code}_{num}_{start:%Y%m%d}_{len(trips)}'
            routes[code] = (label, kind)
            trips.append((code, svc, tid, head, sid))
            dist = 0.0
            for k, (nm, a, d) in enumerate(part):
                if k: dist += leg(kind, part[k - 1][0], nm)[1]
                times.append((tid, a, d, stop_key(nm), k + 1, round(dist, 1), stop_label(nm)))
                xy.setdefault(stop_key(nm), pos(kind, nm))

    versions = defaultdict(list)
    for fn in z.namelist():
        raw = z.read(fn)
        if not any(k in raw for k in TOWNS): continue
        code, valid, detour, line_trips, _ = parse_line(raw)
        versions[code].append((valid, detour, line_trips))
    first = today - datetime.timedelta(days=1)            # včerejší spoje mohou jet přes půlnoc
    current = [(code, valid, until, trip) for code, vers in versions.items() for (valid, _, trips_), until in active_versions(vers) for trip in trips_]
    for code, valid, until, (num, start, bits, seq) in current:
        bits = clip_bits(start, bits, max(first, valid), until)
        if '1' in bits: add_trip(BUS, code, line_label(code), num, start, bits, seq)
    trains = load_trains(('Kopřivnice', 'Kopřivnice zastávka', 'Štramberk'), first)
    # CIS JŘ může výluku zveřejnit pozdě: mhd.vyluky_vlaku v mesto.json = [["2026-11-09", "2026-11-13"]], vlaky se v těch dnech nekreslí
    closed = [tuple(datetime.date.fromisoformat(x) for x in r) for r in (MESTO.get('mhd') or {}).get('vyluky_vlaku', [])]
    skipped = 0
    for code, num, start, bits, seq, replaced in trains:
        bits = drop_days(start, bits, closed)
        if '1' not in bits: continue
        if any(pos(RAIL, n) for n in replaced): skipped += 1; continue
        add_trip(RAIL, 'V' + code, code, num, start, bits, seq)

    shape_rows = []
    for ids, sid in shapes.items():
        pts = []
        for a, b in zip(ids[1:], ids[2:]):
            c = leg(ids[0], a, b)[0]
            pts += c[1:] if pts and pts[-1] == c[0] else c
        lon, lat = to_lonlat([p[0] for p in pts], [p[1] for p in pts])
        dist = 0.0
        for n in range(len(pts)):
            if n: dist += ((pts[n][0] - pts[n - 1][0]) ** 2 + (pts[n][1] - pts[n - 1][1]) ** 2) ** 0.5
            shape_rows.append((sid, f'{float(lat[n]):.7f}', f'{float(lon[n]):.7f}', n + 1, round(dist, 1)))

    def table(rows, head):
        b = io.StringIO(); w = csv.writer(b, lineterminator='\n'); w.writerow(head); w.writerows(rows)
        return b.getvalue()
    hms = lambda s: f'{s // 3600:02d}:{s % 3600 // 60:02d}:{s % 60:02d}'
    cal_rows, date_rows = [], []
    for (start, bits), svc in services.items():
        week, a, b, add, rem = to_calendar(start, bits)
        cal_rows.append([svc, *week, a, b])
        date_rows += [(svc, d, 1) for d in add] + [(svc, d, 2) for d in rem]
    with zipfile.ZipFile(OUT + '.tmp', 'w', zipfile.ZIP_DEFLATED) as o:
        o.writestr('routes.txt', table([(k, v[0], v[1]) for k, v in routes.items()], ['route_id', 'route_short_name', 'route_type']))
        o.writestr('trips.txt', table(trips, ['route_id', 'service_id', 'trip_id', 'trip_headsign', 'shape_id']))
        o.writestr('shapes.txt', table(shape_rows, ['shape_id', 'shape_pt_lat', 'shape_pt_lon', 'shape_pt_sequence', 'shape_dist_traveled']))
        ids = sorted({(r[3], r[6]) for r in times})       # poloha zastávky z OSM (prohlížeč podle ní ukáže odjezdy)
        lon, lat = to_lonlat([xy[k][0] for k, _ in ids], [xy[k][1] for k, _ in ids])
        o.writestr('stops.txt', table([(k, n, f'{float(la):.7f}', f'{float(lo):.7f}') for (k, n), la, lo in zip(ids, lat, lon)], ['stop_id', 'stop_name', 'stop_lat', 'stop_lon']))
        o.writestr('stop_times.txt', table([(a, hms(b), hms(c), d, e, f) for a, b, c, d, e, f, _ in times], ['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence', 'shape_dist_traveled']))
        o.writestr('calendar.txt', table(cal_rows, ['service_id', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'start_date', 'end_date']))
        o.writestr('calendar_dates.txt', table(date_rows, ['service_id', 'date', 'exception_type']))
        o.writestr('feed_info.txt', table([('CIS JŘ ' + fn.rsplit('_', 1)[1][:8],)], ['feed_version']))
    os.replace(OUT + '.tmp', OUT)
    print('linek', len(routes), 'spojů', len(trips), 'tras', len(shapes), 'služeb', len(services))
    print('linky', Counter(routes[t[0]][0] for t in trips if routes[t[0]][1] == BUS).most_common())
    print('vlaků', sum(1 for t in trips if routes[t[0]][1] == RAIL), 'čísel', sum(1 for v in routes.values() if v[1] == RAIL), 's náhradní dopravou vynecháno', skipped)
    if unmatched: print('v OSM chybí:', unmatched.most_common())
    bad = [k for k, v in snaps.items() if v is None]
    if bad: print('daleko od silnice:', bad)
    print('úseky bez trasy:', [k for k, v in legs.items() if v is None][:30])


if __name__ == '__main__':
    sys.path.insert(0, '.')
    main()

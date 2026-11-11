# Vybere z celostátního jízdního řádu (CZPTT XML, portal.cisjr.cz, soubor JR*.zip do build/vlaky/) osobní vlaky přes oblast mapy -> build/vlaky/vlaky.json
# Každý vlak: číslo, druh, dopravce, kalendář (bitmapa dnů), všechny body trasy s časy. Přidané změny během roku (PA_*.xml v měsíčních složkách) zatím nezapočítává.
import glob, json, re, zipfile, collections, sys
sys.path.insert(0, '.')
from geo import MESTO
import xml.etree.ElementTree as ET

Z = sys.argv[1] if len(sys.argv) > 1 else sorted(glob.glob('build/vlaky/JR*.zip'))[-1]
STANICE = MESTO.get('vlaky_stanice') or [MESTO['nazev']]   # části názvů stanic na mapě, např. ["Olomouc", "Velká Bystřice"]
HLEDAT = re.compile('|'.join(map(re.escape, STANICE)).encode())
JMENO = re.compile('|'.join(map(re.escape, STANICE)))


def cas(t):
    h, m, s = t.split('+')[0].split(':')
    return int(h) * 3600 + int(m) * 60 + float(s)


def vlak(x):
    r = ET.fromstring(x)
    i = r.find('CZPTTInformation')
    if i is None: return None
    cal = i.find('PlannedCalendar')
    body = []; druh = None; cislo = None; dop = None; typ = None
    for l in i.findall('CZPTTLocation'):
        loc = l.find('Location')
        nm = loc.findtext('PrimaryLocationName') if loc is not None else None
        kod = loc.findtext('LocationPrimaryCode') if loc is not None else None
        tt = {t.get('TimingQualifierCode'): (t.findtext('Time'), int(t.findtext('Offset') or 0)) for t in (l.find('TimingAtLocation').findall('Timing') if l.find('TimingAtLocation') is not None else [])}
        a = tt.get('ALA'); d = tt.get('ALD')
        akt = [t.findtext('.') for t in l.findall('TrainActivity/TrainActivityType')]
        if druh is None: druh = l.findtext('CommercialTrafficType')
        if cislo is None: cislo = l.findtext('OperationalTrainNumber')
        if typ is None: typ = l.findtext('TrafficType')
        if dop is None: dop = l.findtext('ResponsibleRU')
        p = l.findtext('CommercialTrafficType') or druh
        if a or d:
            ta = cas(a[0]) + a[1] * 86400 if a else None
            td = cas(d[0]) + d[1] * 86400 if d else None
            body.append([nm, kod, ta if ta is not None else td, td if td is not None else ta, 1 if '0001' in akt else 0])
    return {'cislo': cislo, 'druh': druh, 'typ': typ, 'dop': dop, 'bitmap': cal.findtext('BitmapDays') if cal is not None else '',
            'od': cal.findtext('ValidityPeriod/StartDateTime') if cal is not None else '', 'do': cal.findtext('ValidityPeriod/EndDateTime') if cal is not None else '', 'body': body}


z = zipfile.ZipFile(Z)
out = []; c = collections.Counter(); jmena = collections.Counter()
for n in z.namelist():
    b = z.read(n)
    if not HLEDAT.search(b): continue
    v = vlak(b)
    if not v: continue
    if not any(JMENO.match(q[0] or '') for q in v['body']): continue
    c[(v['typ'], v['druh'])] += 1
    for q in v['body']: jmena[q[0]] += 1
    out.append(v)
json.dump(out, open('build/vlaky/vlaky.json', 'w', encoding='utf-8'), ensure_ascii=False)
print(len(out), c.most_common(20))
print('dopravci', collections.Counter(v['dop'] for v in out).most_common(10))
print(jmena.most_common(45))

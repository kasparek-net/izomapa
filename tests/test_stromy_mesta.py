"""python tests/test_stromy_mesta.py: čtení stromů a trávníků z GML pasportu zeleně."""
import sys
sys.path.insert(0, 'nastroje')
import stromy_mesta as s

N = 'xmlns:ms="http://mapserver.gis.umn.edu/mapserver" xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:wfs="http://www.opengis.net/wfs/2.0"'
def strom(pos, druh, h): return f'<wfs:member><ms:x><ms:msGeometry><gml:Point><gml:pos>{pos}</gml:pos></gml:Point></ms:msGeometry><ms:druh_nazev>{druh}</ms:druh_nazev><ms:vyska_taxonu>{h}</ms:vyska_taxonu></ms:x></wfs:member>'
xml = f'<wfs:FeatureCollection {N}>' + strom('49.5 18.1', 'Soliterní stromy - jehličnaté', '13.00') + strom('49.6 18.2', 'Soliterní keře - listnaté', '') + strom('49.7 18.3', 'Soliterní stromy - listnaté', '900') + '</wfs:FeatureCollection>'
r = s.radky(xml)
assert r[0] == [49.5, 18.1, 13.0, 1, 0]
assert r[1] == [49.6, 18.2, s.VYCHOZI[(0, 1)], 0, 1], 'keř bez výšky'
assert r[2][2] == s.VYCHOZI[(0, 0)], 'nesmyslná výška'

def plocha(druh): return f'<wfs:member><ms:x><ms:druh_nazev>{druh}</ms:druh_nazev><ms:msGeometry><gml:Polygon><gml:exterior><gml:LinearRing><gml:posList>49.5 18.1 49.6 18.1 49.6 18.2 49.5 18.1</gml:posList></gml:LinearRing></gml:exterior></gml:Polygon></ms:msGeometry></ms:x></wfs:member>'
t, n = s.travniky(f'<wfs:FeatureCollection {N}>' + plocha('Parkový trávník') + plocha('Soukromá zeleň') + '</wfs:FeatureCollection>')
assert n == 2 and len(t) == 1 and t[0][1] == [49.6, 18.1]
print('ok')

"""Run after overlay.py from the build folder: python tests/test_scitani.py"""
import glob, json, sys

scit = json.load(open('build/scitani.json', encoding='utf-8'))
by = {s['usek']: s for s in scit}
assert by['7-2501']['sil'] == '480' and by['7-2501']['sv'] == 7760
assert by['7-2502']['sv'] == 10332 and by['7-5661']['sv'] == 8116 and by['7-2506']['sv'] == 14360
roads = [r for f in glob.glob('site/overlay/*.json') for r in json.load(open(f))['roads']]
main = [r for r in roads if r['c'] != 'service']
missing = [r for r in main if not r.get('v')]
assert not missing, len(missing)
assert not [r for r in roads if r['c'] == 'service' and r.get('v')]
vals = sorted({r['v'] for r in main})
assert 7760 in vals, vals
print('roads', len(main), 'values', vals)

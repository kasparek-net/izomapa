"""Stupně nočních světel: který se vybere v kterou hodinu. Spouští se z kořene repozitáře: python tests/test_svetla.py"""
import json
import re
import subprocess

app = open('web/app.html', encoding='utf-8').read()
fn = re.search(r'const lightStage = .*', app).group(0)
cases = {'út 03:00': (1, 3, 'lights_noc'), 'út 06:30': (1, 6.5, 'lights_prace'), 'út 17:00': (1, 17, 'lights_prace'),
         'út 20:00': (1, 20, 'lights'), 'út 23:30': (1, 23.5, 'lights_noc'), 'so 06:00': (5, 6, 'lights_noc'),
         'so 17:00': (5, 17, 'lights'), 'ne 22:59': (6, 22.98, 'lights')}
js = fn + f"\nconsole.log(JSON.stringify(Object.values({json.dumps(cases)}).map(([w, h]) => lightStage(w, h * 3600))));"
got = json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout)
for (name, (_, _, want)), g in zip(cases.items(), got):
    assert g == want, (name, g, want)

render = open('render.html', encoding='utf-8').read()
stages = re.search(r'const STAGE = \{ vecer: \[(.*?)\], prace: \[(.*?)\], noc: \[(.*?)\] \}', render).groups()
for s in stages:
    assert all(0 < float(v) < 1 for v in s.split(','))
print('ok')

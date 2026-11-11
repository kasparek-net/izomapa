"""Rychlý náhled celé mapy pro prohlížeč (site/preview/<sezóna>.webp + .json), zobrazí se dřív než dlaždice.

python preview.py   po přerenderování a dzi.py, před ./deploy.sh
"""
import json, os, subprocess, sys
from PIL import Image

os.makedirs('site/preview', exist_ok=True)
from concurrent.futures import ThreadPoolExecutor
VARIANTS = ['spring', 'summer', 'autumn', 'winter']
# skládání čtyř období běží souběžně (každé je samostatný proces)
with ThreadPoolExecutor(4) as ex:
    list(ex.map(lambda v: subprocess.run([sys.executable, 'compose.py', v, '16', f'site/preview/{v}.webp'], check=True, env={**os.environ, 'TRANSPARENT': '1'}), VARIANTS))
for v in VARIANTS:
    out = f'site/preview/{v}.webp'
    im = Image.open(out); m = json.load(open(f'site/preview/{v}.json'))
    w = 2400; h = round(im.height * w / im.width); k = im.width / w
    im.resize((w, h), Image.Resampling.BOX).save(out, 'WEBP', quality=82, method=6)
    m.update({'mpp': m['mpp'] * k, 'w': w, 'h': h}); json.dump(m, open(f'site/preview/{v}.json', 'w'))
    print(v, w, h, os.path.getsize(out) // 1000, 'kB')
summer = Image.open('site/preview/summer.webp').convert('RGBA')
og = Image.new('RGBA', (1200, 630), (27, 35, 51, 255))
summer.thumbnail((1200, 630), Image.Resampling.LANCZOS)
og.alpha_composite(summer, ((1200 - summer.width) // 2, (630 - summer.height) // 2))
og.convert('RGB').save('site/og.jpg', quality=85)

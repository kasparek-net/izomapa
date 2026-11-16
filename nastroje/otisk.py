# Otisk vstupů renderu jednoho čtverce: python nastroje/otisk.py 0,-1
# Když se otisk od posledního renderu nezměnil (build/.../otisk_renderu), render_ctverec.sh render a dlaždice přeskočí.
# Do otisku patří scéna a podklady čtverce z prep.py, kód, který z nich dělá dlaždice, rozlišení z mesto.json
# a schválené vlastní modely památek, které do čtverce zasahují (stejná vzdálenost jako pamatky/render_mapa.sh).
import glob, hashlib, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import geo

i, j = (int(v) for v in sys.argv[1].split(','))
d = 'build' if (i, j) == (0, 0) else f'build/c{i}_{j}'
soubory = ['render.html', 'render.mjs', 'dzi.py', 'assets/custom_models.js', f'{d}/scene.json', f'{d}/lightmap.png'] + sorted(glob.glob(f'{d}/ground_*.png'))
pam = []
if os.path.exists('pamatky/schvalene.json'):
    D = geo.HALF + geo.MARGIN + 120; cx, cy = geo.chunk_center((i, j))
    for s in sorted(json.load(open('pamatky/schvalene.json', encoding='utf-8'))):
        f = f'pamatky/{s}.json'
        if not os.path.exists(f): continue
        x, y = json.load(open(f, encoding='utf-8')).get('bod', [1e9, 1e9])[:2]
        if abs(x - cx) <= D and abs(y - cy) <= D: pam += [f, f'pamatky/{s}.js']
if pam: soubory += ['pamatky/_kit.js', 'pamatky/_drobne.js'] + pam
h = hashlib.sha256()
h.update(f'mpp={geo.MPP}'.encode())       # po změně "rozliseni" v mesto.json se kreslí všechny čtverce znovu
for f in soubory:
    h.update(f.encode())
    if os.path.exists(f):
        with open(f, 'rb') as fh:
            for blok in iter(lambda: fh.read(1 << 20), b''): h.update(blok)
print(h.hexdigest())

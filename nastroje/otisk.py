# Otisk vstupů renderu jednoho čtverce: python nastroje/otisk.py 0,-1
# Když se otisk od posledního renderu nezměnil (build/.../otisk_renderu), render_ctverec.sh render a dlaždice přeskočí.
# Do otisku patří scéna a podklady čtverce z prep.py a kód, který z nich dělá dlaždice.
import glob, hashlib, os, sys

i, j = (int(v) for v in sys.argv[1].split(','))
d = 'build' if (i, j) == (0, 0) else f'build/c{i}_{j}'
soubory = ['render.html', 'render.mjs', 'dzi.py', 'assets/custom_models.js', f'{d}/scene.json', f'{d}/lightmap.png'] + sorted(glob.glob(f'{d}/ground_*.png'))
h = hashlib.sha256()
for f in soubory:
    h.update(f.encode())
    if os.path.exists(f):
        with open(f, 'rb') as fh:
            for blok in iter(lambda: fh.read(1 << 20), b''): h.update(blok)
print(h.hexdigest())

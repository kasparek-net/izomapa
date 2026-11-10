"""Složí dlaždice z rendereru, sjednotí paletu a vytvoří Deep Zoom pyramidu pro každou variantu.

python dzi.py [varianty...]            čtverec (0, 0) -> site/tiles/<varianta>/...
python dzi.py --chunk 0,-1 [varianty]  další čtverec (průhledné pozadí) -> site/tiles/c0_-1/<varianta>/...
"""
import json, math, os, shutil, sys, time
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
TS = 2048           # velké dlaždice = málo souborů (artefakt má limit počtu souborů)
FMT = 'webp'        # bezztrátové WebP (o ~14 % menší než paletové PNG); 'png' pro starý formát
WORKERS = int(os.environ.get('IZO_DZI_VLAKNA', min(8, os.cpu_count() or 4)))   # souběžné kódování dlaždic


def save(im, path):
    if FMT == 'webp': im.convert('RGBA' if im.mode in ('P', 'RGBA', 'LA') else 'RGB').save(path[:-4] + '.webp', 'WEBP', lossless=True, quality=50, method=4, exact=False)   # u bezztrátového WebP je quality jen úsilí komprese: pixely stejné, poloviční čas, soubory o ~1 % větší
    else: im.save(path, optimize=True)
OUT = 'site/tiles'


def build(variant, chunk=None):
    src = f'build/tiles_{variant}' if not chunk else f'build/c{chunk[0]}_{chunk[1]}/tiles_{variant}'
    info = json.load(open(f'{src}/info.json'))
    # render.mjs si na začátku odloží značku a po poslední dlaždici ji smaže: když zůstala, render spadl uprostřed
    if os.path.exists(f'{src}/rozpracovano'): sys.exit(f'{src}: render neskončil (zůstala značka „rozpracovano“), dlaždice by byly směs starých a nových. Spusť render znovu.')
    T = info['tile']
    alpha = True        # všechny čtverce jsou průhledné vrstvy (skládají se podle hloubky, žádný není podklad)
    img = Image.new('RGBA' if alpha else 'RGB', (info['width'], info['height']), (0, 0, 0, 0) if alpha else (0, 0, 0))
    for j in range(info['rows']):
        for i in range(info['cols']):
            t = Image.open(f'{src}/{i}_{j}.png')
            img.paste(t.convert('RGBA' if alpha else 'RGB'), (i * T, j * T))
    if alpha: return build_alpha(variant, chunk, img, info)
    # jednotná paleta pro celou mapu; paleta se hledá na zmenšenině, pak se aplikuje na celek
    colors = 64 if variant.startswith('lights') else 160
    sample = img.resize((img.width // 3, img.height // 3), Image.Resampling.NEAREST)
    pal = sample.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    full = img.quantize(palette=pal, dither=Image.Dither.NONE)
    img = full.convert('RGB')
    d0 = f'{OUT}/{variant}'
    shutil.rmtree(d0, ignore_errors=True)
    W, H = img.size
    maxl = math.ceil(math.log2(max(W, H)))
    n = 0
    for lvl in range(maxl, -1, -1):
        s = 2 ** (maxl - lvl)
        w, h = max(1, math.ceil(W / s)), max(1, math.ceil(H / s))
        im = img if s == 1 else img.resize((w, h), Image.Resampling.BOX)
        d = f'{d0}/{lvl}'
        os.makedirs(d, exist_ok=True)
        for c in range(math.ceil(w / TS)):
            for r in range(math.ceil(h / TS)):
                t = im.crop((c * TS, r * TS, min(w, (c + 1) * TS), min(h, (r + 1) * TS)))
                if s == 1 and FMT != 'webp': t = t.quantize(palette=pal, dither=Image.Dither.NONE)
                save(t, f'{d}/{c}_{r}.png')
                n += 1
    size = sum(os.path.getsize(os.path.join(a, f)) for a, _, fs in os.walk(d0) for f in fs)
    print(variant, W, 'x', H, 'souborů', n, 'MB', round(size / 1e6, 1))
    return {'Image': {'xmlns': 'http://schemas.microsoft.com/deepzoom/2008', 'Url': f'tiles/{variant}/', 'Format': FMT,
                      'Overlap': '0', 'TileSize': str(TS), 'Size': {'Width': str(W), 'Height': str(H)}}}


# barvy vody (podzim/jaro/léto/zima, světlo a stín) – vždy v paletě, aby se malé vodní plochy neměnily na šedou
WATER = [(64, 124, 190), (92, 196, 230), (72, 132, 196), (186, 210, 228), (150, 168, 184), (58, 96, 136), (236, 240, 240)]


# modrošedé střechy (plech, panely): jsou vzácné a median cut je posouval k převládající zeleni do tyrkysové
ROOF_COOL = [(120, 135, 150), (102, 116, 131), (89, 107, 126), (70, 84, 100), (130, 136, 150)]
# tmavá višňová (vůz ve stínu haly, červené karoserie): median cut ji jinak sloučí s hnědou
DEEP_RED = [(120, 18, 26), (89, 13, 19)]
EXTRA = ROOF_COOL + DEEP_RED


# ruční povrchy (plaza, plaza2, deck) ve světle a stínu, léto a zima: vzácné barvy by median cut sloučil s béžovou.
# Mají sloty za paletou a dostanou je jen pixely přesně té barvy, ostatní barvy mapy se tak neposunou.
SURFACES = [(176, 176, 174), (120, 125, 139), (195, 195, 189), (133, 138, 151), (138, 98, 83), (94, 70, 66)]
SURFACES_WINTER = [(197, 201, 208), (134, 143, 166), (210, 214, 220), (143, 152, 176), (167, 151, 151), (114, 107, 121)]


def palette_with_water(sample, colors):
    q = sample.quantize(colors=colors - 1 - 3 * len(WATER + EXTRA), method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    p = q.getpalette()[:3 * (colors - 1 - 3 * len(WATER + EXTRA))]
    for r, g, b in WATER + EXTRA:
        for k in (1.0, 0.8, 0.66):         # stupně osvětlení terénu ve stínu
            p += [int(r * k), int(g * k), int(b * k)]
    im = Image.new('P', (1, 1)); im.putpalette(p + [0] * (768 - len(p)))
    return im


def quant_alpha(rgba, colors, pal=None, keep=()):
    """paletový PNG s jedním průhledným indexem (pixel art má jen plnou nebo žádnou průhlednost)"""
    a = rgba.getchannel('A').point(lambda v: 255 if v > 127 else 0)
    rgb = rgba.convert('RGB')
    q = rgb.quantize(palette=pal, dither=Image.Dither.NONE) if pal else \
        rgb.quantize(colors=colors - 1, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    p = q.getpalette()[:3 * (colors - 1)] + [0, 0, 0]
    for c in keep: p += list(c)
    q.putpalette(p + [0] * (768 - len(p)))
    q.paste(colors - 1, mask=a.point(lambda v: 255 - v))
    if keep:
        idx, px, op = np.array(q), np.array(rgb), np.array(a) > 0
        key = (px[..., 0].astype(np.uint32) << 16) | (px[..., 1].astype(np.uint32) << 8) | px[..., 2]   # barva jako jedno číslo: 14× rychlejší než porovnání po složkách
        for i, c in enumerate(keep): idx[(key == ((c[0] << 16) | (c[1] << 8) | c[2])) & op] = colors + i
        q = Image.fromarray(idx, 'P'); q.putpalette(p + [0] * (768 - len(p)))
    q.info['transparency'] = colors - 1
    return q


def build_alpha(variant, chunk, img, info):
    colors = 64 if variant.startswith('lights') else 225 + 3 * len(EXTRA)       # víc odstínů: zeleň stromů jinak bere sloty vzácným barvám střech a ploch
    sample = img.convert('RGB').resize((img.width // 3, img.height // 3), Image.Resampling.NEAREST)
    pal = palette_with_water(sample, colors) if not variant.startswith('lights') else sample.quantize(colors=colors - 1, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    keep = () if variant.startswith('lights') else SURFACES_WINTER if variant == 'winter' else SURFACES
    name = f'c{chunk[0]}_{chunk[1]}' if chunk else None
    d0 = f'{OUT}/{name}/{variant}' if name else f'{OUT}/{variant}'
    shutil.rmtree(d0, ignore_errors=True)
    W, H = img.size
    maxl = math.ceil(math.log2(max(W, H)))
    n = 0
    for lvl in range(maxl, -1, -1):
        s = 2 ** (maxl - lvl)
        w, h = max(1, math.ceil(W / s)), max(1, math.ceil(H / s))
        im = img if s == 1 else img.resize((w, h), Image.Resampling.BOX)
        d = f'{d0}/{lvl}'
        os.makedirs(d, exist_ok=True)
        # zmenšené úrovně bez vlastní palety: kvantizace zmenšeniny měnila vzácné barvy (bazény, voda) na šedou
        # bez palety i v plném rozlišení: vzácné barvy (malé vodní plochy) se v paletě čtverce měnily na šedou
        def one(cr, im=im, d=d, w=w, h=h):                                        # stejná paleta (s vodou) pro všechny úrovně
            c, r = cr
            save(quant_alpha(im.crop((c * TS, r * TS, min(w, (c + 1) * TS), min(h, (r + 1) * TS))), colors, pal, keep), f'{d}/{c}_{r}.png')
        jobs = [(c, r) for c in range(math.ceil(w / TS)) for r in range(math.ceil(h / TS))]
        with ThreadPoolExecutor(WORKERS) as ex: list(ex.map(one, jobs))           # Pillow při kódování pouští GIL; výstup je bajt po bajtu stejný
        n += len(jobs)
    size = sum(os.path.getsize(os.path.join(a, f)) for a, _, fs in os.walk(d0) for f in fs)
    print(name or 'c0_0', variant, W, 'x', H, 'souborů', n, 'MB', round(size / 1e6, 1))
    return {'Image': {'xmlns': 'http://schemas.microsoft.com/deepzoom/2008', 'Url': f'tiles/{name}/{variant}/' if name else f'tiles/{variant}/', 'Format': FMT,
                      'Overlap': '0', 'TileSize': str(TS), 'Size': {'Width': str(W), 'Height': str(H)}},
            'x0': info['x0'], 'y1': info['y1']}


if __name__ == '__main__':
    from geo import CHUNKS
    os.makedirs('site', exist_ok=True)
    path = 'site/tiles.json'
    args = sys.argv[1:]
    chunk = None
    if args[:1] == ['--chunk']:
        chunk = tuple(int(v) for v in args[1].split(',')); args = args[2:]
    variants = args or ['autumn', 'winter', 'spring', 'summer', 'lights'] + [v for v in ('lights_prace', 'lights_noc') if os.path.exists(f'build/tiles_{v}/info.json')]
    built = {v: build(v, chunk) if chunk else build(v) for v in variants}
    # souběžný render (render_par.sh): tiles.json se načte a zapíše až pod zámkem, ať si čtverce nepřepíšou záznamy.
    # Zámek je soubor vytvořený s O_EXCL (funguje i na Windows); po pádu jiného běhu se starý zámek po 2 minutách smaže.
    os.makedirs('build', exist_ok=True); lock = 'build/tiles_json.lock'; t0 = time.time()
    while True:
        try: fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY); break
        except FileExistsError:
            if time.time() - t0 > 120:
                try: os.remove(lock)
                except FileNotFoundError: pass
            time.sleep(0.2)
    try:
        out = json.load(open(path)) if os.path.exists(path) else {}
        if chunk:
            name = f'c{chunk[0]}_{chunk[1]}'
            ch = out.setdefault('chunks', {}).setdefault(name, {'chunk': list(chunk), 'status': CHUNKS[chunk]})
            ch['status'] = CHUNKS[chunk]; ch.update(built)
        else:
            info = json.load(open('build/tiles_autumn/info.json'))
            out['base'] = {'x0': info['x0'], 'y1': info['y1'], 'mpp': info['mpp'], 'status': CHUNKS[(0, 0)]}
            out.update(built)
        out['ver'] = time.strftime('%Y%m%d%H%M')              # verze dlaždic pro cache prohlížeče: mění se jen tady, když vzniknou nové dlaždice
        json.dump(out, open(path + '.tmp', 'w')); os.replace(path + '.tmp', path)
    finally:
        os.close(fd); os.remove(lock)

"""Check that site/ is complete before deploying: python nastroje/kontrola_webu.py [site]

Every Deep Zoom layer listed in tiles.json must have all its tiles, the viewer's other files must exist.
Exits with 1 and lists the problems when something is missing.
"""
import json
import math
import os
import sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else 'site'
MIN_BYTES = 12


def layers(node, name=''):
    if isinstance(node, dict):
        if 'Image' in node:
            yield name, node['Image']
        for key, value in node.items():
            if key != 'Image':
                yield from layers(value, f'{name}/{key}')
    elif isinstance(node, list):
        for i, value in enumerate(node):
            yield from layers(value, f'{name}/{i}')


def expected_tiles(image):
    width, height = int(image['Size']['Width']), int(image['Size']['Height'])
    size = int(image['TileSize'])
    top = math.ceil(math.log2(max(width, height)))
    for level in range(top + 1):
        scale = 2 ** (top - level)
        cols = math.ceil(math.ceil(width / scale) / size)
        rows = math.ceil(math.ceil(height / scale) / size)
        for col in range(cols):
            for row in range(rows):
                yield f"{image['Url']}{level}/{col}_{row}.{image['Format']}"


def bad_tile(path):
    if not os.path.exists(path):
        return 'missing'
    if os.path.getsize(path) < MIN_BYTES:
        return 'empty'
    with open(path, 'rb') as f:
        head = f.read(12)
    if path.endswith('.webp') and (head[:4] != b'RIFF' or head[8:12] != b'WEBP'):
        return 'not webp'
    return None


def check(root):
    problems, listed, count = [], set(), 0
    tiles = json.load(open(f'{root}/tiles.json', encoding='utf-8'))
    for name, image in layers(tiles):
        for rel in expected_tiles(image):
            count += 1
            listed.add(os.path.normpath(rel))
            why = bad_tile(os.path.join(root, rel))
            if why:
                problems.append(f'{name}: {rel} {why}')
    if not tiles.get('ver'):
        problems.append('tiles.json has no ver, so immutable caching would pin old tiles')
    for rel in ('index.html', '404.html', '_headers', 'og.jpg', 'overlay.json', 'search.json', 'robots.txt', 'sitemap.xml'):
        if not os.path.exists(os.path.join(root, rel)):
            problems.append(f'{rel} missing')
    for season in ('spring', 'summer', 'autumn', 'winter'):
        for ext in ('json', 'webp'):
            if not os.path.exists(f'{root}/preview/{season}.{ext}'):
                problems.append(f'preview/{season}.{ext} missing')
    for chunk in tiles.get('chunks') or []:
        key = chunk if isinstance(chunk, str) else chunk.get('key', '') if isinstance(chunk, dict) else ''
        if key and not os.path.exists(f'{root}/overlay/{key}.json'):
            problems.append(f'overlay/{key}.json missing')
    if os.path.exists(f'{root}/mhd.json'):
        mhd = json.load(open(f'{root}/mhd.json', encoding='utf-8'))
        if mhd.get('trips') and not mhd.get('stops'):
            problems.append('mhd.json has trips but no stops, so stop departures and stop search are missing (stops.txt without coordinates?)')
    extra = []
    for folder, _, files in os.walk(f'{root}/tiles'):
        for file in files:
            rel = os.path.normpath(os.path.relpath(os.path.join(folder, file), root))
            if rel not in listed:
                extra.append(rel)
    return problems, count, extra


if __name__ == '__main__':
    problems, count, extra = check(ROOT)
    files = sum(len(f) for _, _, f in os.walk(ROOT))
    print(f'{count} tiles expected, {len(extra)} unlisted, {files} files in {ROOT} (Pages Free limit 20000)')
    for line in extra[:10]:
        print('unlisted', line)
    for line in problems[:50]:
        print('PROBLEM', line)
    sys.exit(1 if problems or files > 20000 else 0)

"""python tests/test_kontrola_webu.py: the checker must catch a missing and a damaged tile."""
import json
import os
import sys
import tempfile

sys.path.insert(0, 'nastroje')
sys.argv = ['test']
import kontrola_webu as k

WEBP = b'RIFF\x10\x00\x00\x00WEBPVP8 '
image = {'Url': 'tiles/a/', 'Format': 'webp', 'TileSize': '2', 'Size': {'Width': '3', 'Height': '2'}}
paths = list(k.expected_tiles(image))
assert 'tiles/a/2/1_0.webp' in paths and 'tiles/a/0/0_0.webp' in paths and 'tiles/a/2/2_0.webp' not in paths

with tempfile.TemporaryDirectory() as root:
    json.dump({'ver': '1', 'a': {'Image': image}}, open(f'{root}/tiles.json', 'w'))
    for rel in ['index.html', '404.html', '_headers', 'og.jpg', 'overlay.json', 'search.json', 'robots.txt', 'sitemap.xml'] + [
            f'preview/{s}.{e}' for s in ('spring', 'summer', 'autumn', 'winter') for e in ('json', 'webp')]:
        os.makedirs(os.path.dirname(f'{root}/{rel}') or root, exist_ok=True)
        open(f'{root}/{rel}', 'w').close()
    for rel in paths:
        os.makedirs(os.path.dirname(f'{root}/{rel}'), exist_ok=True)
        open(f'{root}/{rel}', 'wb').write(WEBP)
    assert k.check(root)[0] == []
    os.remove(f'{root}/{paths[0]}')
    open(f'{root}/{paths[1]}', 'wb').write(b'x' * 20)
    found = ' '.join(k.check(root)[0])
    assert 'missing' in found and 'not webp' in found
print('ok')

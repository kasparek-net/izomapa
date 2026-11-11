import json, os, subprocess, sys, tempfile, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class TestSousedi(unittest.TestCase):
    def test_sousedi_parsing_and_normalization(self):
        sample_input = [
            {"nazev": "Liberec", "url": "https://izomapa.fun", "lat": 50.81000, "lon": 15.03000},
            {"name": "Chrastava", "href": "https://example.com/chrastava", "poloha": [50.82, 14.96], "text": "Na západ od Liberce"},
            {"nazev": "Hrádek", "url": "https://example.com/hradek", "pos": [50.85, 14.84], "target": "_blank"},
            {"invalid": True},  # missing name or url or coords
            {"nazev": "Bez Souradnic", "url": "https://example.com"}
        ]

        normalized = []
        for s in sample_input:
            if not isinstance(s, dict): continue
            name = s.get('nazev') or s.get('name')
            url = s.get('url') or s.get('href')
            if not name or not url: continue
            if 'lat' in s and 'lon' in s:
                lat, lon = float(s['lat']), float(s['lon'])
            elif 'poloha' in s and len(s['poloha']) >= 2:
                lat, lon = float(s['poloha'][0]), float(s['poloha'][1])
            elif 'pos' in s and len(s['pos']) >= 2:
                lat, lon = float(s['pos'][0]), float(s['pos'][1])
            else:
                continue
            text = s.get('text') or s.get('popis') or ''
            target = s.get('target', '_self')
            normalized.append({'name': name, 'url': url, 'lat': lat, 'lon': lon, 'text': text, 'target': target})

        self.assertEqual(len(normalized), 3)
        self.assertEqual(normalized[0]['name'], 'Liberec')
        self.assertEqual(normalized[0]['url'], 'https://izomapa.fun')
        self.assertEqual(normalized[0]['lat'], 50.81)
        self.assertEqual(normalized[0]['lon'], 15.03)
        self.assertEqual(normalized[0]['target'], '_self')

        self.assertEqual(normalized[1]['name'], 'Chrastava')
        self.assertEqual(normalized[1]['text'], 'Na západ od Liberce')

        self.assertEqual(normalized[2]['name'], 'Hrádek')
        self.assertEqual(normalized[2]['target'], '_blank')

    def test_app_html_contains_neighbor_components(self):
        html = (ROOT / 'web/app.html').read_text(encoding='utf-8')
        self.assertIn('.pin.neighbor', html)
        self.assertIn('.card-neighbor-btn', html)
        self.assertIn('for (const n of OV.neighbors || [])', html)
        self.assertIn("kind: 'soused'", html)
        self.assertIn("p.el.hidden = !shown(p.k)", html)
        self.assertIn("n.el.hidden = !shown(n.k)", html)
        self.assertIn("neighborHref", html)
        self.assertIn(",1`", html)

    def test_build_html_with_neighbors(self):
        with tempfile.TemporaryDirectory() as td:
            d = Path(td)
            (d / 'web').mkdir(); (d / 'site').mkdir(); (d / 'assets').mkdir()
            (d / 'web/app.html').write_text((ROOT / 'web/app.html').read_text(encoding='utf-8'), encoding='utf-8')
            m = json.loads((ROOT / 'priklady/mesto.json').read_text(encoding='utf-8'))
            m['sousedi'] = [{"nazev": "Liberec", "url": "https://izomapa.fun", "lat": 50.81, "lon": 15.03}]
            (d / 'mesto.json').write_text(json.dumps(m, ensure_ascii=False), encoding='utf-8')
            env = {**os.environ, 'PYTHONPATH': str(ROOT)}
            subprocess.run([sys.executable, str(ROOT / 'build_html.py')], cwd=d, env=env, check=True, capture_output=True)
            page = (d / 'site/index.html').read_text(encoding='utf-8')
            self.assertIn('.pin.neighbor', page)
            self.assertIn('for (const n of OV.neighbors || [])', page)


if __name__ == '__main__':
    unittest.main()

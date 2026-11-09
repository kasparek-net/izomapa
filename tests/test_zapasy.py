import json, os, subprocess, sys, tempfile, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class ZapasyTest(unittest.TestCase):
    def test_v_strance_a_zdroj(self):
        with tempfile.TemporaryDirectory() as td:
            d = Path(td)
            (d / 'web').mkdir(); (d / 'site').mkdir(); (d / 'assets').mkdir()
            (d / 'web/app.html').write_text((ROOT / 'web/app.html').read_text(encoding='utf-8'), encoding='utf-8')
            m = json.loads((ROOT / 'priklady/mesto.json').read_text(encoding='utf-8'))
            m['zapasy'] = {'mista': {'z': {'sport': 'hokej', 'cesty': [[[50, 15], [50.001, 15.001]]]}},
                           'rozpis': [{'misto': 'z', 'kdy': '2027-04-03T17:00', 'domaci': 'A', 'hoste': 'C'}, {'misto': 'z', 'kdy': '2026-12-02T18:00', 'domaci': 'A', 'hoste': 'B'}],
                           'zdroje': [{'nazev': 'Klub', 'url': 'https://example.org/'}]}
            (d / 'mesto.json').write_text(json.dumps(m, ensure_ascii=False), encoding='utf-8')
            env = {**os.environ, 'PYTHONPATH': str(ROOT)}
            subprocess.run([sys.executable, str(ROOT / 'build_html.py')], cwd=d, env=env, check=True, capture_output=True)
            html = (d / 'site/index.html').read_text(encoding='utf-8')
            self.assertIn('"t": 1796230800000', html)                    # 2. 12. 18:00 = 17:00 UTC (zimní čas)
            self.assertIn('"t": 1806764400000', html)                    # 3. 4. 17:00 = 15:00 UTC (letní čas)
            self.assertLess(html.index('1796230800000'), html.index('1806764400000'))   # seřazeno podle času
            self.assertIn('rozpis zápasů © <a href="https://example.org/"', html)
            self.assertNotIn('{{ZAPASY', html)


if __name__ == '__main__':
    unittest.main()

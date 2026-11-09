import json, os, subprocess, sys, tempfile, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def postav(trhy):
    with tempfile.TemporaryDirectory() as td:
        d = Path(td)
        (d / 'web').mkdir(); (d / 'site').mkdir(); (d / 'assets').mkdir()
        (d / 'web/app.html').write_text((ROOT / 'web/app.html').read_text(encoding='utf-8'), encoding='utf-8')
        m = json.loads((ROOT / 'priklady/mesto.json').read_text(encoding='utf-8'))
        if trhy: m['trhy'] = trhy
        (d / 'mesto.json').write_text(json.dumps(m, ensure_ascii=False), encoding='utf-8')
        env = {**os.environ, 'PYTHONPATH': str(ROOT)}
        subprocess.run([sys.executable, str(ROOT / 'build_html.py')], cwd=d, env=env, check=True, capture_output=True)
        return (d / 'site/index.html').read_text(encoding='utf-8')


class TrhyTest(unittest.TestCase):
    def test_dny_otevreni_a_zdroj(self):
        html = postav({'mista': {'n': {'rada': [[50, 15], [50.0002, 15.0005]], 'stanku': 6, 'sirka': 8}},
                       'akce': [{'misto': 'n', 'nazev': 'Advent', 'dny': ['2026-12-13', '2026-12-12'], 'od': '14:00', 'do': '18:00'},
                                {'misto': 'n', 'nazev': 'Jarmark', 'dny': ['2026-11-28']},
                                {'misto': 'n', 'nazev': 'Bez termínu', 'dny': []}],
                       'zdroje': [{'nazev': 'KD', 'url': 'https://example.org/'}]})
        self.assertIn('[1797080400000, ', html)                      # 12. 12. 14:00 = 13:00 UTC, dny seřazené
        self.assertIn(', 1797181200000]', html)                      # 13. 12. 18:00
        self.assertIn('[1795856400000, ', html)                      # výchozí otevření 10:00
        self.assertLess(html.index('"Jarmark"'), html.index('"Advent"'))   # akce seřazené podle prvního dne
        self.assertNotIn('Bez termínu', html)
        self.assertIn('termíny trhů © <a href="https://example.org/"', html)
        self.assertNotIn('{{TRHY', html)

    def test_bez_trhu(self):
        html = postav(None)
        self.assertIn('const TRHY = null', html)
        self.assertNotIn('termíny trhů', html)
        html = postav({'mista': {'n': {'rada': [[50, 15], [50.0002, 15.0005]]}}, 'akce': [], 'zdroje': [{'nazev': 'KD', 'url': 'https://example.org/'}]})
        self.assertNotIn('termíny trhů', html)                       # zdroj jen s nějakým termínem


if __name__ == '__main__':
    unittest.main()

import json, os, subprocess, sys, tempfile, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def postav(m):
    with tempfile.TemporaryDirectory() as td:
        d = Path(td)
        (d / 'web').mkdir(); (d / 'site').mkdir(); (d / 'assets').mkdir()
        (d / 'web/app.html').write_text((ROOT / 'web/app.html').read_text(encoding='utf-8'), encoding='utf-8')
        (d / 'mesto.json').write_text(json.dumps(m, ensure_ascii=False), encoding='utf-8')
        subprocess.run([sys.executable, str(ROOT / 'build_html.py')], cwd=d, env={**os.environ, 'PYTHONPATH': str(ROOT)}, check=True, capture_output=True)
        return (d / 'site/index.html').read_text(encoding='utf-8')


class SkolaTest(unittest.TestCase):
    def test_bez_nastaveni_deti_nechodi(self):
        m = json.loads((ROOT / 'priklady/mesto.json').read_text(encoding='utf-8'))
        self.assertIn('const SKOLA = null,', postav(m))

    def test_skolni_rok_v_strance(self):
        m = json.loads((ROOT / 'priklady/mesto.json').read_text(encoding='utf-8'))
        m['skola'] = {'rok': ['2026-09-01', '2027-06-30'], 'volno': [['2026-10-29', '2026-10-30']]}
        html = postav(m)
        self.assertIn('const SKOLA = {"rok": ["2026-09-01", "2027-06-30"], "volno": [["2026-10-29", "2026-10-30"]]},', html)


if __name__ == '__main__':
    unittest.main()

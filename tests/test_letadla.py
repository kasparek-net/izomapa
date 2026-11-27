import json, os, shutil, subprocess, sys, tempfile, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

class LetadlaTest(unittest.TestCase):
    def test_letadla_v_build_html(self):
        with tempfile.TemporaryDirectory() as td:
            d = Path(td)
            (d / 'web').mkdir(); (d / 'site').mkdir(); (d / 'assets').mkdir()
            shutil.copytree(ROOT / 'web', d / 'web', dirs_exist_ok=True, ignore=shutil.ignore_patterns('__pycache__'))   # šablona + css + js
            m = json.loads((ROOT / 'priklady/mesto.json').read_text(encoding='utf-8'))
            m['letadla'] = True
            (d / 'mesto.json').write_text(json.dumps(m, ensure_ascii=False), encoding='utf-8')
            env = {**os.environ, 'PYTHONPATH': str(ROOT)}
            subprocess.run([sys.executable, str(ROOT / 'build_html.py')], cwd=d, env=env, check=True, capture_output=True)
            html = (d / 'site/index.html').read_text(encoding='utf-8')
            self.assertIn('if (true) {', html)
            self.assertIn('adsb.lol</a> (ODbL)', html)

    def test_letadla_vypnuti(self):
        with tempfile.TemporaryDirectory() as td:
            d = Path(td)
            (d / 'web').mkdir(); (d / 'site').mkdir(); (d / 'assets').mkdir()
            shutil.copytree(ROOT / 'web', d / 'web', dirs_exist_ok=True, ignore=shutil.ignore_patterns('__pycache__'))   # šablona + css + js
            m = json.loads((ROOT / 'priklady/mesto.json').read_text(encoding='utf-8'))
            m['letadla'] = False
            (d / 'mesto.json').write_text(json.dumps(m, ensure_ascii=False), encoding='utf-8')
            env = {**os.environ, 'PYTHONPATH': str(ROOT)}
            subprocess.run([sys.executable, str(ROOT / 'build_html.py')], cwd=d, env=env, check=True, capture_output=True)
            html = (d / 'site/index.html').read_text(encoding='utf-8')
            self.assertIn('if (false) {', html)
            self.assertNotIn('letadla ©', html)

    def test_databaze_typu_letadel(self):
        js = (ROOT / 'web/js/87-letadla-typy.js').read_text(encoding='utf-8')
        kat = {}
        for radek in js.splitlines():
            r = radek.strip()
            if r.endswith('",') and ': "' in r:
                k, seznam = r.rstrip(',').split(': ', 1)
                for it in json.loads(seznam).split(','):
                    kat[it.split(':', 1)[0]] = k
        self.assertEqual(kat.get('G2CA'), 'heli')       # vrtulník Guimbal Cabri
        self.assertEqual(kat.get('B738'), 'jet')
        self.assertEqual(kat.get('C172'), 'light')
        self.assertEqual(kat.get('AT72'), 'turbo')
        self.assertGreater(len(kat), 2000)

if __name__ == '__main__':
    unittest.main()

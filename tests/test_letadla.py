import json, os, subprocess, sys, tempfile, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

class LetadlaTest(unittest.TestCase):
    def test_letadla_v_build_html(self):
        with tempfile.TemporaryDirectory() as td:
            d = Path(td)
            (d / 'web').mkdir(); (d / 'site').mkdir(); (d / 'assets').mkdir()
            (d / 'web/app.html').write_text((ROOT / 'web/app.html').read_text(encoding='utf-8'), encoding='utf-8')
            m = json.loads((ROOT / 'priklady/mesto.json').read_text(encoding='utf-8'))
            m['letadla'] = True
            (d / 'mesto.json').write_text(json.dumps(m, ensure_ascii=False), encoding='utf-8')
            env = {**os.environ, 'PYTHONPATH': str(ROOT)}
            subprocess.run([sys.executable, str(ROOT / 'build_html.py')], cwd=d, env=env, check=True, capture_output=True)
            html = (d / 'site/index.html').read_text(encoding='utf-8')
            self.assertIn('if (true) {', html)
            self.assertIn('OpenSky Network', html)

    def test_letadla_vypnuti(self):
        with tempfile.TemporaryDirectory() as td:
            d = Path(td)
            (d / 'web').mkdir(); (d / 'site').mkdir(); (d / 'assets').mkdir()
            (d / 'web/app.html').write_text((ROOT / 'web/app.html').read_text(encoding='utf-8'), encoding='utf-8')
            m = json.loads((ROOT / 'priklady/mesto.json').read_text(encoding='utf-8'))
            m['letadla'] = False
            (d / 'mesto.json').write_text(json.dumps(m, ensure_ascii=False), encoding='utf-8')
            env = {**os.environ, 'PYTHONPATH': str(ROOT)}
            subprocess.run([sys.executable, str(ROOT / 'build_html.py')], cwd=d, env=env, check=True, capture_output=True)
            html = (d / 'site/index.html').read_text(encoding='utf-8')
            self.assertIn('if (false) {', html)
            self.assertNotIn('letadla ©', html)

if __name__ == '__main__':
    unittest.main()

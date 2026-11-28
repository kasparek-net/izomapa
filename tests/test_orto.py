"""python tests/test_orto.py: chybová stránka WMS ani poškozená dlaždice v cache ortofota nezůstanou (bez sítě, curl je podvržený)."""
import os, subprocess, tempfile, unittest
from unittest import mock
from PIL import Image
from nastroje import orto


def zapis(f, b):
    with open(f, 'wb') as fh: fh.write(b)


def curl(obsah):
    """podvržený curl: do souboru za -o zapíše obsah (bytes) nebo platný JPEG (None)"""
    def run(cmd, *a, **k):
        f = cmd[cmd.index('-o') + 1]
        if obsah is None: Image.new('RGB', (4, 4)).save(f, 'JPEG')
        else: zapis(f, obsah)
        return subprocess.CompletedProcess(cmd, 0)
    return run


class OrtoTest(unittest.TestCase):
    def setUp(self):
        self.f = os.path.join(tempfile.mkdtemp(), 'd.jpg')

    def test_chybova_stranka_se_neulozi(self):
        with mock.patch('subprocess.run', curl(b'<?xml version="1.0"?><ServiceExceptionReport/>')):
            self.assertFalse(orto.ortofoto(self.f, 'u'))
        self.assertEqual(os.listdir(os.path.dirname(self.f)), [])

    def test_poskozena_cache_se_stahne_znovu(self):
        zapis(self.f, b'<html>chyba</html>')
        with mock.patch('subprocess.run', curl(None)):
            self.assertTrue(orto.ortofoto(self.f, 'u'))
        self.assertTrue(orto.platny(self.f))

    def test_poskozena_cache_se_smaze_kdyz_stazeni_selze(self):
        zapis(self.f, b'<html>chyba</html>')
        with mock.patch('subprocess.run', lambda cmd, *a, **k: subprocess.CompletedProcess(cmd, 22)):
            self.assertFalse(orto.ortofoto(self.f, 'u'))
        self.assertFalse(os.path.exists(self.f))

    def test_platna_cache_se_nestahuje(self):
        Image.new('RGB', (4, 4)).save(self.f, 'JPEG')
        with mock.patch('subprocess.run', side_effect=AssertionError('stahuje')):
            self.assertTrue(orto.ortofoto(self.f, 'u'))


if __name__ == '__main__': unittest.main()

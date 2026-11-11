"""Čekání vozů MHD na konečné (nastroje/gtfs_casy.cekani_na_konecne)."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('gtfs_casy', Path(__file__).resolve().parents[1] / 'nastroje/gtfs_casy.py')
g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)

# spoj: [linka, tvar, služba, t0, seq, cíl, zastávky [jméno, čas od t0, ...]]
def spoj(t0, z, konec, sluzba='S', delka=600):
    return [0, 0, sluzba, t0, [0, 0, delka, 1], 0, [z, 0, konec, delka]]

class CekaniTest(unittest.TestCase):
    def test_dojezd_a_odjezd_se_sparuji(self):
        a, b = spoj(1000, 1, 2), spoj(2000, 2, 1)                  # a dojede na 2 v 1600, b odtud odjíždí ve 2000
        self.assertEqual(g.cekani_na_konecne([a, b], lambda q: 0), 1)
        self.assertEqual(b[7], 400); self.assertEqual(a[7], 0)

    def test_dlouha_pauza_se_nepocita(self):
        a, b = spoj(0, 1, 2), spoj(4000, 2, 1)                    # dojezd 600, odjezd 4000: přes 30 min
        g.cekani_na_konecne([a, b], lambda q: 0)
        self.assertEqual(b[7], 0)

    def test_jina_sluzba_ani_vlak(self):
        a, b = spoj(1000, 1, 2, 'Prac'), spoj(2000, 2, 1, 'Sob')
        c, d = spoj(1000, 1, 2), spoj(2000, 2, 1)
        g.cekani_na_konecne([a, b], lambda q: 0); g.cekani_na_konecne([c, d], lambda q: 2)
        self.assertEqual((b[7], d[7]), (0, 0))

    def test_jeden_dojezd_pro_jeden_odjezd(self):
        a, b, c = spoj(1000, 1, 2), spoj(1800, 2, 1), spoj(1900, 2, 1)
        g.cekani_na_konecne([a, b, c], lambda q: 0)
        self.assertEqual((b[7], c[7]), (200, 0))

if __name__ == '__main__':
    unittest.main()

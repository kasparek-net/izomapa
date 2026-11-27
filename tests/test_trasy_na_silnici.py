"""Autobusové trasy na silnici (nastroje/trasy_na_silnici.py): .venv/bin/python -m unittest tests/test_trasy_na_silnici.py"""
import sys, unittest
from pathlib import Path
import shapely
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from nastroje.trasy_na_silnici import Silnice


class Trasy(unittest.TestCase):
    def setUp(self):
        # silnice do L: po ose x od 0 do 200, pak nahoru po x = 200
        cesta = lambda a, b: [(200.0, 0.0), tuple(b)] if a[1] < 1 and b[0] > 199 else None
        self.S = Silnice([shapely.LineString([(0, 0), (200, 0)]), shapely.LineString([(200, 0), (200, 200)])], cesta)

    def test_zaliv_na_osu(self):                                   # bod 3 m vedle osy (zastávka v zálivu) jde na osu
        w = self.S.k_ose([[0, 0], [100, 3], [190, 0]])
        self.assertEqual(w[1], [100.0, 0.0])

    def test_konecna_na_chodniku(self):                            # začátek 10 m od silnice: nejbližší bod trasy na silnici
        w = self.S.konce([[50, 10], [60, 0], [150, 0]])
        self.assertAlmostEqual(w[0][1], 0.0); self.assertTrue(50 <= w[0][0] <= 60)

    def test_zatacka_pres_travu(self):                             # úhlopříčka přes roh se přesměruje přes křižovatku
        w = self.S.zkratky([[100, 0], [180, 0], [200, 20], [200, 100]])
        self.assertIn([200.0, 0.0], [[round(x, 3), round(y, 3)] for x, y in w])


if __name__ == '__main__':
    unittest.main()

import os
import sys
import unittest

import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from nastroje.tabulky import radky


class RadkyTest(unittest.TestCase):
    def test_prazdna_tabulka_si_necha_sloupce(self):
        # čtverec bez budov: prázdný seznam by pandas vzal jako výběr sloupců a zmizelo by 'id'
        bld = pd.DataFrame({'id': [], 'sources': []})
        vysledek = radky(bld, [True for _ in bld.id])
        self.assertEqual(list(vysledek.columns), ['id', 'sources'])
        self.assertEqual(len(vysledek), 0)

    def test_prazdny_object_sloupec_z_map(self):
        # čtverec bez adres: Series.map na prázdném sloupci vrací dtype object
        addr = pd.DataFrame({'geom': pd.Series([], dtype=object)})
        vysledek = radky(addr, addr.geom.map(lambda g: True))
        self.assertEqual(list(vysledek.columns), ['geom'])

    def test_vybere_radky(self):
        df = pd.DataFrame({'id': ['a', 'b', 'c']})
        vysledek = radky(df, [True, False, True])
        self.assertEqual(list(vysledek.id), ['a', 'c'])


if __name__ == '__main__':
    unittest.main()

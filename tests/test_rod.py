import ast, re, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def nacti_rod():
    """funkce rod() z novy_mesto.py bez spuštění skriptu (ten hned stahuje hranici obce)"""
    src = (ROOT / 'novy_mesto.py').read_text(encoding='utf-8')
    fn = next(n for n in ast.parse(src).body if isinstance(n, ast.FunctionDef) and n.name == 'rod')
    ns = {'re': re}
    exec(compile(ast.Module([fn], []), 'novy_mesto.py', 'exec'), ns)
    return ns['rod']


class RodTest(unittest.TestCase):
    def test_titulek_izometricky_izometricka_izometricke(self):
        rod = nacti_rod()
        for nazev, ocekavany in {
            'Chrastava': 'á', 'Ostrava': 'á', 'Praha 6': 'á', 'Česká Lípa': 'á', 'Mladá Boleslav': 'á',
            'Plzeň': 'á', 'Olomouc': 'á', 'Třebíč': 'á', 'Nová Ves': 'á',
            'Brno': 'é', 'Kladno': 'é', 'Pardubice': 'é', 'Ústí nad Labem': 'é', 'Žleby': 'é', 'Klatovy': 'é',
            'Karlovy Vary': 'é', 'Nové Město na Moravě': 'é', 'Horní Police': 'é', 'Velké Meziříčí': 'é',
            'Liberec': 'ý', 'Tábor': 'ý', 'Hradec Králové': 'ý', 'Frýdek-Místek': 'ý', 'Jablonec nad Nisou': 'ý',
        }.items():
            with self.subTest(nazev=nazev):
                self.assertEqual(rod(nazev), ocekavany)


if __name__ == '__main__':
    unittest.main()

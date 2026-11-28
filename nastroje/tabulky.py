import numpy as np


def radky(df, maska):
    """Řádky tabulky podle masky. Prázdný seznam nebo prázdný object sloupec (čtverec bez budov či adres)
    by pandas v df[...] vzal jako výběr sloupců a vrátil tabulku bez sloupců."""
    return df[np.asarray(maska, dtype=bool)]

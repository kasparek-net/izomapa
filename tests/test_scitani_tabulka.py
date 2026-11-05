"""python tests/test_scitani_tabulka.py: čtení tabulky sčítání včetně pomlček a chybějících buněk."""
import os, sys, tempfile, zipfile
sys.path.insert(0, 'nastroje')
import scitani as s

CELLS = ['PČ', 'NÁZEV_KRAJE', 'SIL', 'ÚSEK', 'A', 'Z', 'TV', 'SV']
strings = CELLS + ['Kraj', '480', '7-1', 'D48', '7-2']
xml = '<si><t>%s</t></si>'
def row(n, vals):
    out = ''
    for col, v in zip('ABCDEFGH', vals):
        if v is None: continue
        if isinstance(v, str) and v in strings: out += f'<c r="{col}{n}" t="s"><v>{strings.index(v)}</v></c>'
        else: out += f'<c r="{col}{n}"><v>{v}</v></c>'
    return f'<row r="{n}">{out}</row>'
sheet = ('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + row(1, CELLS)
         + row(2, [1, 'Kraj', '480', '7-1', 219, 7, 501, 7760])
         + row(3, [2, 'Kraj', 'D48', '7-2', '-', None, 100, 900])          # pomlčka a chybějící buňka nesmí shodit načtení
         + row(4, [3, 'Kraj', '480', '7-1', 1, 1, 5, '-'])                  # bez celkové intenzity se úsek přeskočí
         + '</sheetData></worksheet>')
with tempfile.TemporaryDirectory() as d:
    p = os.path.join(d, 't.xlsx')
    with zipfile.ZipFile(p, 'w') as z:
        z.writestr('xl/sharedStrings.xml', '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + ''.join(xml % x for x in strings) + '</sst>')
        z.writestr('xl/worksheets/sheet1.xml', sheet)
    res = s.sections(p)
assert len(res) == 2, res
assert res[0] == {'kraj': 'Kraj', 'sil': '480', 'usek': '7-1', 'sv': 7760, 'nak': 275}, res[0]
assert res[1]['nak'] == 100 and res[1]['sv'] == 900
print('ok')

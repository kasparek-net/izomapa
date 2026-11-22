"""Složí celou stránku prohlížeče z web/app.html (šablona) + web/css/*.css + web/js/*.js (stejně jako Liberec od 17. 11. 2026).

Šablona má na místě stylů řádek <!-- @css --> a na místě hlavního skriptu <!-- @js -->. Za ně se vloží soubory ze složek
web/css a web/js podle abecedy (číslo na začátku názvu = pořadí). Výsledek je stejný text jako dřívější jeden soubor app.html:
build_html.py z něj dělá site/index.html, testy z něj čtou skript. Celý skript je dál jedna funkce (async () => { … })():
začíná v js/00-zaklad.js a končí v js/90-doplnky-api.js, všechny soubory sdílejí proměnné (state, viewer, $, LAYERS…).

python3 web/sestav.py [soubor]   celá stránka do souboru (výchozí build/app_cela.html)
"""
import glob, os, sys

WEB = os.path.dirname(os.path.abspath(__file__))


def app(web=WEB):
    t = open(os.path.join(web, 'app.html'), encoding='utf-8').read()
    for znacka, slozka, pripona in (('<!-- @css -->\n', 'css', 'css'), ('<!-- @js -->\n', 'js', 'js')):
        assert t.count(znacka) == 1, f'web/app.html: {znacka.strip()} musí být právě jednou'
        soubory = sorted(glob.glob(os.path.join(web, slozka, '*.' + pripona)))
        assert soubory, f'web/{slozka}/ je prázdná'
        t = t.replace(znacka, ''.join(open(f, encoding='utf-8').read() for f in soubory))
    return t


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(WEB, '..', 'build', 'app_cela.html')
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    open(out, 'w', encoding='utf-8').write(app())
    print(out)

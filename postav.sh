#!/bin/sh
# Postaví celé město z mesto.json: data -> výšky -> les a pole -> scény -> render -> dlaždice -> web (složka site/).
# ./postav.sh            všechno (kroky, které už mají výsledek, se přeskočí – smaž soubor a krok se zopakuje)
# ./postav.sh render     jen scény + render + web (po úpravě pravidel nebo dominant); kreslí jen čtverce, které se změnily
# Čas: stahování ~2–5 min na čtverec, render ~1–2 min na čtverec a variantu (Mac s Apple Silicon).
set -e
cd "$(dirname "$0")"
if [ -f .venv/bin/activate ]; then . .venv/bin/activate; else . .venv/Scripts/activate; fi   # Windows: Scripts
export PYTHONUTF8=1   # Windows: soubory a výpisy v UTF-8 (jinak padá na češtině)
CH=$(python -c "import geo; print(' '.join(f'{i},{j}' for i, j in sorted(geo.CHUNKS)))")
dir() { if [ "$1" = "0,0" ]; then echo data; else echo data_c$(echo $1 | tr ',' '_'); fi; }

if [ "$1" != render ]; then
  python fetch_data.py --vse                                  # Overture (OSM) + terén, místa, části obce
  [ -f assets/dmp_vysky.json ] || { python dmp_fetch.py && python dmp_vysky.py; }          # výšky budov z laseru ČÚZK
  [ -f build/les_maska.png ] || python nastroje/les.py                                     # les podle ortofota
  [ -f assets/zabaged.json ] || { python nastroje/zabaged.py && python nastroje/pole.py; } # pole a louky
  [ -f assets/hriste.json ] || python nastroje/hriste.py || true                          # dětská a workoutová hřiště z OSM
fi
if [ "$1" != render ]; then rm -rf site/tiles site/tiles.json; fi   # celá stavba kreslí vše znovu; ./postav.sh render kreslí jen změněné čtverce
mkdir -p site/tiles
./render_par.sh                                               # scény, render a dlaždice: několik čtverců najednou podle paměti (./render_par.sh 1 = po jednom)
for s in summer autumn winter spring; do node render.mjs mpp=0.2 dir=build season=$s alpha=1 stromy=site/stromy > /dev/null; done   # kresby stromů: auta se schovají přesně za ně
python preview.py
python overlay.py
python mhd.py || true                                         # jízdní řády jen když je v mesto.json mhd.gtfs
python set_status.py hotovo
python build_html.py
echo "Hotovo. Náhled: npm run nahled  a otevři http://localhost:8000"
echo "Izomapa je zdarma. Jestli ti ušetřila práci, kup autorovi kafe: https://donate.stripe.com/7sY7sE41Qg0C0DP5TY8g001 ☕"

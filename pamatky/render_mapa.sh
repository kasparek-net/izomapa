#!/bin/sh
# Přerenderuje mapu se schválenými modely památek (jen lokálně, nic nenasazuje):
#   pamatky/render_mapa.sh            všechny varianty (autumn winter spring summer lights)
#   pamatky/render_mapa.sh summer     jen léto (rychlá kontrola)
#   CTVERCE="0,0 1,0" pamatky/render_mapa.sh   jen vybrané čtverce
# 0) pamatky/schvalene.json z dashboardu (do dlaždic jen schválené), 1) vršky modelů pro obrys při najetí myší
#    (pred_po.mjs -> pamatky/vrsky.json, jen u schválených, které vršek ještě nemají; PRED_PO=vse obnoví snímky dashboardu všech),
# 2) prep dotčených čtverců, 3) render celých čtverců (výstup grafické karty se může o odstín lišit, proto celé), 4) dzi do site/tiles,
# 5) náhled a overlay.
# Čtverce: bez CTVERCE všechny, kterých se týká schválený model nebo model, který byl v dlaždicích minule a už schválený není
# (bod do HALF + MARGIN + 120 m od středu čtverce, tedy i sousedé, kteří kreslí okrajový pás).
# Průběh: build/pamatky_render.log (poslední řádek HOTOVO pamatky).
set -e
cd "$(dirname "$0")/.."
if [ -f .venv/bin/activate ]; then . .venv/bin/activate; else . .venv/Scripts/activate; fi   # Windows: Scripts
export PYTHONUTF8=1
V=${*:-"autumn winter spring summer lights"}
mkdir -p build
python pamatky/schvalit.py
if [ "${PRED_PO:-}" = vse ]; then
  CHYBI=""
else
  CHYBI=$(python -c "
import json, os
v = json.load(open('pamatky/vrsky.json', encoding='utf-8')) if os.path.exists('pamatky/vrsky.json') else {}
print(' '.join(s for s in json.load(open('pamatky/schvalene.json', encoding='utf-8')) if s not in v))")
fi
if [ "${PRED_PO:-}" = vse ] || [ -n "$CHYBI" ]; then
  node pamatky/pred_po.mjs $CHYBI > build/pamatky_pred_po.log 2>&1 || { tail -5 build/pamatky_pred_po.log; exit 1; }
fi
CT=${CTVERCE:-$(python -c "
import json, os, sys
sys.path.insert(0, '.'); import geo
D = geo.HALF + geo.MARGIN + 120
S = set(json.load(open('pamatky/schvalene.json', encoding='utf-8')))
if os.path.exists('build/pamatky_vykresleno.json'): S |= set(json.load(open('build/pamatky_vykresleno.json', encoding='utf-8')))
B = [json.load(open(f'pamatky/{s}.json', encoding='utf-8'))['bod'][:2] for s in sorted(S) if os.path.exists(f'pamatky/{s}.json')]
print(' '.join(f'{i},{j}' for i, j in sorted(geo.CHUNKS) if any(abs(x - geo.chunk_center((i, j))[0]) <= D and abs(y - geo.chunk_center((i, j))[1]) <= D for x, y in B)))")}
if [ -z "$CT" ]; then echo "žádný schválený model, není co renderovat"; exit 0; fi
echo "čtverce: $CT"
for C in $CT; do
  if [ "$C" = "0,0" ]; then DATA=data; else DATA=data_c$(echo $C | tr ',' '_'); fi
  L=build/pamatky_prep_$(echo $C | tr ',' '_').log
  python prep.py $DATA $C > $L 2>&1 || { tail -5 $L; exit 1; }
  echo "prep $C"
done
for C in $CT; do
  ./render_chunk.sh $C $V
  if [ "$C" = "0,0" ]; then python dzi.py $V; else python dzi.py --chunk $C $V; fi
  # otisk pro ./postav.sh render (render jen změněných čtverců): po všech variantách platí, po části variant (summer)
  # se smaže, aby ./postav.sh render čtverec dokreslil celý
  if [ "$C" = "0,0" ]; then B=build; else B=build/c$(echo $C | tr ',' '_'); fi
  if [ "$V" = "autumn winter spring summer lights" ]; then python nastroje/otisk.py $C > $B/otisk_renderu; else rm -f $B/otisk_renderu; fi
done
python preview.py
python overlay.py
cp pamatky/schvalene.json build/pamatky_vykresleno.json
echo HOTOVO pamatky

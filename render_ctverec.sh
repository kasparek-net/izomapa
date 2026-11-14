#!/bin/sh
# jeden čtverec celý: prep -> render (všechny varianty) -> dzi; volá ho render_par.sh
# Když se scéna ani kód renderu od minula nezměnily (nastroje/otisk.py), render a dlaždice se přeskočí.
cd "$(dirname "$0")"
if [ -f .venv/bin/activate ]; then . .venv/bin/activate; else . .venv/Scripts/activate; fi
export PYTHONUTF8=1
c=$1; if [ "$c" = "0,0" ]; then D=data; else D=data_c$(echo $c | tr "," "_"); fi
t=$(date +%s)
L=build/ctverec_$(echo $c | tr "," "_").log      # chyby nezahazovat: log čtverce zůstává pro dohledání
if [ "$c" = "0,0" ]; then B=build; T=site/tiles/summer; else B=build/c$(echo $c | tr "," "_"); T=site/tiles/c$(echo $c | tr "," "_"); fi
python prep.py $D $c > $L 2>&1 || { echo "CHYBA $c (viz $L)" | tee -a build/render_par.log; exit 1; }
# render jen změněných čtverců: stejná scéna, podklady i kód renderu jako minule a dlaždice na webu = není co kreslit
O=$(python nastroje/otisk.py $c)
if [ -d "$T" ] && [ -f $B/otisk_renderu ] && [ "$(cat $B/otisk_renderu)" = "$O" ]; then
  echo "beze změny $c" | tee -a build/render_par.log; exit 0
fi
rm -f $B/otisk_renderu
./render_chunk.sh $c >> $L 2>&1 || { echo "CHYBA $c (viz $L)" | tee -a build/render_par.log; exit 1; }
if [ "$c" = "0,0" ]; then python dzi.py >> $L 2>&1; else python dzi.py --chunk $c >> $L 2>&1; fi || { echo "CHYBA dzi $c (viz $L)" | tee -a build/render_par.log; exit 1; }
echo "$O" > $B/otisk_renderu
echo "hotovo $c za $(( $(date +%s) - t )) s" | tee -a build/render_par.log

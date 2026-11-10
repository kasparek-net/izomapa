#!/bin/sh
# jeden čtverec celý: prep -> render (všechny varianty) -> dzi; volá ho render_par.sh
cd "$(dirname "$0")"
if [ -f .venv/bin/activate ]; then . .venv/bin/activate; else . .venv/Scripts/activate; fi
export PYTHONUTF8=1
c=$1; if [ "$c" = "0,0" ]; then D=data; else D=data_c$(echo $c | tr "," "_"); fi
t=$(date +%s)
L=build/ctverec_$(echo $c | tr "," "_").log      # chyby nezahazovat: log čtverce zůstává pro dohledání
python prep.py $D $c > $L 2>&1 && ./render_chunk.sh $c >> $L 2>&1 || { echo "CHYBA $c (viz $L)" | tee -a build/render_par.log; exit 1; }
if [ "$c" = "0,0" ]; then python dzi.py >> $L 2>&1; else python dzi.py --chunk $c >> $L 2>&1; fi || { echo "CHYBA dzi $c (viz $L)" | tee -a build/render_par.log; exit 1; }
echo "hotovo $c za $(( $(date +%s) - t )) s" | tee -a build/render_par.log

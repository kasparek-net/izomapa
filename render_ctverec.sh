#!/bin/sh
# jeden čtverec celý: prep -> render (všechny varianty) -> dzi; volá ho render_par.sh
cd "$(dirname "$0")"
if [ -f .venv/bin/activate ]; then . .venv/bin/activate; else . .venv/Scripts/activate; fi
export PYTHONUTF8=1
c=$1; if [ "$c" = "0,0" ]; then D=data; else D=data_c$(echo $c | tr "," "_"); fi
t=$(date +%s)
python prep.py $D $c > /dev/null && ./render_chunk.sh $c > /dev/null || { echo "CHYBA $c" | tee -a build/render_par.log; exit 1; }
if [ "$c" = "0,0" ]; then python dzi.py > /dev/null; else python dzi.py --chunk $c > /dev/null; fi
echo "hotovo $c za $(( $(date +%s) - t )) s" | tee -a build/render_par.log

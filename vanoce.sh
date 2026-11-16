#!/bin/sh
# Vánoční výzdoba (assets/vanoce.json: stromy, kluziště, stánky) jako samostatná průhledná vrstva.
# Přerenderuje jen čtverce, kde výzdoba je (scéna + vrstvy xmas_winter a xmas_autumn), a přestaví web.
# ./vanoce.sh            po každé změně výzdoby (pár minut); ./postav.sh ho pouští sám
# Prohlížeč vrstvu zapíná podle data (od/do ve vanoce.json), v menu jde vypnout.
set -e
cd "$(dirname "$0")"
if [ -f .venv/bin/activate ]; then . .venv/bin/activate; else . .venv/Scripts/activate; fi
export PYTHONUTF8=1
dir() { if [ "$1" = "0,0" ]; then echo data; else echo data_c$(echo $1 | tr ',' '_'); fi; }
# čtverce s výzdobou
PLAN=$(python - <<'PY'
from geo import MESTO, HALF, to_local, CHUNKS, chunk_center
def chunks_of(lat, lon, r=0):
    x, y = to_local(lon, lat)
    return {c for c in CHUNKS if abs(x - chunk_center(c)[0]) <= HALF + r and abs(y - chunk_center(c)[1]) <= HALF + r}
plan = set()
st = MESTO.get('vanocni_strom') or []
if st and not isinstance(st[0], list): st = [st]
for la, lo in st: plan |= chunks_of(la, lo)
for k in (MESTO.get('kluziste') or []) + (MESTO.get('vanocni_stanky') or []): plan |= chunks_of(k['lat'], k['lon'], 20)
print(' '.join(f'{c[0]},{c[1]}' for c in sorted(plan)) if MESTO.get('vanoce') else '')
PY
)
echo "čtverce s výzdobou: ${PLAN:-žádné}"
KEEP=""
for c in $PLAN; do
  python prep.py $(dir $c) $c > /dev/null 2>&1 && echo "scéna $c"
  ./render_chunk.sh $c xmas_winter xmas_autumn
  D=$( [ "$c" = "0,0" ] && echo build || echo build/c$(echo $c | tr ',' '_') )
  OK=""; for x in xmas_winter xmas_autumn; do ls $D/tiles_$x/*.png > /dev/null 2>&1 && OK="$OK $x"; done      # bez dlaždic (nic ve čtverci) = bez vrstvy
  [ -z "$OK" ] && continue
  if [ "$c" = "0,0" ]; then python dzi.py $OK; else python dzi.py --chunk $c $OK; fi
  KEEP="$KEEP $c"
done
# z tiles.json pryč vrstvy čtverců, kde už výzdoba není
[ -f site/tiles.json ] && python - $KEEP <<'PY'
import json, sys
keep = set(sys.argv[1:])
t = json.load(open('site/tiles.json'))
def clean(d, key):
    for v in ('xmas_winter', 'xmas_autumn'):
        if v in d and key not in keep: del d[v]; print('odstraněno', key, v)
clean(t, '0,0')
for ch in t.get('chunks', {}).values(): clean(ch, f"{ch['chunk'][0]},{ch['chunk'][1]}")
json.dump(t, open('site/tiles.json', 'w'))
PY
python build_html.py > /dev/null
echo "Hotovo."

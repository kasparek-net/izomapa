#!/bin/sh
# vyrenderuje jeden čtverec mapy: ./render_chunk.sh 0,-1 [varianty]
# okraje s řezem zeminou se berou ze scény (strany bez souseda), všechny čtverce s průhledným pozadím
set -e
C=$1; shift; V=${*:-"autumn winter spring summer lights"}
if [ "$C" = "0,0" ]; then D=build; else D=build/c$(echo $C | tr ',' '_'); fi
G="gx0=-1646.34559672906 gy1=988.7958500237901"
for s in $V; do
  # výstup do logu a kontrola návratového kódu node (dřív rozhodoval grep a pád renderu prošel jako HOTOVO)
  if [ "$s" = lights ]; then
    node render.mjs mpp=0.2 dir=$D out=$D/tiles_lights season=autumn mode=lights alpha=1 $G > $D/render_$s.log 2>&1 || { tail -5 $D/render_$s.log; echo "RENDER SELHAL $C $s"; exit 1; }
  else
    node render.mjs mpp=0.2 dir=$D out=$D/tiles_$s season=$s alpha=1 $G > $D/render_$s.log 2>&1 || { tail -5 $D/render_$s.log; echo "RENDER SELHAL $C $s"; exit 1; }
  fi
  grep -c dlaždice $D/render_$s.log
done
echo HOTOVO $C

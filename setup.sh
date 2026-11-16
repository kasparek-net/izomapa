#!/bin/sh
# První spuštění (macOS / Linux / Windows v Git Bash): Python prostředí, Node balíčky a Chromium pro renderer.
# Předpoklad: Python 3.9+, Node 18+ (Mac: brew install python node)
set -e
cd "$(dirname "$0")"
PY=python3; $PY -c '' 2>/dev/null || PY=python      # Windows: python3 je jen odkaz do Microsoft Store
$PY -m venv .venv
if [ -f .venv/bin/activate ]; then . .venv/bin/activate; else . .venv/Scripts/activate; fi   # Windows: Scripts
python -m pip install -q --upgrade pip
pip install -q shapely pyproj numpy pillow pyarrow pandas scipy "laspy[lazrs]"
# bez dev balíčků (wrangler je jen pro volitelné hlášení, viz README) a bez instalačních skriptů: nic z nich
# nepotřebujeme a nový npm by u nich vypisoval varování (Chromium stáhne až další řádek)
npm install --omit=dev --ignore-scripts
npx playwright install chromium
if [ -f .venv/bin/python ]; then P=.venv/bin/python; else P=.venv/Scripts/python; fi
echo "Hotovo. Další krok: $P novy_mesto.py \"Název obce\"  a pak  ./postav.sh"
echo "(Python vždy z .venv, systémový python3 nemá potřebné knihovny.)"

#!/bin/sh
# Všechny testy (Python i Node) z kořene repa: ./tests/run.sh   (Windows: sh tests/run.sh v Git Bash)
cd "$(dirname "$0")/.."
PY=.venv/bin/python; [ -x "$PY" ] || PY=.venv/Scripts/python
export PYTHONUTF8=1
st=0
"$PY" -m unittest discover -s tests -p 'test_*.py' || st=1
for f in tests/test-*.mjs; do node "$f" > /dev/null || { echo "CHYBA: $f"; st=1; }; done
[ $st = 0 ] && echo "testy OK"
exit $st

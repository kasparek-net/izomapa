#!/bin/sh
# Souběžný render: několik čtverců najednou, každý projde prep -> render (všechny varianty) -> dzi.
# ./render_par.sh            počet souběžných čtverců podle paměti a jader (každý čtverec si bere ~2–3 GB RAM a grafiku)
# ./render_par.sh 2          ručně 2 čtverce najednou; 1 = postaru jeden po druhém
# ./render_par.sh 2 "0,0 1,0"  jen vybrané čtverce
# Časy čtverců jsou v build/render_par.log. Na Macu M4 (16 GB) vyšly 3 čtverce najednou zhruba 2× rychleji než po jednom.
set -e
cd "$(dirname "$0")"
if [ -f .venv/bin/activate ]; then . .venv/bin/activate; else . .venv/Scripts/activate; fi   # Windows: Scripts
export PYTHONUTF8=1
PAR=${1:-$(python - <<'PY'
import os
try:
    import ctypes, sys
    if sys.platform == 'darwin':
        import subprocess; mem = int(subprocess.check_output(['sysctl', '-n', 'hw.memsize']))
    elif sys.platform.startswith('linux'):
        mem = os.sysconf('SC_PAGE_SIZE') * os.sysconf('SC_PHYS_PAGES')
    else:
        class M(ctypes.Structure): _fields_ = [('l', ctypes.c_ulong), ('m', ctypes.c_ulong), ('t', ctypes.c_ulonglong), ('a', ctypes.c_ulonglong)] + [(f'x{i}', ctypes.c_ulonglong) for i in range(5)]
        s = M(); s.l = ctypes.sizeof(M); ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(s)); mem = s.t
except Exception:
    mem = 8 << 30
# na čtverec ~4 GB paměti (render v prohlížeči + systém), na čtverec aspoň 3 jádra; nejvýš 4
print(max(1, min(4, int(mem / (4 << 30)), (os.cpu_count() or 2) // 3)))
PY
)}
LIST=${2:-$(python -c "import geo; print(' '.join(f'{i},{j}' for i, j in sorted(geo.CHUNKS)))")}
mkdir -p build; : > build/render_par.log
echo "souběžně $PAR čtverců"
T0=$(date +%s)
echo $LIST | tr ' ' '\n' | xargs -P "$PAR" -n 1 ./render_ctverec.sh
echo "render hotov za $(( ($(date +%s) - T0) / 60 )) min" | tee -a build/render_par.log

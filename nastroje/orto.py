# stažení dlaždice ortofota ČÚZK (WMS) do cache: nastroje/les.py a nastroje/strechy.py
import os, subprocess
from PIL import Image


def platny(f):
    """True, když je f celý čitelný obrázek (ne chybová stránka WMS, ne useknutý soubor)"""
    try:
        with Image.open(f) as im: im.load()
        return True
    except Exception:
        return False


def ortofoto(f, url):
    """dlaždice z cache, jinak ji stáhne; True jen s platným obrázkem – chybová odpověď ani poškozený soubor v cache nezůstanou"""
    if platny(f): return True
    tmp = f + '.part'
    ok = subprocess.run(['curl', '-s', '-f', '-m', '120', '-o', tmp, url]).returncode == 0 and platny(tmp)
    if ok: os.replace(tmp, f)
    else:
        for p in (f, tmp):
            if os.path.exists(p): os.remove(p)
    return ok

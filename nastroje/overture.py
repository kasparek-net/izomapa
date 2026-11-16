"""Overture Maps na S3 (anonymně): které vydání stahovat a dataset jedné vrstvy.

Overture vydává data každý měsíc a na S3 nechává jen poslední dvě až tři vydání. VYDANI je vyzkoušené s touto
šablonou; když už na S3 není, vezme se nejnovější dostupné (struktura dat se mezi vydáními mění jen výjimečně).
Konkrétní vydání jde vynutit proměnnou IZO_OVERTURE=2026-10-21.0 (seznam: s3://overturemaps-us-west-2/release/).
"""
import os, sys
import pyarrow.dataset as ds, pyarrow.fs as fs

VYDANI = '2026-10-21.0'
KOREN = 'overturemaps-us-west-2/release'
_s3 = _vydani = None


def s3():
    global _s3
    if _s3 is None:
        proxy = os.environ.get('HTTPS_PROXY')
        _s3 = fs.S3FileSystem(anonymous=True, region='us-west-2', **({'proxy_options': proxy} if proxy else {}))
    return _s3


def vydani():
    """VYDANI, nebo nejnovější vydání na S3, když VYDANI už smazali (zjistí se jednou za běh)"""
    global _vydani
    if _vydani: return _vydani
    _vydani = os.environ.get('IZO_OVERTURE') or VYDANI
    if os.environ.get('IZO_OVERTURE'): return _vydani
    try:
        dostupne = sorted(i.base_name for i in s3().get_file_info(fs.FileSelector(KOREN)) if i.type == fs.FileType.Directory)
    except Exception as e:                      # bez seznamu zkusit vyzkoušené vydání (chyba se ukáže až při stahování)
        print(f'Overture: seznam vydání nejde načíst ({e}), zkouším {VYDANI}', file=sys.stderr)
        return _vydani
    if dostupne and VYDANI not in dostupne:
        _vydani = dostupne[-1]
        print(f'Overture: vydání {VYDANI} už na S3 není, beru nejnovější {_vydani}', file=sys.stderr)
    return _vydani


def dataset(theme, typ):
    return ds.dataset(f'{KOREN}/{vydani()}/theme={theme}/type={typ}/', filesystem=s3(), format='parquet')

"""Build-time hook doplňku Najdeš to? (client i server režim)."""
from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any


def _project_target(item: Any, default_radius_m: float, mpp: float, project_xy) -> dict[str, Any] | None:
    """Převede bodový nebo polygonální cíl ze zeměpisných souřadnic na pixely mapy."""
    if isinstance(item, dict) and isinstance(item.get('polygon'), list):
        pts = [list(project_xy(float(p[0]), float(p[1]))) for p in item['polygon'] if len(p) >= 2]
        return {'type': 'polygon', 'points': pts} if len(pts) >= 3 else None

    if isinstance(item, list) and len(item) >= 3 and isinstance(item[0], (list, tuple)):
        pts = [list(project_xy(float(p[0]), float(p[1]))) for p in item if len(p) >= 2]
        return {'type': 'polygon', 'points': pts} if len(pts) >= 3 else None

    if isinstance(item, (list, tuple)) and len(item) >= 2:
        r_m = float(item[2]) if len(item) >= 3 else default_radius_m
        return {'type': 'point', 'xy': list(project_xy(float(item[0]), float(item[1]))), 'radius_px': round(r_m / mpp, 1)}

    if isinstance(item, dict) and 'lat' in item and 'lon' in item:
        r_m = float(item.get('radius', default_radius_m))
        return {'type': 'point', 'xy': list(project_xy(float(item['lat']), float(item['lon']))), 'radius_px': round(r_m / mpp, 1)}

    return None


def _project_camera(cam_raw: Any, ctx: dict[str, Any]) -> dict[str, Any] | None:
    """Promítne výchozí kameru úrovně [lat, lon, km] na {x, y, km, zoom}."""
    if not isinstance(cam_raw, (list, tuple)) or len(cam_raw) < 2:
        return None
    cx, cy = ctx['project_xy'](float(cam_raw[0]), float(cam_raw[1]))
    km = float(cam_raw[2]) if len(cam_raw) >= 3 else 1.2
    out: dict[str, Any] = {'x': cx, 'y': cy, 'km': km}
    w = ctx['cam'].get('w')
    mpp = float(ctx['cam'].get('mpp') or 0.2)
    if w:
        clamped_km = min(max(km if km > 0 else 1.0, 0.05), w * mpp / 1000.0)
        out['zoom'] = round((w * mpp) / (clamped_km * 1000.0), 6)
    return out


def _resolve_data_file(ctx: dict[str, Any]) -> Path | None:
    """Najde datový soubor doplňku v pořadí: assets/doplnky/najdi_to.json -> assets/najdi_to.json -> najdi_to.json."""
    candidates = [
        ctx.get('data_file'),
        ctx['assets_dir'] / 'doplnky' / 'najdi_to.json',
        ctx['assets_dir'] / 'najdi_to.json',
        Path('najdi_to.json'),
    ]
    for cand in candidates:
        if isinstance(cand, Path) and cand.is_file():
            return cand
    return None


def build_overlay(ctx: dict[str, Any]) -> dict[str, Any] | bool:
    """Načte data hry, přepočítá souřadnice a v server režimu oddělí tajné cíle mimo veřejný web."""
    cfg = ctx['plugin_config']
    data_file = _resolve_data_file(ctx)
    if data_file is None:
        return False

    raw = json.loads(data_file.read_text(encoding='utf-8'))
    if raw.get('enabled', True) is False or not raw.get('levels'):
        return False

    mpp = float(ctx['cam'].get('mpp') or 0.2)
    mode = cfg.get('mode', 'client')
    project_xy = ctx['project_xy']

    public_levels: list[dict[str, Any]] = []
    secret_levels: list[dict[str, Any]] = []

    for lvl in raw['levels']:
        cam_proj = _project_camera(lvl.get('camera'), ctx)
        pub_qs: list[dict[str, Any]] = []
        sec_qs: list[dict[str, Any]] = []

        for q in lvl.get('questions', []):
            radius_m = float(q.get('radius', 35))
            radius_px = round(radius_m / mpp, 1)
            q_pub: dict[str, Any] = {'id': q.get('id', ''), 'text': q.get('text', '')}
            q_sec: dict[str, Any] = {
                'id': q.get('id', ''),
                'text': q.get('text', ''),
                'radius_px': radius_px,
                'answer': q.get('answer', ''),
            }

            if 'lat' in q and 'lon' in q:
                q_sec['xy'] = list(project_xy(float(q['lat']), float(q['lon'])))

            targets_proj = []
            for t in q.get('targets') or []:
                pt = _project_target(t, radius_m, mpp, project_xy)
                if pt:
                    targets_proj.append(pt)
            if targets_proj:
                q_sec['targets'] = targets_proj

            pub_qs.append(q_pub if mode == 'server' else q_sec)
            sec_qs.append(q_sec)

        pub_lvl: dict[str, Any] = {'lvl': lvl.get('lvl', 1), 'text': lvl.get('text', ''), 'questions': pub_qs}
        if cam_proj:
            pub_lvl['camera'] = cam_proj
        public_levels.append(pub_lvl)
        secret_levels.append({'lvl': lvl.get('lvl', 1), 'text': lvl.get('text', ''), 'questions': sec_qs})

    profanity_filter = bool(cfg.get('profanity_filter', raw.get('profanity_filter', True)))
    one_attempt_only = bool(cfg.get('one_attempt_only', raw.get('one_attempt_only', True)))
    priv = cfg.get('private') if isinstance(cfg.get('private'), dict) else {}
    top_server_out = cfg.pop('server_data_out', None)

    if mode == 'server':
        out_raw = priv.get('server_data_out') or top_server_out
        default_dir = ctx['build_dir'].parent / 'site_server' / 'server_data'
        out_path = Path(out_raw) if out_raw else (default_dir / 'najdi_to.targets.json')
        out_path.parent.mkdir(parents=True, exist_ok=True)
        htaccess = out_path.parent / '.htaccess'
        if not htaccess.exists():
            htaccess.write_text('Require all denied\nDeny from all\n', encoding='utf-8')
        out_path.write_text(
            json.dumps(
                {
                    'plugin_id': 'najdi_to',
                    'title': raw.get('title', 'Najdeš to?'),
                    'city': ctx['mesto'].get('nazev', 'Izomapa'),
                    'profanity_filter': profanity_filter,
                    'one_attempt_only': one_attempt_only,
                    'levels': secret_levels,
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding='utf-8',
        )
        # Automatické zkopírování PHP serverového adaptéru do site/ (např. site/api/najdi_to.php)
        srv_url = str(cfg.get('server_url') or 'api/najdi_to.php').strip().lstrip('/')
        if srv_url.endswith('.php') and '://' not in srv_url and '..' not in Path(srv_url).parts:
            php_src = ctx['plugin_dir'] / 'server' / 'php' / 'najdi_to.php'
            if php_src.is_file():
                php_dest = ctx['site_dir'] / srv_url
                php_dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(php_src, php_dest)

    out: dict[str, Any] = {
        'title': raw.get('title', 'Najdeš to?'),
        'city': ctx['mesto'].get('nazev', 'Izomapa'),
        'profanity_filter': profanity_filter,
        'one_attempt_only': one_attempt_only,
        'difficulties': raw.get('difficulties', {}),
        'levels': public_levels,
    }
    if raw.get('leaderboard_url') or cfg.get('leaderboard_url'):
        out['leaderboard_url'] = cfg.get('leaderboard_url') or raw.get('leaderboard_url')
    elif mode != 'server' and raw.get('api_url'):
        out['leaderboard_url'] = 'najdi_to_leaderboard.json'
    return out

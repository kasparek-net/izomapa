"""Univerzální zavaděč doplňků a sdílených knihoven pro izomapu."""
from __future__ import annotations

import importlib.util
import json
import shutil
from pathlib import Path
from typing import Any, Callable


def _normalize_entries(raw: Any) -> dict[str, dict[str, Any]]:
    """Normalizuje konfiguraci doplňků (seznam názvů nebo slovník) na {plugin_id: dict}."""
    out: dict[str, dict[str, Any]] = {}
    if isinstance(raw, list):
        for item in raw:
            if isinstance(item, str) and item.strip():
                out[item.strip()] = {'enabled': True}
    elif isinstance(raw, dict):
        for pid, val in raw.items():
            if not isinstance(pid, str) or not pid.strip():
                continue
            if isinstance(val, bool):
                out[pid.strip()] = {'enabled': val}
            elif isinstance(val, dict):
                out[pid.strip()] = dict(val)
    return out


def _installed_plugin_ids(plugins_dir: Path) -> list[str]:
    """Vrátí seznam ID nainstalovaných doplňků v doplnky/ podle manifest.json."""
    if not plugins_dir.is_dir():
        return []
    return [
        entry.name
        for entry in sorted(plugins_dir.iterdir())
        if entry.is_dir() and (entry / 'manifest.json').is_file()
    ]


def _safe_subdir(base_dir: Path, item_id: str) -> Path | None:
    """Vrátí podsložku base_dir/<item_id>, pokud existuje a název neobsahuje přechod cesty."""
    if not item_id or Path(item_id).name != item_id:
        return None
    target = base_dir / item_id
    return target if target.is_dir() else None


def discover_plugin_configs(mesto: dict[str, Any], assets_dir: Path, plugins_dir: Path) -> dict[str, dict[str, Any]]:
    """Určí aktivní doplňky v pořadí: mesto.json -> assets/doplnky.json -> auto-discovery."""
    merged = _normalize_entries(mesto.get('doplnky'))
    cfg_path = assets_dir / 'doplnky.json'

    if cfg_path.is_file():
        file_entries = _normalize_entries(json.loads(cfg_path.read_text(encoding='utf-8')))
        for pid, cfg in file_entries.items():
            merged[pid] = {**merged.get(pid, {}), **cfg}
    else:
        for pid in _installed_plugin_ids(plugins_dir):
            if (assets_dir / 'doplnky' / f'{pid}.json').is_file():
                existing = merged.get(pid, {})
                if existing.get('enabled') is False:
                    continue
                merged[pid] = {'enabled': True, **existing}

    return {pid: cfg for pid, cfg in merged.items() if cfg.get('enabled', True) is True}


def _load_hook(hook_path: Path, plugin_id: str) -> Any:
    """Dynamicky načte Python modul overlay_hook.py bez znečištění sys.modules."""
    spec = importlib.util.spec_from_file_location(f'_izomapa_plugin_{plugin_id}', str(hook_path))
    if spec is None or spec.loader is None:
        raise RuntimeError(f'Nelze načíst hook doplňku {plugin_id}: {hook_path}')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _copy_asset_list(src_dir: Path, dest_dir: Path, url_prefix: str, items: list[str]) -> list[str]:
    """Zkopíruje bezpečné relativní soubory do cílové složky webu a vrátí jejich URL."""
    urls: list[str] = []
    for rel in items:
        rel_path = Path(rel)
        if rel_path.is_absolute() or '..' in rel_path.parts:
            continue
        src = src_dir / rel_path
        if not src.is_file():
            continue
        target = dest_dir / rel_path
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, target)
        urls.append(f'{url_prefix}/{rel.lstrip("./")}')
    return urls


def _collect_plugin_libs(
    requested: list[str],
    libs_dir: Path,
    site_dir: Path,
    copied_libs: dict[str, tuple[list[str], list[str]]],
) -> tuple[list[str], list[str], list[str]]:
    """Zkopíruje vyžádané knihovny (knihovny/<id>/<id>.js|.css) na web nejvýš 1×."""
    lib_ids: list[str] = []
    lib_scripts: list[str] = []
    lib_styles: list[str] = []
    for raw_id in requested:
        lib_id = str(raw_id).strip()
        if not lib_id or lib_id in lib_ids:
            continue
        lib_dir = _safe_subdir(libs_dir, lib_id)
        if lib_dir is None:
            print(f'Varování: knihovna "{lib_id}" nebyla nalezena.')
            continue
        if lib_id not in copied_libs:
            dest = site_dir / 'doplnky' / '_libs' / lib_id
            prefix = f'doplnky/_libs/{lib_id}'
            copied_libs[lib_id] = (
                _copy_asset_list(lib_dir, dest, prefix, [f'{lib_id}.js']),
                _copy_asset_list(lib_dir, dest, prefix, [f'{lib_id}.css']),
            )
        sc, st = copied_libs[lib_id]
        lib_scripts.extend(sc)
        lib_styles.extend(st)
        lib_ids.append(lib_id)
    return lib_ids, lib_scripts, lib_styles


def load_and_run_plugins(
    mesto: dict[str, Any],
    cam: dict[str, Any],
    project_xy: Callable[..., list[float] | tuple[float, float]],
    assets_dir: str | Path = 'assets',
    site_dir: str | Path = 'site',
    build_dir: str | Path = 'build',
    plugins_dir: str | Path = 'doplnky',
    libs_dir: str | Path = 'knihovny',
) -> dict[str, dict[str, Any]]:
    """Spustí aktivní build-time hooky doplňků a vrátí sekci 'doplnky' pro site/overlay.json."""
    assets_p, site_p, build_p = Path(assets_dir), Path(site_dir), Path(build_dir)
    plugins_p, libs_p = Path(plugins_dir), Path(libs_dir)

    active = discover_plugin_configs(mesto, assets_p, plugins_p)
    if not active:
        return {}

    result: dict[str, dict[str, Any]] = {}
    copied_libs: dict[str, tuple[list[str], list[str]]] = {}

    for plugin_id, user_cfg in active.items():
        plugin_dir = _safe_subdir(plugins_p, plugin_id)
        if plugin_dir is None:
            print(f'Varování: složka doplňku "{plugin_id}" nebyla nalezena.')
            continue

        manifest_path = plugin_dir / 'manifest.json'
        manifest = json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.is_file() else {}
        merged_cfg: dict[str, Any] = {**dict(manifest.get('defaults') or {}), **user_cfg}
        ctx: dict[str, Any] = {
            'plugin_id': plugin_id,
            'plugin_config': merged_cfg,
            'mesto': mesto,
            'cam': cam,
            'project_xy': project_xy,
            'assets_dir': assets_p,
            'data_file': assets_p / 'doplnky' / f'{plugin_id}.json',
            'plugin_dir': plugin_dir,
            'site_dir': site_p,
            'build_dir': build_p,
        }

        hook_path = plugin_dir / manifest.get('hook', 'overlay_hook.py')
        public_data: Any = {}
        if hook_path.is_file():
            mod = _load_hook(hook_path, plugin_id)
            if hasattr(mod, 'build_overlay'):
                hook_out = mod.build_overlay(ctx)
                if hook_out is False or hook_out is None:
                    continue
                if isinstance(hook_out, dict):
                    public_data = hook_out

        raw_libs = list(manifest.get('libs') or [])
        if isinstance(merged_cfg.get('libs'), list):
            raw_libs.extend(merged_cfg['libs'])
        lib_ids, lib_scripts, lib_styles = _collect_plugin_libs(raw_libs, libs_p, site_p, copied_libs)

        raw_scripts = manifest['scripts'] if 'scripts' in manifest else (manifest.get('js') or [f'{plugin_id}.js'])
        raw_styles = manifest['styles'] if 'styles' in manifest else (manifest.get('css') or [f'{plugin_id}.css'])
        scripts = _copy_asset_list(plugin_dir, site_p / 'doplnky' / plugin_id, f'doplnky/{plugin_id}', list(raw_scripts or []))
        styles = _copy_asset_list(plugin_dir, site_p / 'doplnky' / plugin_id, f'doplnky/{plugin_id}', list(raw_styles or []))

        public_cfg = {k: v for k, v in merged_cfg.items() if k != 'private'}
        entry: dict[str, Any] = {
            'id': plugin_id,
            'config': public_cfg,
            'scripts': scripts,
            'styles': styles,
            'data': public_data,
        }
        if lib_ids:
            entry['libs'] = lib_ids
            entry['lib_scripts'] = lib_scripts
            entry['lib_styles'] = lib_styles
        result[plugin_id] = entry

    return result

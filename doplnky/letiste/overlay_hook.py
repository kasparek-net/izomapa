"""Letiště (doplněk): z assets/doplnky/letiste.json předá prohlížeči dráhy, stání, místo seskoků a flotilu (lat/lon)."""
from __future__ import annotations

import json
from typing import Any


def build_overlay(ctx: dict[str, Any]) -> dict[str, Any] | bool:
    f = ctx['data_file']
    if not f.is_file():
        return False
    raw = json.loads(f.read_text(encoding='utf-8'))
    if raw.get('enabled', True) is False or not raw.get('drahy') or not raw.get('stani'):
        return False
    return {k: raw[k] for k in ('drahy', 'aktivni', 'stani', 'dz', 'letadla', 'vyska_okruhu') if k in raw}

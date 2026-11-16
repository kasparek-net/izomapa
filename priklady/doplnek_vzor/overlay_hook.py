"""Minimální build-time hook vzorového klientského doplňku."""
from __future__ import annotations

import json
from typing import Any


def build_overlay(ctx: dict[str, Any]) -> dict[str, Any] | bool:
    """Načte assets/doplnky/<id>.json a promítne souřadnice [lat, lon] na pixely mapy."""
    data_file = ctx['data_file']
    if not data_file.is_file():
        return False

    raw = json.loads(data_file.read_text(encoding='utf-8'))
    if raw.get('enabled', True) is False:
        return False

    project_xy = ctx['project_xy']
    points: list[dict[str, Any]] = []
    for p in raw.get('points', []):
        if 'lat' not in p or 'lon' not in p:
            continue
        points.append({
            'id': p.get('id', ''),
            'label': p.get('label', ''),
            'xy': list(project_xy(float(p['lat']), float(p['lon']))),
        })

    return {'title': raw.get('title', 'Vzorový doplněk'), 'points': points}

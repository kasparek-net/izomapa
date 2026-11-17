"""Referenční Python backend adaptér pro doplněk Najdeš to? (HMAC tickety, TOP 10 per level i celkově, filtrace sprostých slov)."""
from __future__ import annotations

import base64
import datetime as dt
import hashlib
import hmac
import json
import math
import random
import re
import secrets
import sqlite3
import time
import unicodedata
from pathlib import Path
from typing import Any


RATE_LIMIT_MS = 300
_LEET_MAP = str.maketrans({'0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i'})
_DEFAULT_PROFANITY = {
    'enabled': True,
    'exact_words': [
        'vul', 'vole', 'blb', 'blbc', 'blbce', 'blbec', 'blbci', 'blbco', 'blbecek',
        'pica', 'pico', 'picu', 'pice', 'picus', 'picov', 'picovat',
        'kunda', 'kundy', 'kundu', 'kundo', 'kundic', 'kundicka',
        'srac', 'debil', 'debilni', 'debile', 'kreten', 'kretene', 'idiot', 'idiote',
        'hajzl', 'hajzle', 'chuj', 'chuje', 'buzna', 'buzny', 'krypl', 'magor',
        'nazi', 'neonazi', 'hitler', 'heil',
        'ass', 'cock', 'cocks', 'dick', 'dicks', 'cunt', 'slut', 'whore', 'twat', 'wank', 'wanker', 'prick',
    ],
    'prefixes': [
        'kurv', 'zkurv', 'vykurv', 'kurev', 'curak', 'curac', 'kokot',
        'zmrd', 'mrda', 'mrdam', 'mrdat', 'mrdal', 'mrdk', 'mrdn', 'omrd', 'vymrd', 'domrd',
        'jebat', 'jebu', 'jebe', 'jebal', 'jebn', 'zjeb', 'vyjeb', 'ojeb', 'pojeb',
        'prdel', 'srack', 'srat', 'posr', 'nasr', 'vysr', 'zasr',
        'sukat', 'sukam', 'sukas', 'vysuk', 'zasuk', 'osuk', 'devk', 'stetk', 'buzer', 'teplous',
        'fuck', 'shit', 'bitch', 'asshole', 'dickhead', 'motherfuck', 'bullshit', 'retard', 'nigger', 'faggot',
    ],
    'compact_phrases': ['kurv', 'curak', 'kokot', 'zmrd', 'prdel', 'srack', 'buzerant', 'hitler', 'fuck', 'nigger', 'faggot'],
    'allow_words': [],
}


def _strip_accents(text: str) -> str:
    return ''.join(ch for ch in unicodedata.normalize('NFKD', text) if not unicodedata.combining(ch))


def contains_profanity(text: str, rules: dict[str, Any] | None = None, enabled: bool = True) -> bool:
    if not enabled:
        return False
    src = rules or _DEFAULT_PROFANITY
    if src.get('enabled') is False:
        return False
    allow = {_strip_accents(str(w).lower()) for w in (src.get('allow_words') or [])}
    exact = {_strip_accents(str(w).lower()) for w in (src.get('exact_words') or [])} - allow
    prefixes = tuple(_strip_accents(str(w).lower()) for w in (src.get('prefixes') or []) if _strip_accents(str(w).lower()) not in allow)
    compact_phrases = tuple(_strip_accents(str(w).lower()) for w in (src.get('compact_phrases') or []))

    for leet in (False, True):
        norm = _strip_accents(str(text or '').lower())
        if leet:
            norm = norm.translate(_LEET_MAP)
        merged = re.sub(r'(?<![a-z0-9])(?:[a-z0-9][\s._*+-]+){2,}[a-z0-9](?![a-z0-9])', lambda m: re.sub(r'[^a-z0-9]', '', m.group(0)), norm)
        for tok in re.findall(r'[a-z0-9]+', merged):
            if tok in allow:
                continue
            collapsed = re.sub(r'(.)\1+', r'\1', tok)
            for cand in (tok, collapsed):
                if cand in allow:
                    continue
                if cand in exact or (prefixes and cand.startswith(prefixes)):
                    return True
        compact = re.sub(r'[^a-z0-9]+', '', norm)
        for cand_compact in (compact, re.sub(r'(.)\1+', r'\1', compact)):
            if any(phrase in cand_compact for phrase in compact_phrases):
                return True
    return False


def load_profanity_rules(targets_file: str | Path | None = None) -> dict[str, Any]:
    if targets_file:
        pf = Path(targets_file).resolve().with_name('profanity.json')
        if pf.is_file():
            return json.loads(pf.read_text(encoding='utf-8'))
    return dict(_DEFAULT_PROFANITY)


def b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b'=').decode('ascii')


def b64url_decode(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + ('=' * (-len(text) % 4)))


def create_ticket(payload: dict[str, Any], secret_key: str) -> str:
    encoded = b64url_encode(json.dumps(payload, separators=(',', ':'), ensure_ascii=False).encode('utf-8'))
    sig = hmac.new(secret_key.encode('utf-8'), encoded.encode('ascii'), hashlib.sha256).hexdigest()
    return f'{encoded}.{sig}'


def verify_ticket(ticket: str, secret_key: str) -> dict[str, Any]:
    if not isinstance(ticket, str) or '.' not in ticket:
        raise ValueError('Neplatný formát ticketu')
    encoded, sig = ticket.split('.', 1)
    expected = hmac.new(secret_key.encode('utf-8'), encoded.encode('ascii'), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        raise ValueError('Neplatný HMAC podpis ticketu')
    return json.loads(b64url_decode(encoded).decode('utf-8'))


def compute_audit_hash(client_ip: str, secret_key: str, when: dt.date | None = None) -> str:
    ref = when or dt.datetime.now(dt.timezone.utc).date()
    y, w, _ = ref.isocalendar()
    return hmac.new(secret_key.encode('utf-8'), f'{client_ip}|{y:04d}-{w:02d}'.encode('utf-8'), hashlib.sha256).hexdigest()[:12]


def _point_in_polygon(x: float, y: float, pts: list[list[float]]) -> bool:
    inside = False
    j = len(pts) - 1
    for i, p in enumerate(pts):
        xi, yi = p[0], p[1]
        xj, yj = pts[j][0], pts[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def match_question_xy(q: dict[str, Any], x: float, y: float) -> dict[str, float] | None:
    r_px = float(q.get('radius_px') or 175.0)
    if isinstance(q.get('xy'), list) and len(q['xy']) >= 2 and math.hypot(x - q['xy'][0], y - q['xy'][1]) <= r_px:
        return {'x': q['xy'][0], 'y': q['xy'][1]}
    for t in q.get('targets') or []:
        if t.get('type') == 'point' and math.hypot(x - t['xy'][0], y - t['xy'][1]) <= float(t.get('radius_px') or r_px):
            return {'x': t['xy'][0], 'y': t['xy'][1]}
        if t.get('type') == 'polygon' and len(t.get('points') or []) >= 3 and _point_in_polygon(x, y, t['points']):
            pts = t['points']
            return {'x': round(sum(p[0] for p in pts) / len(pts), 1), 'y': round(sum(p[1] for p in pts) / len(pts), 1)}
    return None


def _init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS najdi_to_scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            nickname TEXT NOT NULL,
            total_time_ms INTEGER NOT NULL,
            difficulty TEXT NOT NULL,
            season TEXT NOT NULL,
            certificate_id TEXT NOT NULL,
            audit_hash TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_nt_time ON najdi_to_scores(total_time_ms);

        CREATE TABLE IF NOT EXISTS najdi_to_level_scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            lvl TEXT NOT NULL,
            nickname TEXT NOT NULL,
            time_ms INTEGER NOT NULL,
            difficulty TEXT NOT NULL,
            season TEXT NOT NULL,
            audit_hash TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_nt_lvl_time ON najdi_to_level_scores(lvl, time_ms);

        CREATE TABLE IF NOT EXISTS najdi_to_used_tickets (
            ticket_key TEXT PRIMARY KEY,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        """
    )


def _ticket_jti(p: dict[str, Any]) -> str:
    if p.get('jti'):
        return str(p['jti'])
    raw = f"{p.get('lvl', '')}|{p.get('t0', '')}|{p.get('el', '')}|{p.get('diff', '')}"
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()[:16]


def _top10_overall(conn: sqlite3.Connection, profanity_rules: dict[str, Any] | None, profanity_enabled: bool) -> list[dict[str, Any]]:
    rows = conn.execute(
        'SELECT nickname, total_time_ms, difficulty, season, certificate_id, created_at FROM najdi_to_scores ORDER BY total_time_ms ASC, created_at ASC LIMIT 50'
    ).fetchall()
    return [
        {'nickname': r[0], 'totalTimeMs': r[1], 'difficulty': r[2], 'season': r[3], 'certificateId': r[4], 'createdAt': r[5]}
        for r in rows
        if not contains_profanity(r[0], profanity_rules, enabled=profanity_enabled)
    ][:10]


def _top10_level(conn: sqlite3.Connection, lvl_id: str, profanity_rules: dict[str, Any] | None, profanity_enabled: bool) -> list[dict[str, Any]]:
    rows = conn.execute(
        'SELECT lvl, nickname, time_ms, difficulty, season, created_at FROM najdi_to_level_scores WHERE lvl = ? ORDER BY time_ms ASC, created_at ASC LIMIT 50',
        (lvl_id,),
    ).fetchall()
    return [
        {'lvl': r[0], 'nickname': r[1], 'timeMs': r[2], 'difficulty': r[3], 'season': r[4], 'createdAt': r[5]}
        for r in rows
        if not contains_profanity(r[1], profanity_rules, enabled=profanity_enabled)
    ][:10]


def handle_action(
    data: dict[str, Any],
    targets_data: dict[str, Any],
    conn: sqlite3.Connection,
    secret_key: str,
    client_ip: str = '127.0.0.1',
    now_ms: int | None = None,
    profanity_rules: dict[str, Any] | None = None,
) -> tuple[int, dict[str, Any]]:
    _init_db(conn)
    ts = int(time.time() * 1000) if now_ms is None else int(now_ms)
    action = str(data.get('action') or '')
    profanity_enabled = bool(targets_data.get('profanity_filter', True))
    one_attempt_only = bool(targets_data.get('one_attempt_only', True))

    def find_level(lid: Any) -> dict[str, Any] | None:
        return next((l for l in (targets_data.get('levels') or []) if str(l.get('lvl')) == str(lid)), None)

    if action == 'start':
        lvl = find_level(data.get('levelId'))
        if lvl is None:
            return 404, {'error': 'unknown_level'}
        qs = lvl.get('questions') or []
        order = list(range(len(qs)))
        random.shuffle(order)
        payload = {
            'jti': secrets.token_hex(8),
            'lvl': str(lvl['lvl']),
            'diff': str(data.get('difficulty') or 'easy')[:32],
            'season': str(data.get('season') or 'summer')[:16],
            'ord': order,
            'step': 0,
            'miss': 0,
            't0': ts,
            'tl': ts,
            'done': False,
            'el': 0,
        }
        return 200, {'order': order, 'questionIds': [qs[i].get('id', '') for i in order], 'ticket': create_ticket(payload, secret_key)}

    if action == 'verify':
        try:
            payload = verify_ticket(str(data.get('ticket') or ''), secret_key)
        except ValueError:
            return 403, {'error': 'invalid_ticket'}
        if payload.get('done'):
            return 400, {'error': 'already_done'}
        if ts - int(payload.get('tl', 0)) < RATE_LIMIT_MS:
            return 429, {'error': 'rate_limit'}
        lvl = find_level(payload.get('lvl'))
        if lvl is None:
            return 404, {'error': 'unknown_level'}
        qs = lvl['questions']
        step = int(payload['step'])
        q = qs[payload['ord'][step]]
        hit_pt = match_question_xy(q, float(data.get('x', -1e9)), float(data.get('y', -1e9)))
        payload['tl'] = ts
        if hit_pt is None:
            payload['miss'] = int(payload.get('miss', 0)) + 1
            return 200, {'hit': False, 'completed': False, 'ticket': create_ticket(payload, secret_key)}
        step += 1
        payload['step'] = step
        elapsed = max(1, ts - int(payload['t0']))
        if step >= len(payload['ord']):
            payload['done'] = True
            payload['el'] = elapsed
        return 200, {
            'hit': True,
            'completed': bool(payload['done']),
            'elapsedMs': elapsed,
            'targetHint': hit_pt,
            'answer': q.get('answer', ''),
            'ticket': create_ticket(payload, secret_key),
        }

    if action == 'submit_level':
        try:
            p = verify_ticket(str(data.get('ticket') or ''), secret_key)
        except ValueError:
            return 403, {'error': 'invalid_ticket'}
        if not p.get('done'):
            return 400, {'error': 'incomplete_level'}
        lid = str(p.get('lvl') or '')
        if find_level(lid) is None:
            return 404, {'error': 'unknown_level'}
        nick = str(data.get('nickname') or '').strip()[:50]
        if not nick:
            return 400, {'error': 'missing_nickname', 'message': 'Zadejte prosím svou přezdívku.'}
        if contains_profanity(nick, profanity_rules, enabled=profanity_enabled):
            return 400, {'error': 'profanity_nickname', 'message': 'Přezdívka obsahuje nevhodný výraz. Zadejte prosím jinou přezdívku.'}
        time_ms = max(1, int(p.get('el', 0)))
        ah = compute_audit_hash(client_ip, secret_key)
        ticket_key = f'lvl:{lid}:{_ticket_jti(p)}'
        dup_ticket = conn.execute('SELECT 1 FROM najdi_to_used_tickets WHERE ticket_key = ? LIMIT 1', (ticket_key,)).fetchone() is not None
        dup_player = one_attempt_only and (
            conn.execute('SELECT 1 FROM najdi_to_level_scores WHERE lvl = ? AND audit_hash = ? LIMIT 1', (lid, ah)).fetchone() is not None
        )
        if dup_ticket or dup_player:
            return 200, {
                'saved': False,
                'alreadyPlayed': True,
                'message': 'Do žebříčku se započítává pouze první pokus. Tento výsledek nebyl zapsán.',
                'levelId': lid,
                'timeMs': time_ms,
                'rank': None,
                'entries': _top10_level(conn, lid, profanity_rules, profanity_enabled),
            }
        conn.execute('INSERT INTO najdi_to_used_tickets (ticket_key) VALUES (?)', (ticket_key,))
        conn.execute(
            'INSERT INTO najdi_to_level_scores (lvl, nickname, time_ms, difficulty, season, audit_hash) VALUES (?, ?, ?, ?, ?, ?)',
            (lid, nick, time_ms, p.get('diff', 'easy'), p.get('season', 'summer'), ah),
        )
        conn.commit()
        rank = conn.execute('SELECT COUNT(*) FROM najdi_to_level_scores WHERE lvl = ? AND time_ms < ?', (lid, time_ms)).fetchone()[0] + 1
        return 200, {
            'saved': True,
            'levelId': lid,
            'timeMs': time_ms,
            'rank': rank,
            'entries': _top10_level(conn, lid, profanity_rules, profanity_enabled),
        }

    if action == 'finish':
        tickets = data.get('tickets') or []
        req = {str(l['lvl']) for l in (targets_data.get('levels') or [])}
        verified: dict[str, dict[str, Any]] = {}
        for t in tickets:
            try:
                p = verify_ticket(str(t), secret_key)
            except ValueError:
                return 403, {'error': 'invalid_ticket'}
            if not p.get('done') or str(p['lvl']) in verified:
                return 400, {'error': 'invalid_finish'}
            verified[str(p['lvl'])] = p
        if set(verified.keys()) != req:
            return 400, {'error': 'missing_levels'}
        nick = (str(data.get('nickname') or '').strip() or 'Anonymní hledač')[:50]
        if contains_profanity(nick, profanity_rules, enabled=profanity_enabled):
            return 400, {'error': 'profanity_nickname', 'message': 'Přezdívka obsahuje nevhodný výraz. Zadejte prosím jinou přezdívku.'}
        total_ms = sum(max(1, int(p['el'])) for p in verified.values())
        ah = compute_audit_hash(client_ip, secret_key)
        finish_keys = [f'fin:{lid}:{_ticket_jti(p)}' for lid, p in verified.items()]
        dup_ticket = any(
            conn.execute('SELECT 1 FROM najdi_to_used_tickets WHERE ticket_key = ? LIMIT 1', (fk,)).fetchone() is not None
            for fk in finish_keys
        )
        existing_row = (
            conn.execute('SELECT certificate_id FROM najdi_to_scores WHERE audit_hash = ? ORDER BY id ASC LIMIT 1', (ah,)).fetchone()
            if one_attempt_only
            else None
        )
        if dup_ticket or existing_row is not None:
            return 200, {
                'saved': False,
                'alreadyPlayed': True,
                'message': 'Do celkového žebříčku se započítává pouze první pokus. Tento výsledek nebyl zapsán.',
                'totalTimeMs': total_ms,
                'rank': None,
                'certificateId': existing_row[0] if existing_row else '',
            }
        cert_id = hmac.new(secret_key.encode('utf-8'), f'{nick}:{total_ms}:{ah}:{ts}'.encode('utf-8'), hashlib.sha256).hexdigest()[:6].upper()
        last_p = next(reversed(verified.values()))
        for fk in finish_keys:
            conn.execute('INSERT INTO najdi_to_used_tickets (ticket_key) VALUES (?)', (fk,))
        conn.execute(
            'INSERT INTO najdi_to_scores (nickname, total_time_ms, difficulty, season, certificate_id, audit_hash) VALUES (?, ?, ?, ?, ?, ?)',
            (nick, total_ms, last_p.get('diff', 'easy'), last_p.get('season', 'summer'), cert_id, ah),
        )
        conn.commit()
        rank = conn.execute('SELECT COUNT(*) FROM najdi_to_scores WHERE total_time_ms < ?', (total_ms,)).fetchone()[0] + 1
        return 200, {'saved': True, 'totalTimeMs': total_ms, 'rank': rank, 'certificateId': cert_id}

    if action == 'leaderboard':
        overall = _top10_overall(conn, profanity_rules, profanity_enabled)
        levels_out = {
            str(l['lvl']): _top10_level(conn, str(l['lvl']), profanity_rules, profanity_enabled)
            for l in (targets_data.get('levels') or [])
            if str(l.get('lvl') or '') != ''
        }
        req_lvl = str(data.get('levelId') or '')
        entries = levels_out.get(req_lvl, []) if (req_lvl and req_lvl != 'all') else overall
        return 200, {'entries': entries, 'overall': overall, 'levels': levels_out}

    return 400, {'error': 'unknown_action'}

<?php
/**
 * Backend adaptér pro hru "Najdeš to?" (PHP + SQLite + JSON fallback + HMAC tickety).
 * Podporuje filtraci sprostých slov (profanity.json / vestavěný seznam),
 * automatický zápis přezdívky a TOP 10 žebříčky pro každý level i celkově.
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

function nt_clip(string $s, int $max): string {
    return function_exists('mb_substr') ? mb_substr($s, 0, $max, 'UTF-8') : substr($s, 0, $max);
}

function nt_strip_accents(string $s): string {
    static $map = [
        'Á'=>'a','Ä'=>'a','Č'=>'c','Ď'=>'d','É'=>'e','Ě'=>'e','Ë'=>'e','Í'=>'i','Ň'=>'n','Ó'=>'o','Ö'=>'o','Ř'=>'r','Š'=>'s','Ť'=>'t','Ú'=>'u','Ů'=>'u','Ü'=>'u','Ý'=>'y','Ž'=>'z',
        'á'=>'a','ä'=>'a','č'=>'c','ď'=>'d','é'=>'e','ě'=>'e','ë'=>'e','í'=>'i','ň'=>'n','ó'=>'o','ö'=>'o','ř'=>'r','š'=>'s','ť'=>'t','ú'=>'u','ů'=>'u','ü'=>'u','ý'=>'y','ž'=>'z',
    ];
    $s = strtr($s, $map);
    return function_exists('mb_strtolower') ? mb_strtolower($s, 'UTF-8') : strtolower($s);
}

function nt_default_profanity(): array {
    return [
        'enabled' => true,
        'exact_words' => [
            'vul','vole','blb','blbc','blbce','blbec','blbci','blbco','blbecek',
            'pica','pico','picu','pice','picus','picov','picovat',
            'kunda','kundy','kundu','kundo','kundic','kundicka',
            'srac','debil','debilni','debile','kreten','kretene','idiot','idiote',
            'hajzl','hajzle','chuj','chuje','buzna','buzny','krypl','magor',
            'nazi','neonazi','hitler','heil',
            'ass','cock','cocks','dick','dicks','cunt','slut','whore','twat','wank','wanker','prick',
        ],
        'prefixes' => [
            'kurv','zkurv','vykurv','kurev','curak','curac','kokot',
            'zmrd','mrda','mrdam','mrdat','mrdal','mrdk','mrdn','omrd','vymrd','domrd',
            'jebat','jebu','jebe','jebal','jebn','zjeb','vyjeb','ojeb','pojeb',
            'prdel','srack','srat','posr','nasr','vysr','zasr',
            'sukat','sukam','sukas','vysuk','zasuk','osuk','devk','stetk','buzer','teplous',
            'fuck','shit','bitch','asshole','dickhead','motherfuck','bullshit','retard','nigger','faggot',
        ],
        'compact_phrases' => ['kurv','curak','kokot','zmrd','prdel','srack','buzerant','hitler','fuck','nigger','faggot'],
        'allow_words' => [],
    ];
}

function nt_load_profanity_rules(?string $targetsFile = null): array {
    if ($targetsFile !== null && $targetsFile !== '') {
        $pf = dirname($targetsFile) . '/profanity.json';
        if (is_file($pf)) {
            $parsed = json_decode((string)file_get_contents($pf), true);
            if (is_array($parsed)) return $parsed;
        }
    }
    return nt_default_profanity();
}

function nt_contains_profanity(string $text, ?array $rules = null, bool $enabled = true): bool {
    if (!$enabled) return false;
    $src = $rules ?? nt_default_profanity();
    if (($src['enabled'] ?? true) === false) return false;
    $allow = array_flip(array_map('nt_strip_accents', $src['allow_words'] ?? []));
    $exact = [];
    foreach ($src['exact_words'] ?? [] as $w) {
        $nw = nt_strip_accents((string)$w);
        if ($nw !== '' && !isset($allow[$nw])) $exact[$nw] = true;
    }
    $prefixes = [];
    foreach ($src['prefixes'] ?? [] as $p) {
        $np = nt_strip_accents((string)$p);
        if ($np !== '' && !isset($allow[$np])) $prefixes[] = $np;
    }
    $compactPhrases = array_values(array_filter(array_map('nt_strip_accents', $src['compact_phrases'] ?? [])));

    $leetMap = ['0'=>'o','1'=>'i','3'=>'e','4'=>'a','5'=>'s','7'=>'t','@'=>'a','$'=>'s','!'=>'i'];
    foreach ([false, true] as $leet) {
        $norm = nt_strip_accents($text);
        if ($leet) $norm = strtr($norm, $leetMap);
        $merged = preg_replace_callback('/(?<![a-z0-9])(?:[a-z0-9][\s._*+-]+){2,}[a-z0-9](?![a-z0-9])/', static fn($m) => preg_replace('/[^a-z0-9]/', '', $m[0]), $norm);
        preg_match_all('/[a-z0-9]+/', $merged ?? $norm, $matches);
        foreach ($matches[0] as $tok) {
            if (isset($allow[$tok])) continue;
            $collapsed = preg_replace('/(.)\1+/', '$1', $tok) ?? $tok;
            foreach ([$tok, $collapsed] as $cand) {
                if (isset($allow[$cand])) continue;
                if (isset($exact[$cand])) return true;
                foreach ($prefixes as $pref) {
                    if (str_starts_with($cand, $pref)) return true;
                }
            }
        }
        $compact = preg_replace('/[^a-z0-9]+/', '', $norm) ?? '';
        $compactCollapsed = preg_replace('/(.)\1+/', '$1', $compact) ?? $compact;
        foreach ([$compact, $compactCollapsed] as $cc) {
            foreach ($compactPhrases as $phrase) {
                if ($phrase !== '' && str_contains($cc, $phrase)) return true;
            }
        }
    }
    return false;
}

function nt_b64url_encode(string $raw): string {
    return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
}

function nt_b64url_decode(string $text): string {
    $pad = strlen($text) % 4;
    if ($pad > 0) $text .= str_repeat('=', 4 - $pad);
    $decoded = base64_decode(strtr($text, '-_', '+/'), true);
    if ($decoded === false) throw new InvalidArgumentException('Neplatné base64url');
    return $decoded;
}

function nt_create_ticket(array $payload, string $secretKey): string {
    $encoded = nt_b64url_encode(json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    return $encoded . '.' . hash_hmac('sha256', $encoded, $secretKey);
}

function nt_verify_ticket(string $ticket, string $secretKey): array {
    $parts = explode('.', $ticket, 2);
    if (count($parts) !== 2) throw new InvalidArgumentException('Neplatný formát ticketu');
    [$encoded, $sig] = $parts;
    $expected = hash_hmac('sha256', $encoded, $secretKey);
    if (!hash_equals($expected, $sig)) throw new InvalidArgumentException('Neplatný HMAC podpis ticketu');
    $payload = json_decode(nt_b64url_decode($encoded), true);
    if (!is_array($payload)) throw new InvalidArgumentException('Neplatný payload ticketu');
    return $payload;
}

function nt_audit_hash(string $clientIp, string $secretKey, ?int $timestampSec = null): string {
    $ts = $timestampSec ?? time();
    return substr(hash_hmac('sha256', $clientIp . '|' . gmdate('o-W', $ts), $secretKey), 0, 12);
}

function nt_client_ip(): string {
    if (!empty($_SERVER['HTTP_CF_CONNECTING_IP'])) return trim((string)$_SERVER['HTTP_CF_CONNECTING_IP']);
    if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) return trim(explode(',', (string)$_SERVER['HTTP_X_FORWARDED_FOR'])[0]);
    return trim((string)($_SERVER['REMOTE_ADDR'] ?? '127.0.0.1'));
}

function nt_point_in_polygon(float $x, float $y, array $pts): bool {
    $inside = false;
    $n = count($pts);
    for ($i = 0, $j = $n - 1; $i < $n; $j = $i++) {
        $xi = (float)$pts[$i][0]; $yi = (float)$pts[$i][1];
        $xj = (float)$pts[$j][0]; $yj = (float)$pts[$j][1];
        if ((($yi > $y) !== ($yj > $y)) && ($x < ($xj - $xi) * ($y - $yi) / (($yj - $yi) ?: 1e-9) + $xi)) $inside = !$inside;
    }
    return $inside;
}

function nt_match_question(array $q, float $x, float $y): ?array {
    $rPx = (float)($q['radius_px'] ?? 175.0);
    if (isset($q['xy']) && is_array($q['xy']) && count($q['xy']) >= 2) {
        if (hypot($x - (float)$q['xy'][0], $y - (float)$q['xy'][1]) <= $rPx) {
            return ['x' => (float)$q['xy'][0], 'y' => (float)$q['xy'][1]];
        }
    }
    foreach ($q['targets'] ?? [] as $t) {
        $type = $t['type'] ?? '';
        if ($type === 'point' && isset($t['xy']) && hypot($x - (float)$t['xy'][0], $y - (float)$t['xy'][1]) <= (float)($t['radius_px'] ?? $rPx)) {
            return ['x' => (float)$t['xy'][0], 'y' => (float)$t['xy'][1]];
        }
        if ($type === 'polygon' && !empty($t['points']) && count($t['points']) >= 3 && nt_point_in_polygon($x, $y, $t['points'])) {
            $cx = array_sum(array_column($t['points'], 0)) / count($t['points']);
            $cy = array_sum(array_column($t['points'], 1)) / count($t['points']);
            return ['x' => round($cx, 1), 'y' => round($cy, 1)];
        }
    }
    return null;
}

function nt_open_store(string $dbPath): PDO|string {
    if (class_exists('PDO') && in_array('sqlite', PDO::getAvailableDrivers(), true)) {
        $pdo = new PDO('sqlite:' . $dbPath);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS najdi_to_scores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                nickname TEXT NOT NULL,
                total_time_ms INTEGER NOT NULL,
                difficulty TEXT NOT NULL,
                season TEXT NOT NULL,
                certificate_id TEXT NOT NULL,
                audit_hash TEXT NOT NULL,
                levels_json TEXT
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

            CREATE TABLE IF NOT EXISTS najdi_to_audit (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                event TEXT NOT NULL,
                lvl TEXT DEFAULT '',
                total_time_ms INTEGER DEFAULT 0,
                difficulty TEXT DEFAULT '',
                nickname TEXT DEFAULT '',
                audit_hash TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_nt_audit_created ON najdi_to_audit(created_at);

            CREATE TABLE IF NOT EXISTS najdi_to_used_tickets (
                ticket_key TEXT PRIMARY KEY,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        ");
        $pdo->exec("DELETE FROM najdi_to_audit WHERE created_at < datetime('now', '-14 days')");
        return $pdo;
    }
    return $dbPath . '.json';
}

function nt_json_update(string $path, callable $mutator) {
    $fp = fopen($path, 'c+');
    flock($fp, LOCK_EX);
    $raw = stream_get_contents($fp);
    $empty = ['scores' => [], 'level_scores' => [], 'audit' => [], 'used_tickets' => []];
    $state = $raw ? (json_decode($raw, true) ?: $empty) : $empty;
    $state += $empty;
    $cutoff = gmdate('Y-m-d H:i:s', time() - 14 * 86400);
    $state['audit'] = array_values(array_filter($state['audit'], static fn($r) => ($r['createdAt'] ?? '') >= $cutoff));
    $res = $mutator($state);
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($state, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    flock($fp, LOCK_UN);
    fclose($fp);
    return $res;
}

function nt_log_audit(PDO|string $store, array $row): void {
    if ($store instanceof PDO) {
        $store->prepare('INSERT INTO najdi_to_audit (event, lvl, total_time_ms, difficulty, nickname, audit_hash) VALUES (?, ?, ?, ?, ?, ?)')
            ->execute([$row['event'], $row['lvl'], $row['totalTimeMs'], $row['difficulty'], $row['nickname'] ?? '', $row['auditHash']]);
        return;
    }
    nt_json_update($store, static function (&$state) use ($row): void {
        $state['audit'][] = $row;
    });
}

function nt_top10_overall(PDO|string $store, ?array $profanityRules, bool $profanityEnabled): array {
    if ($store instanceof PDO) {
        $rows = $store->query('SELECT nickname, total_time_ms AS totalTimeMs, difficulty, season, certificate_id AS certificateId, created_at AS createdAt FROM najdi_to_scores ORDER BY total_time_ms ASC, created_at ASC LIMIT 50')->fetchAll(PDO::FETCH_ASSOC);
    } else {
        $dataJson = is_file($store) ? (json_decode((string)file_get_contents($store), true) ?: []) : [];
        $rows = $dataJson['scores'] ?? [];
        usort($rows, static fn($a, $b) => ((int)$a['totalTimeMs'] <=> (int)$b['totalTimeMs']) ?: strcmp((string)$a['createdAt'], (string)$b['createdAt']));
        $rows = array_map(static fn($r) => [
            'nickname'      => $r['nickname'],
            'totalTimeMs'   => (int)$r['totalTimeMs'],
            'difficulty'    => $r['difficulty'],
            'season'        => $r['season'],
            'certificateId' => $r['certificateId'],
            'createdAt'     => $r['createdAt'],
        ], array_slice($rows, 0, 50));
    }
    return array_slice(array_values(array_filter(
        $rows,
        static fn($r) => !nt_contains_profanity((string)($r['nickname'] ?? ''), $profanityRules, $profanityEnabled)
    )), 0, 10);
}

function nt_top10_level(PDO|string $store, string $lvlId, ?array $profanityRules, bool $profanityEnabled): array {
    if ($store instanceof PDO) {
        $stmt = $store->prepare('SELECT lvl, nickname, time_ms AS timeMs, difficulty, season, created_at AS createdAt FROM najdi_to_level_scores WHERE lvl = ? ORDER BY time_ms ASC, created_at ASC LIMIT 50');
        $stmt->execute([$lvlId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } else {
        $dataJson = is_file($store) ? (json_decode((string)file_get_contents($store), true) ?: []) : [];
        $rows = array_values(array_filter($dataJson['level_scores'] ?? [], static fn($r) => (string)($r['lvl'] ?? '') === $lvlId));
        usort($rows, static fn($a, $b) => ((int)$a['timeMs'] <=> (int)$b['timeMs']) ?: strcmp((string)$a['createdAt'], (string)$b['createdAt']));
        $rows = array_map(static fn($r) => [
            'lvl'        => (string)$r['lvl'],
            'nickname'   => $r['nickname'],
            'timeMs'     => (int)$r['timeMs'],
            'difficulty' => $r['difficulty'],
            'season'     => $r['season'],
            'createdAt'  => $r['createdAt'],
        ], array_slice($rows, 0, 50));
    }
    return array_slice(array_values(array_filter(
        $rows,
        static fn($r) => !nt_contains_profanity((string)($r['nickname'] ?? ''), $profanityRules, $profanityEnabled)
    )), 0, 10);
}

function nt_ticket_jti(array $p): string {
    if (!empty($p['jti'])) return (string)$p['jti'];
    return substr(hash('sha256', ($p['lvl'] ?? '') . '|' . ($p['t0'] ?? '') . '|' . ($p['el'] ?? '') . '|' . ($p['diff'] ?? '')), 0, 16);
}

function nt_handle_request(array $data, array $targetsData, PDO|string $dbPathOrPdo, string $secretKey, string $clientIp, ?int $nowMs = null, ?array $profanityRules = null): array {
    $ts = $nowMs ?? (int)round(microtime(true) * 1000);
    $action = (string)($data['action'] ?? '');
    $profanityEnabled = (bool)($targetsData['profanity_filter'] ?? true);
    $oneAttemptOnly = (bool)($targetsData['one_attempt_only'] ?? true);

    $findLevel = static function ($lvlId) use ($targetsData): ?array {
        foreach ($targetsData['levels'] ?? [] as $lvl) {
            if ((string)($lvl['lvl'] ?? '') === (string)$lvlId) return $lvl;
        }
        return null;
    };

    if ($action === 'start') {
        $lvl = $findLevel($data['levelId'] ?? '');
        if ($lvl === null) return [404, ['error' => 'unknown_level', 'message' => 'Úroveň neexistuje']];
        $qs = $lvl['questions'] ?? [];
        $order = count($qs) > 0 ? range(0, count($qs) - 1) : [];
        shuffle($order);
        $payload = [
            'jti'    => bin2hex(random_bytes(8)),
            'lvl'    => (string)$lvl['lvl'],
            'diff'   => nt_clip((string)($data['difficulty'] ?? 'easy'), 32),
            'season' => nt_clip((string)($data['season'] ?? 'summer'), 16),
            'ord'    => $order,
            'step'   => 0,
            'miss'   => 0,
            't0'     => $ts,
            'tl'     => $ts,
            'done'   => false,
            'el'     => 0,
        ];
        $qIds = array_map(static fn($i) => $qs[$i]['id'] ?? '', $order);
        return [200, ['order' => $order, 'questionIds' => $qIds, 'ticket' => nt_create_ticket($payload, $secretKey)]];
    }

    if ($action === 'verify') {
        try {
            $payload = nt_verify_ticket((string)($data['ticket'] ?? ''), $secretKey);
        } catch (Throwable $e) {
            return [403, ['error' => 'invalid_ticket', 'message' => $e->getMessage()]];
        }
        if (!empty($payload['done'])) return [400, ['error' => 'already_done', 'message' => 'Úroveň je již dokončená']];
        if ($ts - (int)($payload['tl'] ?? 0) < 300) return [429, ['error' => 'rate_limit', 'message' => 'Příliš rychlé klikání']];
        $lvl = $findLevel($payload['lvl'] ?? '');
        if ($lvl === null) return [404, ['error' => 'unknown_level', 'message' => 'Úroveň neexistuje']];
        $qs = $lvl['questions'] ?? [];
        $ord = $payload['ord'] ?? [];
        $step = (int)($payload['step'] ?? 0);
        if ($step < 0 || $step >= count($ord)) return [400, ['error' => 'invalid_step', 'message' => 'Neplatný krok']];
        $q = $qs[$ord[$step]];
        $hitPt = nt_match_question($q, (float)($data['x'] ?? -1e9), (float)($data['y'] ?? -1e9));
        $payload['tl'] = $ts;

        if ($hitPt === null) {
            $payload['miss'] = (int)($payload['miss'] ?? 0) + 1;
            return [200, ['hit' => false, 'completed' => false, 'ticket' => nt_create_ticket($payload, $secretKey)]];
        }

        $step++;
        $payload['step'] = $step;
        $elapsed = max(1, $ts - (int)($payload['t0'] ?? $ts));
        if ($step >= count($ord)) {
            $payload['done'] = true;
            $payload['el'] = $elapsed;
            $store = $dbPathOrPdo instanceof PDO ? $dbPathOrPdo : nt_open_store($dbPathOrPdo);
            nt_log_audit($store, [
                'event'       => 'level_complete',
                'lvl'         => (string)$payload['lvl'],
                'totalTimeMs' => $elapsed,
                'difficulty'  => (string)($payload['diff'] ?? 'easy'),
                'auditHash'   => nt_audit_hash($clientIp, $secretKey, intdiv($ts, 1000)),
                'createdAt'   => gmdate('Y-m-d H:i:s', intdiv($ts, 1000)),
            ]);
        }
        return [200, [
            'hit'        => true,
            'completed'  => (bool)$payload['done'],
            'elapsedMs'  => $elapsed,
            'targetHint' => $hitPt,
            'answer'     => $q['answer'] ?? '',
            'ticket'     => nt_create_ticket($payload, $secretKey),
        ]];
    }

    $store = $dbPathOrPdo instanceof PDO ? $dbPathOrPdo : nt_open_store($dbPathOrPdo);

    if ($action === 'submit_level') {
        try {
            $p = nt_verify_ticket((string)($data['ticket'] ?? ''), $secretKey);
        } catch (Throwable $e) {
            return [403, ['error' => 'invalid_ticket', 'message' => $e->getMessage()]];
        }
        if (empty($p['done'])) return [400, ['error' => 'incomplete_level', 'message' => 'Úroveň není dokončená']];
        $lid = (string)($p['lvl'] ?? '');
        if ($findLevel($lid) === null) return [404, ['error' => 'unknown_level', 'message' => 'Úroveň neexistuje']];

        $nickname = nt_clip(trim((string)($data['nickname'] ?? '')), 50);
        if ($nickname === '') {
            return [400, ['error' => 'missing_nickname', 'message' => 'Zadejte prosím svou přezdívku.']];
        }
        if (nt_contains_profanity($nickname, $profanityRules, $profanityEnabled)) {
            return [400, ['error' => 'profanity_nickname', 'message' => 'Přezdívka obsahuje nevhodný výraz. Zadejte prosím jinou přezdívku.']];
        }

        $timeMs = max(1, (int)($p['el'] ?? 0));
        $diff = (string)($p['diff'] ?? 'easy');
        $season = (string)($p['season'] ?? 'summer');
        $auditHash = nt_audit_hash($clientIp, $secretKey, intdiv($ts, 1000));
        $createdAt = gmdate('Y-m-d H:i:s', intdiv($ts, 1000));
        $ticketKey = 'lvl:' . $lid . ':' . nt_ticket_jti($p);

        $alreadyPlayed = false;
        $rank = null;
        if ($store instanceof PDO) {
            $store->beginTransaction();
            try {
                $tkStmt = $store->prepare('SELECT 1 FROM najdi_to_used_tickets WHERE ticket_key = ? LIMIT 1');
                $tkStmt->execute([$ticketKey]);
                $dupTicket = (bool)$tkStmt->fetchColumn();
                $dupPlayer = false;
                if ($oneAttemptOnly) {
                    $plStmt = $store->prepare('SELECT 1 FROM najdi_to_level_scores WHERE lvl = ? AND audit_hash = ? LIMIT 1');
                    $plStmt->execute([$lid, $auditHash]);
                    $dupPlayer = (bool)$plStmt->fetchColumn();
                }
                if ($dupTicket || $dupPlayer) {
                    $alreadyPlayed = true;
                } else {
                    $store->prepare('INSERT INTO najdi_to_used_tickets (ticket_key) VALUES (?)')->execute([$ticketKey]);
                    $store->prepare('INSERT INTO najdi_to_level_scores (lvl, nickname, time_ms, difficulty, season, audit_hash) VALUES (?, ?, ?, ?, ?, ?)')
                        ->execute([$lid, $nickname, $timeMs, $diff, $season, $auditHash]);
                    $store->prepare('INSERT INTO najdi_to_audit (event, lvl, total_time_ms, difficulty, nickname, audit_hash) VALUES (?, ?, ?, ?, ?, ?)')
                        ->execute(['level_submit', $lid, $timeMs, $diff, $nickname, $auditHash]);
                    $rankStmt = $store->prepare('SELECT COUNT(*) FROM najdi_to_level_scores WHERE lvl = ? AND time_ms < ?');
                    $rankStmt->execute([$lid, $timeMs]);
                    $rank = (int)$rankStmt->fetchColumn() + 1;
                }
                $store->commit();
            } catch (Throwable $e) {
                if ($store->inTransaction()) $store->rollBack();
                throw $e;
            }
        } else {
            $res = nt_json_update($store, static function (&$state) use ($lid, $nickname, $timeMs, $diff, $season, $auditHash, $createdAt, $ticketKey, $oneAttemptOnly): array {
                $dupTicket = in_array($ticketKey, $state['used_tickets'], true);
                $dupPlayer = $oneAttemptOnly && !empty(array_filter(
                    $state['level_scores'],
                    static fn($r) => (string)($r['lvl'] ?? '') === $lid && (string)($r['auditHash'] ?? '') === $auditHash
                ));
                if ($dupTicket || $dupPlayer) {
                    return ['alreadyPlayed' => true, 'rank' => null];
                }
                $state['used_tickets'][] = $ticketKey;
                $state['level_scores'][] = [
                    'lvl'        => $lid,
                    'nickname'   => $nickname,
                    'timeMs'     => $timeMs,
                    'difficulty' => $diff,
                    'season'     => $season,
                    'auditHash'  => $auditHash,
                    'createdAt'  => $createdAt,
                ];
                $state['audit'][] = [
                    'event'       => 'level_submit',
                    'lvl'         => $lid,
                    'totalTimeMs' => $timeMs,
                    'difficulty'  => $diff,
                    'nickname'    => $nickname,
                    'auditHash'   => $auditHash,
                    'createdAt'   => $createdAt,
                ];
                $r = count(array_filter(
                    $state['level_scores'],
                    static fn($row) => (string)$row['lvl'] === $lid && (int)$row['timeMs'] < $timeMs
                )) + 1;
                return ['alreadyPlayed' => false, 'rank' => $r];
            });
            $alreadyPlayed = $res['alreadyPlayed'];
            $rank = $res['rank'];
        }

        if ($alreadyPlayed) {
            return [200, [
                'saved'         => false,
                'alreadyPlayed' => true,
                'message'       => 'Do žebříčku se započítává pouze první pokus. Tento výsledek nebyl zapsán.',
                'levelId'       => $lid,
                'timeMs'        => $timeMs,
                'rank'          => null,
                'entries'       => nt_top10_level($store, $lid, $profanityRules, $profanityEnabled),
            ]];
        }

        return [200, [
            'saved'   => true,
            'levelId' => $lid,
            'timeMs'  => $timeMs,
            'rank'    => $rank,
            'entries' => nt_top10_level($store, $lid, $profanityRules, $profanityEnabled),
        ]];
    }

    if ($action === 'finish') {
        $tickets = $data['tickets'] ?? null;
        if (!is_array($tickets) || empty($tickets)) return [400, ['error' => 'missing_tickets', 'message' => 'Chybí tickety']];
        $required = array_map(static fn($l) => (string)$l['lvl'], $targetsData['levels'] ?? []);
        $verified = [];
        foreach ($tickets as $t) {
            try {
                $p = nt_verify_ticket((string)$t, $secretKey);
            } catch (Throwable $e) {
                return [403, ['error' => 'invalid_ticket', 'message' => $e->getMessage()]];
            }
            if (empty($p['done'])) return [400, ['error' => 'incomplete_level', 'message' => 'Úroveň není dokončená']];
            $lid = (string)($p['lvl'] ?? '');
            if (isset($verified[$lid])) return [400, ['error' => 'duplicate_level', 'message' => 'Duplicitní úroveň']];
            $verified[$lid] = $p;
        }
        $reqSet = array_map('strval', $required); sort($reqSet);
        $gotSet = array_map('strval', array_keys($verified)); sort($gotSet);
        if ($reqSet !== $gotSet) return [400, ['error' => 'missing_levels', 'message' => 'Chybí povinné úrovně']];

        $nickname = trim((string)($data['nickname'] ?? ''));
        if ($nickname === '') $nickname = 'Anonymní hledač';
        $nickname = nt_clip($nickname, 50);
        if (nt_contains_profanity($nickname, $profanityRules, $profanityEnabled)) {
            return [400, ['error' => 'profanity_nickname', 'message' => 'Přezdívka obsahuje nevhodný výraz. Zadejte prosím jinou přezdívku.']];
        }

        $totalMs = 0;
        $levelsMap = [];
        $finishTicketKeys = [];
        foreach ($verified as $lid => $p) {
            $el = max(1, (int)($p['el'] ?? 0));
            $totalMs += $el;
            $levelsMap[$lid] = $el;
            $finishTicketKeys[] = 'fin:' . $lid . ':' . nt_ticket_jti($p);
        }
        $lastP = $verified[$required[count($required) - 1]];
        $auditHash = nt_audit_hash($clientIp, $secretKey, intdiv($ts, 1000));
        $certId = strtoupper(substr(hash_hmac('sha256', "{$nickname}:{$totalMs}:{$auditHash}:{$ts}", $secretKey), 0, 6));
        $createdAt = gmdate('Y-m-d H:i:s', intdiv($ts, 1000));
        $diff = (string)($lastP['diff'] ?? 'easy');
        $season = (string)($lastP['season'] ?? 'summer');

        $alreadyPlayed = false;
        $rank = null;
        $existingCertId = '';
        if ($store instanceof PDO) {
            $store->beginTransaction();
            try {
                $dupTicket = false;
                $tkStmt = $store->prepare('SELECT 1 FROM najdi_to_used_tickets WHERE ticket_key = ? LIMIT 1');
                foreach ($finishTicketKeys as $fk) {
                    $tkStmt->execute([$fk]);
                    if ($tkStmt->fetchColumn()) { $dupTicket = true; break; }
                }
                if ($oneAttemptOnly) {
                    $plStmt = $store->prepare('SELECT certificate_id FROM najdi_to_scores WHERE audit_hash = ? ORDER BY id ASC LIMIT 1');
                    $plStmt->execute([$auditHash]);
                    $foundCert = $plStmt->fetchColumn();
                    if ($foundCert !== false) {
                        $existingCertId = (string)$foundCert;
                    }
                }
                if ($dupTicket || $existingCertId !== '') {
                    $alreadyPlayed = true;
                } else {
                    $insTk = $store->prepare('INSERT INTO najdi_to_used_tickets (ticket_key) VALUES (?)');
                    foreach ($finishTicketKeys as $fk) $insTk->execute([$fk]);
                    $store->prepare('INSERT INTO najdi_to_scores (nickname, total_time_ms, difficulty, season, certificate_id, audit_hash, levels_json) VALUES (?, ?, ?, ?, ?, ?, ?)')
                        ->execute([$nickname, $totalMs, $diff, $season, $certId, $auditHash, json_encode($levelsMap)]);
                    $store->prepare('INSERT INTO najdi_to_audit (event, lvl, total_time_ms, difficulty, nickname, audit_hash) VALUES (?, ?, ?, ?, ?, ?)')
                        ->execute(['game_complete', 'all', $totalMs, $diff, $nickname, $auditHash]);
                    $rankStmt = $store->prepare('SELECT COUNT(*) FROM najdi_to_scores WHERE total_time_ms < ?');
                    $rankStmt->execute([$totalMs]);
                    $rank = (int)$rankStmt->fetchColumn() + 1;
                }
                $store->commit();
            } catch (Throwable $e) {
                if ($store->inTransaction()) $store->rollBack();
                throw $e;
            }
        } else {
            $res = nt_json_update($store, static function (&$state) use ($nickname, $totalMs, $diff, $season, $certId, $auditHash, $createdAt, $levelsMap, $finishTicketKeys, $oneAttemptOnly): array {
                $dupTicket = !empty(array_intersect($finishTicketKeys, $state['used_tickets']));
                $existing = '';
                if ($oneAttemptOnly) {
                    foreach ($state['scores'] as $row) {
                        if ((string)($row['auditHash'] ?? '') === $auditHash) {
                            $existing = (string)($row['certificateId'] ?? '');
                            break;
                        }
                    }
                }
                if ($dupTicket || $existing !== '') {
                    return ['alreadyPlayed' => true, 'rank' => null, 'certId' => $existing];
                }
                foreach ($finishTicketKeys as $fk) $state['used_tickets'][] = $fk;
                $state['scores'][] = [
                    'nickname'      => $nickname,
                    'totalTimeMs'   => $totalMs,
                    'difficulty'    => $diff,
                    'season'        => $season,
                    'certificateId' => $certId,
                    'auditHash'     => $auditHash,
                    'levels'        => $levelsMap,
                    'createdAt'     => $createdAt,
                ];
                $state['audit'][] = [
                    'event'       => 'game_complete',
                    'lvl'         => 'all',
                    'totalTimeMs' => $totalMs,
                    'difficulty'  => $diff,
                    'nickname'    => $nickname,
                    'auditHash'   => $auditHash,
                    'createdAt'   => $createdAt,
                ];
                $r = count(array_filter($state['scores'], static fn($row) => (int)$row['totalTimeMs'] < $totalMs)) + 1;
                return ['alreadyPlayed' => false, 'rank' => $r, 'certId' => $certId];
            });
            $alreadyPlayed = $res['alreadyPlayed'];
            $rank = $res['rank'];
            $existingCertId = $res['certId'];
        }

        if ($alreadyPlayed) {
            return [200, [
                'saved'         => false,
                'alreadyPlayed' => true,
                'message'       => 'Do celkového žebříčku se započítává pouze první pokus. Tento výsledek nebyl zapsán.',
                'totalTimeMs'   => $totalMs,
                'rank'          => null,
                'certificateId' => $existingCertId,
            ]];
        }

        return [200, ['saved' => true, 'totalTimeMs' => $totalMs, 'rank' => $rank, 'certificateId' => $certId]];
    }

    if ($action === 'leaderboard') {
        $overall = nt_top10_overall($store, $profanityRules, $profanityEnabled);
        $levelsOut = [];
        foreach ($targetsData['levels'] ?? [] as $lvl) {
            $lid = (string)($lvl['lvl'] ?? '');
            if ($lid !== '') {
                $levelsOut[$lid] = nt_top10_level($store, $lid, $profanityRules, $profanityEnabled);
            }
        }
        $reqLvl = isset($data['levelId']) ? (string)$data['levelId'] : '';
        $entries = ($reqLvl !== '' && $reqLvl !== 'all') ? ($levelsOut[$reqLvl] ?? []) : $overall;
        return [200, ['entries' => $entries, 'overall' => $overall, 'levels' => $levelsOut]];
    }

    return [400, ['error' => 'unknown_action', 'message' => 'Neznámá akce']];
}

if (PHP_SAPI !== 'cli' || realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    $cfgFile = __DIR__ . '/config.php';
    $cfg = is_file($cfgFile) ? (require $cfgFile) : [];
    $secretKey = (string)(getenv('NAJDI_TO_SECRET_KEY') ?: ($cfg['secret_key'] ?? ''));
    $adminKey = (string)(getenv('NAJDI_TO_ADMIN_KEY') ?: ($cfg['admin_key'] ?? ''));
    $targetsFile = (string)(getenv('NAJDI_TO_TARGETS_FILE') ?: ($cfg['targets_file'] ?? (__DIR__ . '/../../site_server/server_data/najdi_to.targets.json')));
    $dbPath = (string)(getenv('NAJDI_TO_DB_PATH') ?: ($cfg['db_path'] ?? (__DIR__ . '/../../site_server/server_data/najdi_to.sqlite')));

    if (!is_dir(dirname($dbPath))) @mkdir(dirname($dbPath), 0775, true);

    if (isset($_GET['audit'])) {
        $remoteIp = $_SERVER['REMOTE_ADDR'] ?? '';
        $isLocal = in_array($remoteIp, ['127.0.0.1', '::1'], true);
        $provided = (string)($_GET['key'] ?? '');
        if (!$isLocal && ($adminKey === '' || !hash_equals($adminKey, $provided))) {
            http_response_code(403);
            echo json_encode(['error' => 'forbidden', 'message' => 'Přístup k auditu odepřen']);
            exit;
        }
        $store = nt_open_store($dbPath);
        $rows = $store instanceof PDO
            ? $store->query('SELECT id, created_at, event, lvl, total_time_ms, difficulty, nickname, audit_hash FROM najdi_to_audit ORDER BY id DESC LIMIT 100')->fetchAll(PDO::FETCH_ASSOC)
            : (is_file($store) ? array_reverse(array_slice((json_decode((string)file_get_contents($store), true) ?: [])['audit'] ?? [], -100)) : []);
        echo json_encode(['status' => 'ok', 'audit' => $rows], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($secretKey === '' || $secretKey === 'ZMENTE_NA_DLOUHY_NAHODNY_RETEZEC') {
        $autoSecretFile = dirname($dbPath) . '/najdi_to.secret';
        if (is_file($autoSecretFile)) {
            $secretKey = trim((string)file_get_contents($autoSecretFile));
        } else {
            $secretKey = bin2hex(random_bytes(32));
            @file_put_contents($autoSecretFile, $secretKey, LOCK_EX);
        }
    }
    if ($secretKey === '') {
        http_response_code(500);
        echo json_encode(['error' => 'missing_secret', 'message' => 'Nastavte secret_key v config.php nebo NAJDI_TO_SECRET_KEY']);
        exit;
    }
    if (!is_file($targetsFile)) {
        http_response_code(500);
        echo json_encode(['error' => 'missing_targets', 'message' => 'Soubor najdi_to.targets.json nebyl nalezen']);
        exit;
    }

    $targetsData = json_decode((string)file_get_contents($targetsFile), true);
    $profanityRules = nt_load_profanity_rules($targetsFile);
    $method = $_SERVER['REQUEST_METHOD'] ?? (PHP_SAPI === 'cli' ? 'POST' : 'GET');
    $input = ($method === 'GET')
        ? ['action' => $_GET['action'] ?? 'leaderboard', 'levelId' => $_GET['levelId'] ?? null]
        : (json_decode((string)file_get_contents(PHP_SAPI === 'cli' ? 'php://stdin' : 'php://input'), true) ?: []);

    [$code, $resp] = nt_handle_request($input, $targetsData, $dbPath, $secretKey, nt_client_ip(), null, $profanityRules);
    if (PHP_SAPI !== 'cli') http_response_code($code);
    echo json_encode($resp, JSON_UNESCAPED_UNICODE);
}

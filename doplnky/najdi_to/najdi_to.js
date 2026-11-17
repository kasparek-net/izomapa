(() => {
  const PLUGIN_ID = 'najdi_to';
  const Izomapa = window.Izomapa;
  if (!Izomapa) return;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const formatTime = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  const isMobile = () => matchMedia('(max-width: 640px)').matches;

  function pointInPolygon(x, y, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function matchQuestion(q, x, y) {
    const r = q.radius_px || 175;
    if (q.xy && Math.hypot(x - q.xy[0], y - q.xy[1]) <= r) return { x: q.xy[0], y: q.xy[1] };
    for (const t of q.targets || []) {
      if (t.type === 'point' && Math.hypot(x - t.xy[0], y - t.xy[1]) <= (t.radius_px || r)) return { x: t.xy[0], y: t.xy[1] };
      if (t.type === 'polygon' && t.points?.length >= 3 && pointInPolygon(x, y, t.points)) {
        const cx = t.points.reduce((a, p) => a + p[0], 0) / t.points.length;
        const cy = t.points.reduce((a, p) => a + p[1], 0) / t.points.length;
        return { x: cx, y: cy };
      }
    }
    return null;
  }

  function createVerifier(cfg, data, api) {
    const profanity = api?.getLib?.('profanity') || null;
    const serverClient = api?.getLib?.('server_client') || null;
    const profanityEnabled = data.profanity_filter !== false && cfg.profanity_filter !== false;
    const isValidNick = (nick) => !profanityEnabled || !profanity || profanity.isValid(nick, { enabled: profanityEnabled });

    if (cfg.mode === 'server' && cfg.server_url) {
      const client = serverClient ? serverClient.createClient(cfg.server_url) : null;
      const callAction = async (action, payload = {}) => {
        if (client) {
          const res = await client.call(action, payload);
          if (res.ok && res.data && typeof res.data === 'object') return res.data;
          return {
            ...(res.data && typeof res.data === 'object' ? res.data : {}),
            error: res.error || 'request_failed',
            message: res.message || 'Požadavek na server selhal.',
          };
        }
        const resp = await fetch(cfg.server_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, ...payload }),
        });
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok && !json.error) throw new Error(`HTTP ${resp.status}`);
        return json;
      };
      return {
        isServer: true,
        isValidNick,
        start: (levelId, difficulty, season) => callAction('start', { levelId, difficulty, season }),
        verify: (x, y, ticket) => callAction('verify', { x, y, ticket }),
        submitLevel: (nickname, ticket) => callAction('submit_level', { nickname, ticket }),
        finish: (nickname, tickets) => callAction('finish', { nickname, tickets }),
        leaderboard: (levelId) => callAction('leaderboard', levelId ? { levelId } : {}),
      };
    }

    const oneAttemptOnly = data.one_attempt_only !== false && cfg.one_attempt_only !== false;
    const LOCAL_LB_KEY = 'izo-najdito-local-lb';
    const readLocalLb = () => {
      try {
        const parsed = JSON.parse(localStorage.getItem(LOCAL_LB_KEY) || '{}');
        return {
          overall: Array.isArray(parsed.overall) ? parsed.overall : [],
          levels: parsed.levels && typeof parsed.levels === 'object' ? parsed.levels : {},
          submittedLevels: Array.isArray(parsed.submittedLevels) ? parsed.submittedLevels : [],
          finishedSubmitted: Boolean(parsed.finishedSubmitted),
        };
      } catch {
        return { overall: [], levels: {}, submittedLevels: [], finishedSubmitted: false };
      }
    };
    const writeLocalLb = (lb) => {
      try { localStorage.setItem(LOCAL_LB_KEY, JSON.stringify(lb)); } catch {}
    };

    let activeLevel = null, order = [], step = 0, startedAt = 0, activeDiff = 'easy', activeSeason = 'summer';
    return {
      isServer: false,
      isValidNick,
      async start(levelId, difficulty, season) {
        activeLevel = (data.levels || []).find((l) => String(l.lvl) === String(levelId));
        activeDiff = difficulty || 'easy';
        activeSeason = season || 'summer';
        const n = activeLevel?.questions?.length || 0;
        order = Array.from({ length: n }, (_, i) => i);
        for (let i = order.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [order[i], order[j]] = [order[j], order[i]];
        }
        step = 0;
        startedAt = Date.now();
        return { order, ticket: `client:${levelId}:${activeDiff}:${activeSeason}` };
      },
      async verify(x, y) {
        const q = activeLevel?.questions?.[order[step]];
        const hitPt = q ? matchQuestion(q, x, y) : null;
        if (!hitPt) return { hit: false, completed: false, ticket: 'client' };
        step++;
        const completed = step >= order.length;
        const elapsedMs = Math.max(1000, Date.now() - startedAt);
        return {
          hit: true,
          completed,
          elapsedMs,
          targetHint: hitPt,
          answer: q.answer || q.text,
          ticket: `client_done:${activeLevel.lvl}:${elapsedMs}:${activeDiff}:${activeSeason}`,
        };
      },
      async submitLevel(nickname, ticket) {
        if (!isValidNick(nickname)) {
          return { error: 'profanity_nickname', message: 'Přezdívka obsahuje nevhodný výraz. Zadejte prosím jinou přezdívku.' };
        }
        const parts = String(ticket).split(':');
        const lid = String(parts[1] || activeLevel?.lvl || '1');
        const timeMs = parseInt(parts[2], 10) || 1000;
        const diff = parts[3] || activeDiff;
        const season = parts[4] || activeSeason;
        const lb = readLocalLb();
        lb.levels[lid] = lb.levels[lid] || [];
        if (oneAttemptOnly && lb.submittedLevels.includes(lid)) {
          return {
            saved: false,
            alreadyPlayed: true,
            message: 'Do žebříčku se započítává pouze první pokus. Tento výsledek nebyl zapsán.',
            levelId: lid,
            timeMs,
            rank: null,
            entries: lb.levels[lid],
          };
        }
        lb.submittedLevels.push(lid);
        lb.levels[lid].push({
          lvl: lid,
          nickname,
          timeMs,
          difficulty: diff,
          season,
          createdAt: new Date().toISOString().slice(0, 10),
        });
        lb.levels[lid].sort((a, b) => a.timeMs - b.timeMs);
        const rank = lb.levels[lid].findIndex((r) => r.timeMs === timeMs && r.nickname === nickname) + 1;
        lb.levels[lid] = lb.levels[lid].slice(0, 10);
        writeLocalLb(lb);
        return { saved: true, levelId: lid, timeMs, rank, entries: lb.levels[lid] };
      },
      async finish(nickname, tickets) {
        if (!isValidNick(nickname)) {
          return { error: 'profanity_nickname', message: 'Přezdívka obsahuje nevhodný výraz. Zadejte prosím jinou přezdívku.' };
        }
        const totalTimeMs = (tickets || []).reduce((acc, t) => acc + (parseInt(String(t).split(':')[2], 10) || 1000), 0);
        const lb = readLocalLb();
        if (oneAttemptOnly && lb.finishedSubmitted) {
          return {
            saved: false,
            alreadyPlayed: true,
            message: 'Do celkového žebříčku se započítává pouze první pokus. Tento výsledek nebyl zapsán.',
            totalTimeMs,
            rank: null,
            certificateId: 'LOKALNI',
            nickname,
          };
        }
        lb.finishedSubmitted = true;
        lb.overall.push({
          nickname,
          totalTimeMs,
          difficulty: activeDiff,
          season: activeSeason,
          certificateId: 'LOKALNI',
          createdAt: new Date().toISOString().slice(0, 10),
        });
        lb.overall.sort((a, b) => a.totalTimeMs - b.totalTimeMs);
        const rank = lb.overall.findIndex((r) => r.totalTimeMs === totalTimeMs && r.nickname === nickname) + 1;
        lb.overall = lb.overall.slice(0, 10);
        writeLocalLb(lb);
        return { saved: true, totalTimeMs, rank, certificateId: 'LOKALNI', nickname };
      },
      async leaderboard() {
        const local = readLocalLb();
        let remote = { overall: [], levels: {} };
        if (data.leaderboard_url) {
          try {
            const url = `${data.leaderboard_url}?_t=${Date.now()}`;
            if (serverClient) {
              const r = await serverClient.request(url, null, {}, { method: 'GET' });
              if (r.ok && r.data) {
                const raw = r.data;
                remote.overall = Array.isArray(raw) ? raw : (raw.overall || raw.entries || raw.leaderboard || []);
                remote.levels = raw.levels || {};
              }
            } else {
              const resp = await fetch(url);
              if (resp.ok) {
                const raw = await resp.json();
                remote.overall = Array.isArray(raw) ? raw : (raw.overall || raw.entries || raw.leaderboard || []);
                remote.levels = raw.levels || {};
              }
            }
          } catch {}
        }
        const filterValid = (arr) => arr.filter((r) => isValidNick(r.nickname || r.nick || ''));
        const overall = filterValid([...remote.overall, ...(local.overall || [])])
          .sort((a, b) => (a.totalTimeMs || (a.total_time || 0) * 1000) - (b.totalTimeMs || (b.total_time || 0) * 1000))
          .slice(0, 10);
        const levels = {};
        for (const l of data.levels || []) {
          const lid = String(l.lvl);
          levels[lid] = filterValid([...(remote.levels[lid] || []), ...(local.levels[lid] || [])])
            .sort((a, b) => (a.timeMs || (a.time || 0) * 1000) - (b.timeMs || (b.time || 0) * 1000))
            .slice(0, 10);
        }
        return { entries: overall, overall, levels };
      },
    };
  }

  function injectDom(title, city) {
    const host = document.createElement('div');
    host.id = 'najdiToRoot';
    host.innerHTML = `
<aside class="panel game-panel" id="gamePanel" hidden>
  <div class="game-head">
    <h2>🎯 <span id="gameTitle">${esc(title)}</span></h2>
    <div class="game-head-btns">
      <button class="px-btn min-game" id="gameMinBtn" type="button" aria-label="Minimalizovat panel" title="Minimalizovat panel"><svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="currentColor"><rect x="2" y="11" width="12" height="2.5"/></svg></button>
      <button class="px-btn close-game" id="gameExitBtn" type="button" title="Ukončit herní mód">✕ Zavřít</button>
    </div>
  </div>
  <div class="game-lvl-box">
    <label for="gameLvlSelect">Sada / Úroveň:</label>
    <select class="game-lvl-select" id="gameLvlSelect"></select>
    <p class="game-lvl-desc" id="gameLvlDesc"></p>
  </div>
  <div id="gamePreStart" class="game-prestart" style="display:grid; gap:12px;">
    <div class="game-diff-box">
      <label>Obtížnost (čas a počasí):</label>
      <div class="game-diff-group" id="gameDiffGroup"></div>
    </div>
    <div class="game-season-box">
      <label>Roční období:</label>
      <div class="game-season-group" id="gameSeasonGroup">
        <button class="px-btn" type="button" data-season="spring">Jaro</button>
        <button class="px-btn" type="button" data-season="summer">Léto</button>
        <button class="px-btn" type="button" data-season="autumn">Podzim</button>
        <button class="px-btn" type="button" data-season="winter">Zima</button>
      </div>
    </div>
    <button class="px-btn game-start-btn" id="gameStartBtn" type="button">▶ Spustit hledání</button>
    <div class="game-extra-links" style="display:flex; justify-content:space-between; align-items:center; margin-top:2px;">
      <button class="game-link-btn" id="gameHelpBtn" type="button">❓ Jak hrát?</button>
      <button class="game-link-btn" id="gameLeaderboardBtn" type="button" style="display:none;">🏆 Žebříček</button>
    </div>
  </div>
  <div id="gameRunning" class="game-running" style="display:none; gap:12px; grid-template-columns:1fr;">
    <div class="game-status-bar">
      <span class="game-timer" id="gameTimer">⏱ 00:00</span>
      <span class="game-progress-badge" id="gameProgress">0 / 0</span>
    </div>
    <ul class="game-q-list" id="gameQList"></ul>
    <p class="game-hint">💡 Hledejte objekty postupně podle pořadí a klikněte na ně na mapě. Když cíl najdete, označí se fajfkou a můžete pokračovat další otázkou.</p>
    <button class="px-btn game-cancel-btn" id="gameCancelBtn" type="button">Vzdát aktuální pokus</button>
  </div>
</aside>

<dialog class="help" id="gameFoundDlg" aria-labelledby="gameFoundTitle">
  <h2 id="gameFoundTitle">🎉 Našel(a) jsi to!</h2>
  <p id="gameFoundName" style="font-size:1.05rem; font-weight:bold; color:var(--grass); margin:10px 0;"></p>
  <p>Skvělé! Místo bylo označeno fajfkou a můžeš pokračovat v hledání další otázky.</p>
  <div class="game-modal-btns">
    <button class="px-btn" id="gameFoundClose" type="button" style="background:#ffca36; color:#1b2333; font-weight:bold; width:100%;">Pokračovat v hledání →</button>
  </div>
</dialog>

<dialog class="help" id="gameNickDlg" aria-labelledby="gameNickTitle">
  <h2 id="gameNickTitle">🏆 Úroveň dokončena!</h2>
  <p id="gameNickPrompt">Zadej svou přezdívku nebo jméno pro zápis do TOP 10 žebříčku:</p>
  <form id="gameNickForm" style="display:grid; gap:12px; margin:16px 0 8px;">
    <input type="text" id="gameNickInput" class="px-btn" style="text-align:left; padding:10px 12px; font-size:1.05rem; cursor:text; background:var(--panel-2); color:var(--ink); border:2px solid var(--edge);" placeholder="Tvoje přezdívka nebo jméno..." maxlength="40" required autofocus>
    <p id="gameNickError" style="display:none; margin:0; color:#ff6b6b; font-size:.9rem; font-weight:bold;"></p>
    <button id="gameNickSubmit" class="px-btn" type="submit" style="background:#ffca36; color:#1b2333; font-weight:bold; padding:10px; font-size:1.05rem;">Zapsat do žebříčku →</button>
  </form>
</dialog>

<dialog class="help" id="gameWinDlg" aria-labelledby="gameWinTitle">
  <button class="px-btn close" id="gameWinClose" type="button" aria-label="Zavřít">×</button>
  <h2 id="gameWinTitle">🏆 Úroveň dokončena!</h2>
  <p id="gameWinLvlText" style="font-size:1rem; font-weight:bold; margin-bottom:4px;"></p>
  <p id="gameWinStats" style="font-size:1.15rem; color:#ffca36; margin:8px 0; font-family:var(--display);"></p>
  <p id="gameWinRank" style="display:none; font-size:.95rem; color:var(--grass); font-weight:bold; margin:4px 0 8px;"></p>
  <div id="gameCertCard" class="game-cert-card" style="display:none;">
    <div class="cert-inner">
      <div class="cert-badge">🏅 OFICIÁLNÍ CERTIFIKÁT OBJEVITELE 🏅</div>
      <h3 class="cert-title">VŠECHNY ÚROVNĚ SPLNĚNY!</h3>
      <p class="cert-loc">${esc(city)} a okolí</p>
      <div class="cert-nick-box" style="margin:6px 0 8px; font-size:1.15rem; color:#ffca36; font-family:var(--display);">
        Hledač: <span id="certNick" style="color:#fff; text-shadow:1px 1px 0 rgba(0,0,0,.6);"></span>
      </div>
      <div class="cert-divider"></div>
      <p class="cert-text">Úspěšně a kompletně jsi nalezl(a) všechny dominanty, zvířata a skrytá místa v této lokaci!</p>
      <div class="cert-scores" id="certScores"></div>
      <div class="cert-footer">
        <div class="cert-date" id="certDate">Dokončeno: --</div>
        <div class="cert-date" id="certId" style="font-size:.78rem; color:var(--muted);"></div>
        <div class="cert-author">Autor mapy posílá obrovské gratulace! 👏🎉</div>
      </div>
    </div>
  </div>
  <div class="game-share-callout">
    <p style="margin:0 0 6px 0;"><strong>📸 Sběratelský úlovek!</strong></p>
    <p style="margin:0;">Udělej si <strong>snímek obrazovky (printscreen)</strong> na památku do své sbírky, nebo se pochlub přátelům!</p>
  </div>
  <div class="game-modal-btns">
    <a class="px-btn fb-btn" id="gameFbShare" href="#" target="_blank" rel="noopener">Sdílet na Facebooku</a>
    <button class="px-btn" id="gameCopyShare" type="button">Zkopírovat výsledek</button>
    <button class="px-btn" id="gameWinLeaderboardBtn" type="button">🏆 Žebříček TOP 10</button>
    <button class="px-btn" id="gameNextLvlBtn" type="button" style="background:var(--grass); color:#1b2333; font-weight:bold;">Další úroveň →</button>
  </div>
</dialog>

<dialog class="help" id="gameNextConfirmDlg" aria-labelledby="gameNextConfirmTitle">
  <button class="px-btn close" id="gameNextConfirmClose" type="button" aria-label="Zavřít">×</button>
  <h2 id="gameNextConfirmTitle">🗺 Pokračovat na další úroveň?</h2>
  <p id="gameNextConfirmDesc" style="font-size:1.05rem; font-weight:bold; color:var(--grass); margin:12px 0;"></p>
  <p>Přejete si ihned zahájit hledání v této úrovni?</p>
  <div class="game-modal-btns">
    <button class="px-btn" id="gameNextConfirmStart" type="button" style="background:#ffca36; color:#1b2333; font-weight:bold; font-size:1rem; padding:10px;">▶ Spustit hledání</button>
    <button class="px-btn" id="gameNextConfirmLater" type="button">Upravit nastavení</button>
  </div>
</dialog>

<dialog class="help" id="gameExitDlg" aria-labelledby="gameExitTitle">
  <button class="px-btn close" id="gameExitClose" type="button" aria-label="Zavřít">×</button>
  <h2 id="gameExitTitle">🎯 Herní vyhodnocení</h2>
  <p id="gameExitMsg"></p>
  <div class="game-share-callout"><p style="margin:0;">Sdílejte svůj dosažený čas nebo udělejte printscreen!</p></div>
  <div class="game-modal-btns">
    <a class="px-btn fb-btn" id="gameExitFbShare" href="#" target="_blank" rel="noopener">Sdílet na Facebooku</a>
    <button class="px-btn" id="gameExitCopyShare" type="button">Zkopírovat výsledek</button>
    <button class="px-btn" id="gameExitConfirm" type="button">Opustit hru</button>
  </div>
</dialog>

<dialog class="help" id="gameFbGuideDlg" aria-labelledby="gameFbGuideTitle">
  <button class="px-btn close" id="gameFbGuideClose" type="button" aria-label="Zavřít">×</button>
  <h2 id="gameFbGuideTitle">📋 Výsledek zkopírován do schránky!</h2>
  <p style="margin:8px 0; color:var(--grass); font-weight:bold;">✅ Vaše skóre a text výzvy jsou připraveny ve schránce.</p>
  <p style="font-size:.9rem; color:var(--muted); margin:6px 0; line-height:1.45;">V nově otevřeném okně Facebooku text vložte stiskem <strong>Ctrl+V</strong> (nebo „Vložit“ na mobilu).</p>
  <div style="margin:10px 0; padding:10px; background:rgba(0,0,0,.3); border:1px solid var(--edge); border-radius:4px;">
    <div style="font-size:.78rem; color:var(--muted); margin-bottom:4px;">Zkopírovaný text k vložení do příspěvku:</div>
    <div id="gameFbGuideText" style="font-size:.85rem; color:var(--ink); font-style:italic; line-height:1.4; user-select:all;"></div>
  </div>
  <div class="game-modal-btns" style="margin-top:14px;">
    <a class="px-btn fb-btn" id="gameFbGuideGoBtn" href="#" target="_blank" rel="noopener" style="font-weight:bold; font-size:.95rem; padding:10px 16px;">Přejít na Facebook ↗</a>
    <button class="px-btn" id="gameFbGuideCopyAgain" type="button">Kopírovat znovu</button>
  </div>
</dialog>

<dialog class="help" id="gameHelpDlg" aria-labelledby="gameHelpTitle">
  <button class="px-btn close" id="gameHelpClose" type="button" aria-label="Zavřít">×</button>
  <h2 id="gameHelpTitle">❓ Jak hrát „${esc(title)}“</h2>
  <div style="line-height:1.5; font-size:.92rem; display:grid; gap:10px;">
    <p>Cílem hry je otestovat váš postřeh a znalost mapy. V každé úrovni máte za úkol postupně najít všechny zadané objekty, zvířata a významná místa.</p>
    <h3 style="color:var(--grass); margin:6px 0 2px;">Pravidla a postup:</h3>
    <ul style="margin:0; padding-left:20px;">
      <li><strong>Postupné pořadí:</strong> Otázky se zobrazují v náhodném pořadí, ale musíte je hledat přísně popořadě.</li>
      <li><strong>Hledání na mapě:</strong> Během hry jsou popisky na mapě skryté. Klikněte přímo na hledaný objekt nebo do jeho okolí.</li>
      <li><strong>Odfajfkování:</strong> Jakmile cíl trefíte, otázka se označí fajfkou ✓ a odemkne se další cíl.</li>
      <li><strong>Obtížnosti:</strong> Můžete hrát ve dne, v dešti a šeru nebo v noci.</li>
      <li><strong>Jeden soutěžní pokus:</strong> Do žebříčku TOP 10 se v každé úrovni započítává pouze první dokončený pokus; opakované hraní slouží pro zábavu.</li>
      <li><strong>Finální certifikát:</strong> Po dokončení všech úrovní získáte sběratelský certifikát s časy a datem.</li>
    </ul>
  </div>
</dialog>

<dialog class="help" id="gameLeaderboardDlg" aria-labelledby="gameLeaderboardTitle">
  <button class="px-btn close" id="gameLeaderboardClose" type="button" aria-label="Zavřít">×</button>
  <h2 id="gameLeaderboardTitle">🏆 Žebříček TOP 10</h2>
  <div id="leaderboardTabs" class="leaderboard-tabs"></div>
  <p id="leaderboardSubtitle" style="margin:4px 0 8px; font-size:.85rem; color:var(--muted);"></p>
  <div id="leaderboardLoading" style="text-align:center; padding:16px; color:var(--muted);">Načítám oficiální žebříček…</div>
  <div id="leaderboardEmpty" style="display:none; text-align:center; padding:16px; background:rgba(0,0,0,.2); border:1px solid var(--edge);">
    <p style="font-size:1.05rem; color:#ffca36; margin:0 0 6px;">⏳ Žebříček je zatím prázdný</p>
    <p style="margin:0; font-size:.9rem; line-height:1.45; color:var(--muted);">Dokonči tuto úroveň a buď první v TOP 10 žebříčku!</p>
  </div>
  <div id="leaderboardContent" style="display:none;">
    <div style="max-height:280px; overflow-y:auto; border:1px solid var(--edge); background:rgba(0,0,0,.25);">
      <table style="width:100%; border-collapse:collapse; font-size:.88rem; text-align:left;">
        <thead>
          <tr style="border-bottom:2px solid var(--edge); background:var(--panel-2); color:#ffca36;">
            <th style="padding:6px 8px;">#</th>
            <th style="padding:6px 8px;">Hledač</th>
            <th id="leaderboardTimeCol" style="padding:6px 8px;">Čas</th>
            <th style="padding:6px 8px;">Obtížnost</th>
            <th style="padding:6px 8px;">Datum</th>
          </tr>
        </thead>
        <tbody id="leaderboardTbody"></tbody>
      </table>
    </div>
  </div>
</dialog>`;
    document.body.appendChild(host);
  }

  let cleanupFn = null;

  Izomapa.registerPlugin(PLUGIN_ID, {
    onInit(api) {
      const data = api.getPluginData(PLUGIN_ID);
      const cfg = api.getPluginConfig(PLUGIN_ID);
      if (!data || !data.levels?.length) return;

      const title = data.title || 'Najdeš to?';
      injectDom(title, data.city || 'Izomapa');

      const slot = api.getUiSlot('sidebar-tabs');
      const gameFold = document.createElement('button');
      gameFold.id = 'gameFold';
      gameFold.type = 'button';
      gameFold.className = 'game-fold';
      gameFold.textContent = '🎯';
      gameFold.title = title;
      gameFold.setAttribute('aria-label', title);
      gameFold.setAttribute('aria-controls', 'gamePanel');
      slot?.appendChild(gameFold);

      const gamePanel = $('gamePanel');
      const hitLayer = api.getPluginLayer(PLUGIN_ID);
      const verifier = createVerifier(cfg, data, api);

      const oneAttemptOnly = data.one_attempt_only !== false && cfg.one_attempt_only !== false;
      const STORAGE_KEY = 'izo-najdito-progress';
      const TICKETS_KEY = 'izo-najdito-tickets';
      let progress = { unlocked: 1, bestTimes: {}, submittedLevels: {}, finishedSubmitted: false, nick: '', completedAt: '', certificateId: '' };
      let savedTickets = {};
      try { Object.assign(progress, JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')); } catch {}
      if (!progress.submittedLevels || typeof progress.submittedLevels !== 'object') progress.submittedLevels = {};
      try { Object.assign(savedTickets, JSON.parse(localStorage.getItem(TICKETS_KEY) || '{}')); } catch {}
      const saveProgress = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); } catch {} };
      const saveTickets = () => { try { localStorage.setItem(TICKETS_KEY, JSON.stringify(savedTickets)); } catch {} };

      let gameActive = false, gameRunning = false, gameMinimized = false;
      let currentLvlIdx = 0, currentDiffKey = 'easy', currentSeason = api.getEnvironment().season || 'summer';
      let orderedQuestions = [], currentQIdx = 0, startTime = 0, timerInterval = null;
      let currentTicket = null, savedEnv = null, unsubClick = null, unsubFrame = null, verifying = false;
      const foundPoints = [];

      const showToast = (msg) => {
        const t = $('toast');
        if (!t) return;
        t.textContent = msg;
        t.hidden = false;
        clearTimeout(showToast._t);
        showToast._t = setTimeout(() => { t.hidden = true; }, 2200);
      };

      const MIN_ICO = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="currentColor"><rect x="2" y="11" width="12" height="2.5"/></svg>';
      const MAX_ICO = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="2" y="2" width="12" height="12"/></svg>';

      function setMinimized(min) {
        gameMinimized = min;
        gamePanel.classList.toggle('minimized', min);
        const btn = $('gameMinBtn');
        if (btn) {
          btn.innerHTML = min ? MAX_ICO : MIN_ICO;
          const lbl = min ? 'Maximalizovat panel' : 'Minimalizovat panel';
          btn.title = lbl;
          btn.setAttribute('aria-label', lbl);
        }
      }
      $('gameMinBtn')?.addEventListener('click', () => setMinimized(!gameMinimized));

      if (typeof api.onFrame === 'function') {
        unsubFrame = api.onFrame((ctx, view, t) => {
          if (!gameActive || !foundPoints.length) return;
          const pulse = 1 + 0.18 * Math.sin(t * 4);
          for (const pt of foundPoints) {
            if (!view.vis(pt.x, pt.y, 48)) continue;
            const [sx, sy] = view.toScreen(pt.x, pt.y);
            const r = Math.max(16, Math.round(24 * Math.min(1.4, Math.max(0.7, view.sx)) * pulse));
            ctx.strokeStyle = 'rgba(140, 192, 99, 0.7)';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(sx, sy, r, 0, Math.PI * 2);
            ctx.stroke();
          }
        }, { layer: 'world' });
      }

      function clearMarkers() {
        foundPoints.length = 0;
        hitLayer.replaceChildren();
      }
      function addHitMarker(pt) {
        if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return;
        foundPoints.push({ x: pt.x, y: pt.y });
        const m = document.createElement('div');
        m.className = 'najdi-hit-marker';
        m.style.left = `${pt.x}px`;
        m.style.top = `${pt.y}px`;
        m.textContent = '✓';
        hitLayer.appendChild(m);
      }

      if (!data.difficulties || !Object.keys(data.difficulties).length) {
        data.difficulties = {
          easy: { name: 'Lehká (Den)', time: 0.0, weather: 'clear' },
          medium: { name: 'Střední (Déšť a šero)', time: 0.5, weather: 'rain' },
          hard: { name: 'Těžká (Noc)', time: 1.0, weather: 'clear' },
        };
      }
      currentDiffKey = Object.keys(data.difficulties)[0];

      function applyDifficulty(d) {
        if (!d) return;
        const night = typeof d.night === 'number' ? d.night : (typeof d.time === 'number' ? d.time : 0);
        api.setEnvironment({ season: currentSeason, weather: d.weather || 'clear', night });
      }

      const diffGroup = $('gameDiffGroup');
      Object.entries(data.difficulties).forEach(([key, d]) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `px-btn game-diff-btn${key === currentDiffKey ? ' active' : ''}`;
        btn.dataset.diff = key;
        btn.textContent = d.name;
        btn.addEventListener('click', () => {
          if (gameRunning) return;
          currentDiffKey = key;
          diffGroup.querySelectorAll('.game-diff-btn').forEach((b) => b.classList.toggle('active', b.dataset.diff === key));
          applyDifficulty(d);
        });
        diffGroup.appendChild(btn);
      });

      const seasonGroup = $('gameSeasonGroup');
      const syncSeasonBtns = () => seasonGroup.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.season === currentSeason));
      syncSeasonBtns();
      seasonGroup.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
        if (gameRunning) return;
        currentSeason = b.dataset.season;
        syncSeasonBtns();
        applyDifficulty(data.difficulties[currentDiffKey]);
      }));

      function updateLvlDesc() {
        const lvl = data.levels[currentLvlIdx];
        if (!lvl) { $('gameLvlDesc').textContent = ''; return; }
        const submitted = oneAttemptOnly && Boolean(progress.submittedLevels?.[String(lvl.lvl)]);
        $('gameLvlDesc').textContent = submitted
          ? `${lvl.text} (✔ Započítáno do žebříčku – další pokus je jen cvičný)`
          : lvl.text;
      }

      function refreshLvlSelect() {
        const sel = $('gameLvlSelect');
        sel.innerHTML = '';
        data.levels.forEach((lvl, idx) => {
          const opt = document.createElement('option');
          opt.value = idx;
          const locked = Number(lvl.lvl) > (progress.unlocked || 1);
          const best = progress.bestTimes?.[lvl.lvl];
          const bestStr = best ? ` (${formatTime(best.sec)})` : '';
          opt.textContent = `Úroveň ${lvl.lvl}: ${lvl.text}${bestStr}${locked ? ' 🔒' : ''}`;
          opt.disabled = locked;
          sel.appendChild(opt);
        });
        sel.value = currentLvlIdx;
        updateLvlDesc();
      }
      $('gameLvlSelect').addEventListener('change', (e) => {
        if (gameRunning) return;
        currentLvlIdx = parseInt(e.target.value, 10) || 0;
        updateLvlDesc();
      });

      function updateQuestionsList() {
        const ul = $('gameQList');
        ul.innerHTML = '';
        $('gameProgress').textContent = `${currentQIdx} / ${orderedQuestions.length}`;
        orderedQuestions.forEach((q, idx) => {
          const li = document.createElement('li');
          li.className = 'game-q-item ' + (idx < currentQIdx ? 'q-done' : idx === currentQIdx ? 'q-active' : 'q-locked');
          const ico = document.createElement('span');
          ico.className = 'q-ico';
          ico.textContent = idx < currentQIdx ? '✓' : idx === currentQIdx ? '🔍' : '🔒';
          const txt = document.createElement('span');
          txt.className = 'q-txt';
          txt.textContent = q.text;
          li.append(ico, txt);
          ul.appendChild(li);
        });
      }

      const stopTimer = () => { if (timerInterval) { clearInterval(timerInterval); timerInterval = null; } };
      const startTimerLoop = () => {
        stopTimer();
        timerInterval = setInterval(() => {
          $('gameTimer').textContent = '⏱ ' + formatTime(Math.floor((Date.now() - startTime) / 1000));
        }, 1000);
      };

      function setGameMode(active) {
        gameActive = active;
        gameFold.classList.toggle('active', active);
        api.setPinsVisible(!active);
        const mainPanel = $('panel');
        if (active) {
          savedEnv = api.getEnvironment();
          currentSeason = savedEnv.season || 'summer';
          syncSeasonBtns();
          if (mainPanel) mainPanel.hidden = true;
          gamePanel.hidden = false;
          setMinimized(false);
          refreshLvlSelect();
          applyDifficulty(data.difficulties[currentDiffKey]);
          api.setClickCapture(true);
          api.setCursor('crosshair');
          if (!unsubClick) unsubClick = api.onMapClick(handleMapClick, { priority: 100 });
          if (isMobile() && mainPanel) mainPanel.classList.add('closed');
        } else {
          stopTimer();
          clearMarkers();
          gameRunning = false;
          currentTicket = null;
          setMinimized(false);
          gamePanel.hidden = true;
          if (mainPanel) mainPanel.hidden = false;
          $('gamePreStart').style.display = 'grid';
          $('gameRunning').style.display = 'none';
          if (unsubClick) { unsubClick(); unsubClick = null; }
          api.setClickCapture(false);
          api.setCursor('');
          if (savedEnv) { api.setEnvironment(savedEnv); savedEnv = null; }
        }
      }

      gameFold.addEventListener('click', () => {
        if (gameActive) {
          if (gameRunning) showExitDialog();
          else setGameMode(false);
        } else {
          setGameMode(true);
        }
      });
      $('gameExitBtn').addEventListener('click', () => {
        if (gameRunning) showExitDialog();
        else setGameMode(false);
      });

      $('gameLeaderboardBtn').style.display = 'inline-block';
      $('gameHelpBtn').addEventListener('click', () => $('gameHelpDlg').showModal());
      $('gameHelpClose').addEventListener('click', () => $('gameHelpDlg').close());
      $('gameLeaderboardClose').addEventListener('click', () => $('gameLeaderboardDlg').close());
      $('gameFbGuideClose').addEventListener('click', () => $('gameFbGuideDlg').close());
      $('gameFoundClose').addEventListener('click', () => $('gameFoundDlg').close());

      let cachedLb = { overall: [], levels: {} };
      let activeLbTab = String(data.levels[0]?.lvl || 'all');

      function renderLeaderboardTab(tabKey) {
        activeLbTab = String(tabKey);
        const tabsEl = $('leaderboardTabs');
        tabsEl.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.tab === activeLbTab));

        const isAll = activeLbTab === 'all';
        const lvlObj = isAll ? null : data.levels.find((l) => String(l.lvl) === activeLbTab);
        $('leaderboardSubtitle').textContent = isAll
          ? 'TOP 10 nejrychlejších hledačů za všechny dokončené úrovně dohromady'
          : `TOP 10 pro úroveň ${lvlObj?.lvl || activeLbTab}: ${lvlObj?.text || ''}`;
        $('leaderboardTimeCol').textContent = isAll ? 'Celkový čas' : 'Čas úrovně';

        const rows = (isAll ? (cachedLb.overall || []) : (cachedLb.levels?.[activeLbTab] || [])).slice(0, 10);
        if (!rows.length) {
          $('leaderboardContent').style.display = 'none';
          $('leaderboardEmpty').style.display = 'block';
          return;
        }
        $('leaderboardEmpty').style.display = 'none';
        $('leaderboardContent').style.display = 'block';
        $('leaderboardTbody').innerHTML = rows.map((r, i) => {
          const ms = typeof r.timeMs === 'number' ? r.timeMs : (typeof r.totalTimeMs === 'number' ? r.totalTimeMs : null);
          const sec = ms !== null ? Math.round(ms / 1000) : r.total_time;
          const timeStr = typeof sec === 'number' ? formatTime(sec) : (r.total_time || '--');
          const diffStr = data.difficulties?.[r.difficulty]?.name || r.difficulty || 'Lehká';
          const dateStr = r.date || (r.createdAt ? String(r.createdAt).slice(0, 10) : '');
          return `<tr style="border-bottom:1px solid rgba(255,255,255,.08);">
            <td style="padding:6px 8px; font-weight:bold; color:#ffca36;">${i + 1}.</td>
            <td style="padding:6px 8px; font-weight:bold;">${esc(r.nickname || r.nick || 'Hledač')}</td>
            <td style="padding:6px 8px;">${esc(timeStr)}</td>
            <td style="padding:6px 8px; color:var(--muted);">${esc(diffStr)}</td>
            <td style="padding:6px 8px; font-size:.8rem; color:var(--muted);">${esc(dateStr)}</td>
          </tr>`;
        }).join('');
      }

      async function openLeaderboardDialog(preferredTab) {
        const tabsEl = $('leaderboardTabs');
        tabsEl.innerHTML = '';
        data.levels.forEach((l) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'px-btn lb-tab-btn';
          btn.dataset.tab = String(l.lvl);
          btn.textContent = `Úroveň ${l.lvl}`;
          btn.title = l.text || '';
          btn.addEventListener('click', () => renderLeaderboardTab(l.lvl));
          tabsEl.appendChild(btn);
        });
        const allBtn = document.createElement('button');
        allBtn.type = 'button';
        allBtn.className = 'px-btn lb-tab-btn';
        allBtn.dataset.tab = 'all';
        allBtn.textContent = '👑 Všechny úrovně';
        allBtn.addEventListener('click', () => renderLeaderboardTab('all'));
        tabsEl.appendChild(allBtn);

        const defaultTab = preferredTab || String(data.levels[currentLvlIdx]?.lvl || 'all');
        $('gameLeaderboardDlg').showModal();
        $('leaderboardLoading').style.display = 'block';
        $('leaderboardEmpty').style.display = 'none';
        $('leaderboardContent').style.display = 'none';
        try {
          const res = await verifier.leaderboard();
          cachedLb = {
            overall: res.overall || res.entries || [],
            levels: res.levels || {},
          };
          $('leaderboardLoading').style.display = 'none';
          renderLeaderboardTab(defaultTab);
        } catch {
          $('leaderboardLoading').style.display = 'none';
          $('leaderboardEmpty').style.display = 'block';
        }
      }

      $('gameLeaderboardBtn').addEventListener('click', () => openLeaderboardDialog(String(data.levels[currentLvlIdx]?.lvl || 'all')));

      async function startLevel(idx) {
        if (typeof idx === 'number') currentLvlIdx = idx;
        const lvl = data.levels[currentLvlIdx];
        if (!lvl?.questions?.length) return;

        clearMarkers();
        const res = await verifier.start(lvl.lvl, currentDiffKey, currentSeason);
        if (!res || !res.ticket || !Array.isArray(res.order)) {
          showToast('Nepodařilo se spustit úroveň');
          return;
        }
        currentTicket = res.ticket;
        orderedQuestions = res.order.map((i) => lvl.questions[i]).filter(Boolean);
        currentQIdx = 0;
        gameRunning = true;
        startTime = Date.now();

        $('gamePreStart').style.display = 'none';
        $('gameRunning').style.display = 'grid';
        $('gameTimer').textContent = '⏱ 00:00';
        updateQuestionsList();
        refreshLvlSelect();
        setMinimized(true);
        startTimerLoop();

        if (lvl.camera) api.panTo(lvl.camera.x, lvl.camera.y, lvl.camera.zoom);
      }

      $('gameStartBtn').addEventListener('click', () => startLevel(currentLvlIdx));
      $('gameCancelBtn').addEventListener('click', showExitDialog);

      async function handleMapClick(e) {
        if (!gameActive || !gameRunning || verifying || !currentTicket || currentQIdx >= orderedQuestions.length) return true;
        verifying = true;
        try {
          const res = await verifier.verify(e.x, e.y, currentTicket);
          if (res?.ticket) currentTicket = res.ticket;
          if (res?.error === 'rate_limit') {
            showToast('Zpomalte prosím mezi kliknutími');
            return true;
          }
          if (!res?.hit) return true;

          const curQ = orderedQuestions[currentQIdx];
          addHitMarker(res.targetHint || { x: e.x, y: e.y });
          currentQIdx++;
          updateQuestionsList();

          if (res.completed || currentQIdx >= orderedQuestions.length) {
            await onLevelFinished(res.elapsedMs);
          } else {
            $('gameFoundName').textContent = res.answer || curQ.answer || curQ.text;
            $('gameFoundDlg').showModal();
          }
        } finally {
          verifying = false;
        }
        return true;
      }

      async function onLevelFinished(elapsedMs) {
        stopTimer();
        const elapsedSec = Math.max(1, Math.round((elapsedMs || (Date.now() - startTime)) / 1000));
        const lvl = data.levels[currentLvlIdx];
        const lidKey = String(lvl.lvl);
        const nextLvl = Number(lvl.lvl) + 1;
        if (nextLvl > (progress.unlocked || 1)) progress.unlocked = nextLvl;

        const diffName = data.difficulties[currentDiffKey]?.name || currentDiffKey;
        const levelAlreadySubmitted = oneAttemptOnly && Boolean(progress.submittedLevels?.[lidKey]);
        if (!levelAlreadySubmitted) {
          const prevBest = progress.bestTimes?.[lvl.lvl];
          if (!prevBest || elapsedSec < prevBest.sec) {
            progress.bestTimes[lvl.lvl] = { sec: elapsedSec, diff: diffName };
          }
          savedTickets[lidKey] = currentTicket;
          saveProgress();
          saveTickets();
        }
        refreshLvlSelect();

        const allDone = data.levels.every((l) => progress.bestTimes?.[l.lvl] && savedTickets[String(l.lvl)]);
        const overallAlreadySubmitted = oneAttemptOnly && Boolean(progress.finishedSubmitted);
        if (levelAlreadySubmitted && (!allDone || overallAlreadySubmitted)) {
          showWinDialog(lvl, elapsedSec, diffName, {
            alreadyPlayed: true,
            alreadyPlayedMsg: 'ℹ️ Cvičný pokus – do žebříčku se započítává pouze první pokus.',
          });
          return;
        }

        promptNickAndSubmit(lvl, elapsedSec, diffName, currentTicket, levelAlreadySubmitted);
      }

      function promptNickAndSubmit(lvl, elapsedSec, diffName, levelTicket, levelAlreadySubmitted = false) {
        const lidKey = String(lvl.lvl);
        const allDone = data.levels.every((l) => progress.bestTimes?.[l.lvl] && savedTickets[String(l.lvl)]);
        const needFinishSubmit = allDone && !(oneAttemptOnly && progress.finishedSubmitted);
        $('gameNickTitle').textContent = allDone ? '🎉 Všechny úrovně splněny!' : `🏆 Úroveň ${lvl.lvl} dokončena!`;
        $('gameNickPrompt').textContent = allDone
          ? `Zvládl(a) jsi všechny úrovně (úroveň ${lvl.lvl} za ${formatTime(elapsedSec)})! Zadej přezdívku pro zápis do TOP 10 žebříčku a vystavení certifikátu:`
          : `Úroveň ${lvl.lvl} jsi zvládl(a) za ${formatTime(elapsedSec)}! Zadej svou přezdívku pro zápis do TOP 10 žebříčku této úrovně:`;
        $('gameNickSubmit').textContent = allDone ? 'Zapsat do žebříčku a vystavit certifikát →' : 'Zapsat do žebříčku →';
        $('gameNickInput').value = progress.nick || '';
        const errEl = $('gameNickError');
        errEl.style.display = 'none';
        errEl.textContent = '';

        const form = $('gameNickForm');
        const submitBtn = $('gameNickSubmit');
        let submitting = false;

        form.onsubmit = async (e) => {
          e.preventDefault();
          if (submitting) return;
          const nick = $('gameNickInput').value.trim();
          if (!nick) {
            errEl.textContent = 'Zadej prosím svou přezdívku.';
            errEl.style.display = 'block';
            $('gameNickInput').focus();
            return;
          }
          if (!verifier.isValidNick(nick)) {
            errEl.textContent = 'Přezdívka obsahuje nevhodný výraz. Zadejte prosím jinou přezdívku.';
            errEl.style.display = 'block';
            $('gameNickInput').focus();
            return;
          }

          submitting = true;
          submitBtn.disabled = true;
          errEl.style.display = 'none';
          let levelRank = null;
          let totalRank = null;
          let alreadyPlayed = levelAlreadySubmitted;
          let alreadyPlayedMsg = '';

          try {
            if (!levelAlreadySubmitted) {
              const subRes = await verifier.submitLevel(nick, levelTicket);
              if (subRes?.error) {
                errEl.textContent = subRes.message || 'Přezdívku se nepodařilo uložit.';
                errEl.style.display = 'block';
                $('gameNickInput').focus();
                return;
              }
              progress.submittedLevels[lidKey] = true;
              if (subRes?.alreadyPlayed) {
                alreadyPlayed = true;
                alreadyPlayedMsg = subRes.message || 'Do žebříčku se započítává pouze první pokus. Tento výsledek nebyl zapsán.';
              } else if (typeof subRes?.rank === 'number') {
                levelRank = subRes.rank;
              }
            }
            progress.nick = nick;

            if (needFinishSubmit) {
              const tickets = data.levels.map((l) => savedTickets[String(l.lvl)]).filter(Boolean);
              const finRes = await verifier.finish(nick, tickets);
              if (finRes?.error) {
                errEl.textContent = finRes.message || 'Nepodařilo se zapsat celkový výsledek.';
                errEl.style.display = 'block';
                $('gameNickInput').focus();
                return;
              }
              progress.finishedSubmitted = true;
              if (finRes?.certificateId) progress.certificateId = finRes.certificateId;
              if (finRes?.alreadyPlayed) {
                alreadyPlayed = true;
                alreadyPlayedMsg = finRes.message || alreadyPlayedMsg || 'Do celkového žebříčku se započítává pouze první pokus. Tento výsledek nebyl zapsán.';
              } else if (typeof finRes?.rank === 'number') {
                totalRank = finRes.rank;
              }
            }

            saveProgress();
            refreshLvlSelect();
            form.onsubmit = null;
            $('gameNickDlg').close();
            showWinDialog(lvl, elapsedSec, diffName, { levelRank, totalRank, alreadyPlayed, alreadyPlayedMsg });
          } catch {
            saveProgress();
            form.onsubmit = null;
            $('gameNickDlg').close();
            showWinDialog(lvl, elapsedSec, diffName, { levelRank, totalRank, alreadyPlayed, alreadyPlayedMsg });
          } finally {
            submitting = false;
            submitBtn.disabled = false;
          }
        };
        $('gameNickDlg').showModal();
      }

      function shareToFacebook(shareText) {
        navigator.clipboard?.writeText(shareText).catch(() => {});
        const targetUrl = location.href.split('#')[0];
        $('gameFbGuideText').textContent = shareText;
        $('gameFbGuideGoBtn').href = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(targetUrl);
        $('gameFbGuideGoBtn').onclick = () => $('gameFbGuideDlg').close();
        $('gameFbGuideCopyAgain').onclick = async () => {
          try { await navigator.clipboard.writeText(shareText); showToast('Výsledek zkopírován!'); } catch {}
        };
        $('gameFbGuideDlg').showModal();
      }

      function showWinDialog(lvl, elapsedSec, diffName, ranks = {}) {
        setMinimized(false);
        const timeStr = formatTime(elapsedSec);
        const allDone = data.levels.every((l) => progress.bestTimes?.[l.lvl]);
        $('gameCertCard').style.display = allDone ? 'block' : 'none';

        const now = new Date();
        if (allDone && !progress.completedAt) {
          progress.completedAt = now.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' });
          saveProgress();
        }

        let totalSec = 0;
        if (allDone) {
          $('gameWinTitle').textContent = '👑 Všechny úrovně dokončeny!';
          $('gameWinLvlText').textContent = 'Zvládl(a) jsi kompletně všechny úrovně v této lokaci!';
          $('certNick').textContent = progress.nick || 'Úspěšný objevitel';
          $('certDate').textContent = 'Dokončeno: ' + (progress.completedAt || now.toLocaleDateString('cs-CZ'));
          $('certId').textContent = progress.certificateId ? `ID certifikátu: ${progress.certificateId}` : '';

          const scoresEl = $('certScores');
          scoresEl.innerHTML = '';
          data.levels.forEach((l) => {
            const sec = progress.bestTimes[l.lvl]?.sec || 0;
            totalSec += sec;
            const row = document.createElement('div');
            row.className = 'cert-score-row';
            row.innerHTML = `<span>Úroveň ${esc(l.lvl)} (${esc(l.text)}):</span> <span>${formatTime(sec)}</span>`;
            scoresEl.appendChild(row);
          });
          const totalRow = document.createElement('div');
          totalRow.className = 'cert-score-row';
          totalRow.innerHTML = `<span>CELKOVÝ ČAS:</span> <span>${formatTime(totalSec)}</span>`;
          scoresEl.appendChild(totalRow);
        } else {
          $('gameWinTitle').textContent = '🏆 Úroveň dokončena!';
          $('gameWinLvlText').textContent = `Úroveň ${lvl.lvl}: ${lvl.text}`;
        }
        $('gameWinStats').textContent = `⏱ Čas: ${timeStr} | Obtížnost: ${diffName}`;

        const rankParts = [];
        if (typeof ranks.levelRank === 'number') rankParts.push(`🥇 Pořadí v úrovni ${lvl.lvl}: ${ranks.levelRank}. místo`);
        if (typeof ranks.totalRank === 'number') rankParts.push(`🏆 Celkové pořadí: ${ranks.totalRank}. místo`);
        if (ranks.alreadyPlayed && ranks.alreadyPlayedMsg) rankParts.push(ranks.alreadyPlayedMsg);
        const rankEl = $('gameWinRank');
        if (rankParts.length) {
          rankEl.textContent = rankParts.join(' | ');
          rankEl.style.color = ranks.alreadyPlayed && typeof ranks.levelRank !== 'number' && typeof ranks.totalRank !== 'number'
            ? '#ffca36'
            : 'var(--grass)';
          rankEl.style.display = 'block';
        } else {
          rankEl.style.display = 'none';
        }

        $('gameWinLeaderboardBtn').onclick = () => openLeaderboardDialog(allDone ? 'all' : String(lvl.lvl));

        const pageUrl = location.href.split('#')[0];
        const player = progress.nick ? `${progress.nick}: ` : '';
        const shareText = allDone
          ? `👑 ${player}Dokončil(a) jsem hru „${title}“ v čase ${formatTime(totalSec)}! ${pageUrl}`
          : `🏆 ${player}${title} – úroveň „${lvl.text}“ za ${timeStr} (${diffName})! ${pageUrl}`;

        $('gameFbShare').onclick = (e) => { e.preventDefault(); shareToFacebook(shareText); };
        $('gameCopyShare').onclick = async () => { try { await navigator.clipboard.writeText(shareText); showToast('Výsledek zkopírován!'); } catch {} };

        const hasNext = currentLvlIdx + 1 < data.levels.length && Number(data.levels[currentLvlIdx + 1].lvl) <= progress.unlocked;
        $('gameNextLvlBtn').style.display = hasNext ? 'inline-block' : 'none';
        $('gameNextLvlBtn').onclick = () => {
          $('gameWinDlg').close();
          const nextIdx = currentLvlIdx + 1;
          const nextLvl = data.levels[nextIdx];
          $('gameNextConfirmDesc').textContent = `Úroveň ${nextLvl.lvl}: ${nextLvl.text}`;
          $('gameNextConfirmStart').onclick = () => { $('gameNextConfirmDlg').close(); startLevel(nextIdx); };
          const later = () => {
            $('gameNextConfirmDlg').close();
            currentLvlIdx = nextIdx;
            refreshLvlSelect();
            $('gamePreStart').style.display = 'grid';
            $('gameRunning').style.display = 'none';
            gameRunning = false;
          };
          $('gameNextConfirmLater').onclick = later;
          $('gameNextConfirmClose').onclick = later;
          $('gameNextConfirmDlg').showModal();
        };

        $('gameWinClose').onclick = () => {
          $('gameWinDlg').close();
          $('gamePreStart').style.display = 'grid';
          $('gameRunning').style.display = 'none';
          gameRunning = false;
        };
        $('gameWinDlg').showModal();
      }

      function showExitDialog() {
        stopTimer();
        const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
        const timeStr = formatTime(elapsedSec);
        const lvl = data.levels[currentLvlIdx];
        const diffName = data.difficulties[currentDiffKey]?.name || currentDiffKey;

        $('gameExitMsg').innerHTML = `V úrovni <strong>${esc(lvl.text)}</strong> máte nalezeno <strong>${currentQIdx} z ${orderedQuestions.length}</strong> objektů.<br>Dosažený čas: <strong>${timeStr}</strong> (${esc(diffName)}).`;
        const pageUrl = location.href.split('#')[0];
        const shareText = `🎯 ${title}: V úrovni „${lvl.text}“ mám nalezeno ${currentQIdx}/${orderedQuestions.length} objektů za ${timeStr}! ${pageUrl}`;

        $('gameExitFbShare').onclick = (e) => { e.preventDefault(); shareToFacebook(shareText); };
        $('gameExitCopyShare').onclick = async () => { try { await navigator.clipboard.writeText(shareText); showToast('Výsledek zkopírován!'); } catch {} };
        $('gameExitConfirm').onclick = () => { $('gameExitDlg').close(); setGameMode(false); };
        $('gameExitClose').onclick = () => { $('gameExitDlg').close(); if (gameRunning) startTimerLoop(); };
        $('gameExitDlg').showModal();
      }

      cleanupFn = () => {
        if (gameActive) setGameMode(false);
        if (unsubFrame) { unsubFrame(); unsubFrame = null; }
        if (unsubClick) { unsubClick(); unsubClick = null; }
        stopTimer();
        clearMarkers();
        gameFold?.remove();
        $('najdiToRoot')?.remove();
      };
    },
    onDestroy() {
      if (cleanupFn) { cleanupFn(); cleanupFn = null; }
    },
  });
})();

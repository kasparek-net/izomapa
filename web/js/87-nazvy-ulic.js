  // Názvy ulic: hlavní silnice, třídy a sběrné, víc zblízka i obytné (`ulice` v základu čtverce z overlay.py: [název, přednost,
  // [x, y, x, y, …] ve světě]). Jen zblízka, malým světlým písmem s tmavým obrysem, natočené podél ulice. Každá ulice na obrazovce jednou
  // (velmi dlouhá víckrát, popisky aspoň 0,7 obrazovky od sebe); nepřekrývá jiný název, špendlíky míst, značky vrstev ani kartu,
  // a kde ulici zakrývá dům, popisek nedá. Místo se hledá jen při změně výřezu a drží se, dokud je volné (při posunu neskáče).
  // Vypíná ho stávající přepínač Popisky. Vozidla a čísla linek jedou přes něj (kreslí se později).
  const UL = [], ULT = new Map(), UL_FS = 12, UL_OD = 0.19, UL_DO = 0.24, UL_OBYT = 0.32;   // UL_OD–UL_DO: měřítko, kde popisky plynule naskočí; obytné ulice (přednost 3) až od UL_OBYT
  let ulKey = '', ulT = 0, ulOut = [], ulPrev = new Map(), ulUi = [0, []];
  onChunk.push((k, d) => {
    for (const [n, pr, w] of d.ulice || []) {
      const u = { n, pr, k, ix: [], iy: [], d: [], s: [], bb: [1e9, 1e9, -1e9, -1e9] };
      for (let i = 0; i < w.length; i += 2) {
        const h = gz(w[i], w[i + 1]), [a, b] = toImg(w[i], w[i + 1], h), j = u.ix.length;
        u.ix.push(a); u.iy.push(b); u.d.push(depth(w[i], w[i + 1], h));
        u.s.push(j ? u.s[j - 1] + Math.hypot(a - u.ix[j - 1], b - u.iy[j - 1]) : 0);
        u.bb = [Math.min(u.bb[0], a), Math.min(u.bb[1], b), Math.max(u.bb[2], a), Math.max(u.bb[3], b)];
      }
      UL.push(u);
    }
    UL.sort((a, b) => a.pr - b.pr || b.s[b.s.length - 1] - a.s[a.s.length - 1]);   // hlavní a delší dostanou místo dřív
    ulKey = '';
  });
  const ulAt = (u, s) => {                                 // bod ulice ve vzdálenosti s (pixely obrázku) od začátku: [ix, iy, hloubka]
    let lo = 0, hi = u.s.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (u.s[m] <= s) lo = m; else hi = m; }
    const f = Math.min(1, Math.max(0, (s - u.s[lo]) / ((u.s[hi] - u.s[lo]) || 1)));
    return [u.ix[lo] + (u.ix[hi] - u.ix[lo]) * f, u.iy[lo] + (u.iy[hi] - u.iy[lo]) * f, u.d[lo] + (u.d[hi] - u.d[lo]) * f];
  };
  function ulText(n, dpr) {                                // bitmapa názvu s obrysem (cache; dokud se nenačte písmo, necachovat)
    const key = n + '|' + dpr; let T = ULT.get(key);
    if (T) return T;
    const font = `500 ${UL_FS}px ${DISPLAY_FONT}`, c = document.createElement('canvas'), g = c.getContext('2d');
    g.font = font; const w = Math.ceil(g.measureText(n).width) + 6, h = UL_FS + 6;
    c.width = Math.ceil(w * dpr); c.height = Math.ceil(h * dpr);
    g.scale(dpr, dpr); g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.lineWidth = 3; g.strokeStyle = 'rgba(20,26,40,0.85)'; g.strokeText(n, w / 2, h / 2 + 0.5);
    g.fillStyle = '#f3efe2'; g.fillText(n, w / 2, h / 2 + 0.5);
    T = { c, w, h };
    if (document.fonts.check(font)) ULT.set(key, T);
    return T;
  }
  // překážky v pixelech obrazovky: ovládání nad mapou (panel, karta, minimapa, tlačítka, aktuality; obdélníky čtené nejvýš 3× za sekundu),
  // špendlíky míst a značky vrstev z minulého snímku
  const UL_UI = '#panel, #card, #minimap, .controls, #qbar, #wxPop, .akt';
  function ulObst(sx, ox, oy, cw, ch) {
    if (performance.now() - ulUi[0] > 300) {
      const b = fx.getBoundingClientRect();
      ulUi = [performance.now(), [...document.querySelectorAll(UL_UI)].filter((e) => !e.hidden).map((e) => e.getBoundingClientRect())
        .filter((a) => a.width && a.height).map((a) => [a.left - b.left, a.top - b.top, a.right - b.left, a.bottom - b.top])];   // pevně umístěné: offsetParent je null
    }
    const r = [...ulUi[1]];
    if (!document.body.classList.contains('plugins-hide-pins')) for (const p of [...OV.places, ...(OV.needs || [])]) {
      const X = ox + p.xy[0] * sx, Y = oy + p.xy[1] * sx;
      if (!p.el || X < -300 || Y < -80 || X > cw + 300 || Y > ch + 80) continue;
      const w = p._w || (p._w = p.el.offsetWidth), h = p._h || (p._h = p.el.offsetHeight), up = p.el.classList.contains('need') ? 2.6 : 1.4;
      if (w) r.push([X - w / 2 - 4, Y - up * h - 4, X + w / 2 + 4, Y + 2]);   // OSD dá levý horní roh do bodu, CSS .pin posune o -50 % a -140 % (need -260 %), nožička dolů k bodu
    }
    return r;
  }
  // rozmístění: [{u, c (místo na ulici), ix, iy (střed v obrázku), x, y, a (úhel), T, kk (kruhy obsazeného místa)}]; kandidáti po celých násobcích kroku podél ulice
  function ulPlace(sx, ox, oy, cw, ch, dpr) {
    const out = [], kruhy = [], obst = ulObst(sx, ox, oy, cw, ch), byName = new Map(), prev = new Map();
    const krok = 2 ** Math.round(Math.log2(36 / sx)), minD = 0.7 * Math.max(cw, ch), M = 6;
    const volno = (x, y, r) => !kruhy.some((k) => (k[0] - x) ** 2 + (k[1] - y) ** 2 < (k[2] + r) ** 2)
      && !obst.some((b) => { const dx = x - Math.max(b[0], Math.min(x, b[2])), dy = y - Math.max(b[1], Math.min(y, b[3])); return dx * dx + dy * dy < r * r; });
    const zkus = (u, c, Lt, T) => {
      const p0 = ulAt(u, c - Lt / 2), p1 = ulAt(u, c + Lt / 2);
      const X0 = ox + p0[0] * sx, Y0 = oy + p0[1] * sx, X1 = ox + p1[0] * sx, Y1 = oy + p1[1] * sx, L = Math.hypot(X1 - X0, Y1 - Y0);
      if (L < T.w * 0.9) return null;                                  // ulice se v okně stáčí (oblouk je kratší než text)
      for (const [X, Y] of [[X0, Y0], [X1, Y1]]) if (X < M || Y < M || X > cw - M || Y > ch - M) return null;
      const nx = -(Y1 - Y0) / L, ny = (X1 - X0) / L;
      for (let i = 0; i < u.s.length; i++) if (u.s[i] > c - Lt / 2 && u.s[i] < c + Lt / 2 && Math.abs((ox + u.ix[i] * sx - X0) * nx + (oy + u.iy[i] * sx - Y0) * ny) > 3.5) return null;   // jen rovný kus
      const n = Math.max(2, Math.ceil(T.w / T.h)), r = T.h * 0.55, kk = [];
      let zakryto = 0;
      for (let i = 0; i <= n; i++) {
        const f = i / n, X = X0 + (X1 - X0) * (0.5 + (f - 0.5) * T.w / L), Y = Y0 + (Y1 - Y0) * (0.5 + (f - 0.5) * T.w / L);
        if (!volno(X, Y, r)) return null;
        const q = ulAt(u, c + (f - 0.5) * T.w / sx);
        if (occluded(q[0], q[1], q[2]) && (++zakryto > n / 5 || 2 * i === n)) return null;   // ulice za domem (kraj textu přes roh domu nevadí)
        kk.push([X, Y, r]);
      }
      let a = Math.atan2(Y1 - Y0, X1 - X0); if (a > Math.PI / 2) a -= Math.PI; else if (a < -Math.PI / 2) a += Math.PI;   // text nikdy vzhůru nohama
      return { u, c, ix: (p0[0] + p1[0]) / 2, iy: (p0[1] + p1[1]) / 2, x: (X0 + X1) / 2, y: (Y0 + Y1) / 2, a, T, kk };
    };
    for (const u of UL) {
      if (u.pr > 2 && sx < UL_OBYT) continue;
      if (!shown(u.k) || ox + u.bb[2] * sx < 0 || oy + u.bb[3] * sx < 0 || ox + u.bb[0] * sx > cw || oy + u.bb[1] * sx > ch) continue;
      const T = ulText(u.n, dpr), Lt = (T.w + 14) / sx, L = u.s[u.s.length - 1];
      if (L < Lt) continue;
      const cand = [], k0 = Math.ceil(Lt / 2 / krok), k1 = Math.floor((L - Lt / 2) / krok);
      for (let k = k0; k <= k1; k++) cand.push(k * krok);
      if (!cand.length) cand.push(L / 2);
      const was = ulPrev.get(u) || [], dc = (c) => { const p = ulAt(u, c), X = ox + p[0] * sx - cw / 2, Y = oy + p[1] * sx - ch / 2; return X * X + Y * Y; };
      cand.sort((a, b) => (was.includes(b) - was.includes(a)) || dc(a) - dc(b));   // minulé místo má přednost, pak blíž středu obrazovky
      const mine = byName.get(u.n) || [];
      for (const c of cand) {
        const p = ulAt(u, c), X = ox + p[0] * sx, Y = oy + p[1] * sx;
        if (mine.some((q) => Math.hypot(q[0] - X, q[1] - Y) < minD)) continue;
        const o = zkus(u, c, Lt, T);
        if (!o) continue;
        out.push(o); kruhy.push(...o.kk); mine.push([o.x, o.y]); byName.set(u.n, mine);
        prev.set(u, [...(prev.get(u) || []), c]);
      }
    }
    ulPrev = prev;
    return out;
  }
  function drawUlice(sx, ox, oy, cw, ch, dpr) {
    const fade = Math.min(1, (sx - UL_OD) / (UL_DO - UL_OD));
    if (fade <= 0 || !UL.length || !$('l-labels').checked) { if (window.__test) window.__test.ulice = []; return; }
    // nové rozmístění při změně výřezu, při posunu mapy nejvýš ~7× za sekundu (1–5 ms); mezi tím se hotové popisky jen posunou s mapou
    const key = [Math.round(ox), Math.round(oy), sx.toFixed(5), cw, ch, dpr, ulUi[1].length].join('|');
    if (key !== ulKey && performance.now() - ulT > 140) { ulKey = key; ulT = performance.now(); ulOut = ulPlace(sx, ox, oy, cw, ch, dpr); }
    for (const o of ulOut) { o.x = ox + o.ix * sx; o.y = oy + o.iy * sx; }
    if (window.__test) window.__test.ulice = ulOut.map((o) => ({ n: o.u.n, x: o.x, y: o.y, a: o.a, kk: o.kk }));
    ctx.save(); ctx.globalAlpha = fade; ctx.imageSmoothingEnabled = true;
    for (const o of ulOut) {
      ctx.setTransform(dpr * Math.cos(o.a), dpr * Math.sin(o.a), -dpr * Math.sin(o.a), dpr * Math.cos(o.a), dpr * o.x, dpr * o.y);
      ctx.drawImage(o.T.c, -o.T.w / 2, -o.T.h / 2, o.T.w, o.T.h);
    }
    ctx.restore();
  }

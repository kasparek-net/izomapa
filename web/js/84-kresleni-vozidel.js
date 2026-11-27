  // světla vozidel v noci: sesbírat za celý snímek a nakreslit třemi cestami (kužely, přední, zadní) místo stovek fill()
  const LIGHTS_SX = 0.35, NL = { beams: [], head: [], tail: [] };
  function flushLights(night, sx) {
    if (NL.beams.length) {
      const a = Math.min(1, (night - 0.3) / 0.4), q = Math.max(1, sx * 3);
      ctx.globalAlpha = a * 0.35; ctx.fillStyle = '#ffe7a3'; ctx.beginPath();
      for (const b of NL.beams) { b.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); }
      ctx.fill(); ctx.globalAlpha = a;
      ctx.fillStyle = '#fff4c8'; ctx.beginPath(); for (const [x, y] of NL.head) ctx.rect(x - q / 2, y - q / 2, q, q); ctx.fill();
      ctx.fillStyle = '#ff3b2f'; ctx.beginPath(); for (const [x, y] of NL.tail) ctx.rect(x - q / 2, y - q / 2, q, q); ctx.fill();
      ctx.globalAlpha = 1;
    }
    NL.beams.length = NL.head.length = NL.tail.length = 0;
  }
  // je bod světa (x, y, z) z pohledu mapy zakrytý budovou, mostovkou nebo stromem? (stejné tvary jako ořez vozidel v drawBehindTrees)
  function svetloSkryte(x, y, z) {
    const [ix, iy] = toImg(x, y, z);
    for (const q of treeShapes(x, y, z, [ix - 1, iy - 1, ix + 1, iy + 1])) {
      if (q[0] === 2) { if (stromPixel(q, ix, iy)) return true; }
      else if (q[0] === 0) { const [a, b, r] = [q[1], q[2], q[3]]; if (iy >= a[1] && iy <= b[1] && Math.abs(ix - a[0]) <= r * (iy - a[1]) / Math.max(1e-6, b[1] - a[1])) return true; }
      else if (q[0] === 1) { const dx = (ix - q[1][0]) / q[2], dy = (iy - q[1][1]) / q[3]; if (dx * dx + dy * dy <= 1) return true; }
      else if (q[0] === 3) { let c = false; const h = q[1]; for (let i = 0, j = h.length - 1; i < h.length; j = i++) if ((h[i][1] > iy) !== (h[j][1] > iy) && ix < (h[j][0] - h[i][0]) * (iy - h[i][1]) / (h[j][1] - h[i][1]) + h[i][0]) c = !c; if (c) return true; }
    }
    return false;
  }
  // Text na plátně (měření, obrys) je nejdražší operace snímku: čísla linek a názvy čtvrtí se nakreslí jednou do obrázku
  // a pak se jen kopírují na celé pixely (z Liberce, 25. 11. 2026). Po dotažení písma se obrázky kreslí znovu.
  const CISLA = new Map(), NAZVY = new Map(), MER = document.createElement('canvas').getContext('2d');
  if (document.fonts) document.fonts.addEventListener('loadingdone', () => { CISLA.clear(); NAZVY.clear(); });
  function cisloLinky(X_, Y_, line, typ, ring) {            // X_, Y_ celé pixely CSS (střed štítku)
    // obrázek pro každou část pixelu, na kterou připadne střed (dpr 1,5): text vyjde stejně jako přímo kreslený
    const m = ctx.getTransform(), AX = X_ * m.a + m.e, AY = Y_ * m.d + m.f, ix = Math.floor(AX), iy = Math.floor(AY), key = `${line}|${typ}|${m.a}|${AX - ix}|${AY - iy}`;
    let c = CISLA.get(key);
    if (!c) {
      if (CISLA.size > 500) CISLA.clear();
      MER.font = '700 13px "Atkinson Hyperlegible", system-ui, sans-serif'; const tw = Math.ceil(MER.measureText(line).width) + 10;
      c = document.createElement('canvas'); c.P = Math.ceil((tw / 2 + 2) * m.a) + 1; c.Q = Math.ceil(11 * m.a) + 1; c.width = 2 * c.P; c.height = 2 * c.Q; c.tw = tw;
      const g = c.getContext('2d'); g.setTransform(m.a, 0, 0, m.d, c.P + AX - ix, c.Q + AY - iy); g.font = MER.font;
      g.fillStyle = '#16191f'; g.fillRect(-tw / 2 - 1, -10, tw + 2, 19);
      g.fillStyle = typ === 0 ? '#c4352b' : typ === 2 ? '#2f7d4f' : '#1f6fb2'; g.fillRect(-tw / 2, -9, tw, 17);
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(line, 0, 0);
      CISLA.set(key, c);
    }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(c, ix - c.P, iy - c.Q); ctx.restore();
    if (ring) { ctx.strokeStyle = '#f2c66d'; ctx.lineWidth = 2; ctx.strokeRect(X_ - c.tw / 2 - 2, Y_ - 11, c.tw + 4, 21); }   // rámeček se textu nedotýká
  }
  // název čtvrti jako dva obrázky (obrys a výplň zvlášť, každý se kreslí s průhledností jako dřív text): { tw, s: [plátno, x, y], f: … }
  function nazev(txt, font, dpr) {
    const key = `${txt}|${font}|${dpr}`; let n = NAZVY.get(key); if (n) return n;
    MER.font = font; MER.textAlign = 'center'; MER.textBaseline = 'middle';
    const mt = MER.measureText(txt), pad = 22;                    // rezerva na špičky obrysu (lineJoin miter)
    const P = Math.ceil((mt.actualBoundingBoxLeft + pad) * dpr), Q = Math.ceil((mt.actualBoundingBoxAscent + pad) * dpr);
    const W_ = P + Math.ceil((mt.actualBoundingBoxRight + pad) * dpr), H_ = Q + Math.ceil((mt.actualBoundingBoxDescent + pad) * dpr);
    const vrstva = (kresli) => {                                  // nakreslit s rezervou a oříznout na neprůhledné pixely
      const c = document.createElement('canvas'); c.width = W_; c.height = H_;
      const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, P, Q); g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; kresli(g);
      const a = g.getImageData(0, 0, W_, H_).data; let x0 = W_, y0 = H_, x1 = -1, y1 = -1;
      for (let y = 0; y < H_; y++) for (let x = 0; x < W_; x++) if (a[(y * W_ + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 < 0) return null;
      const o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1; o.getContext('2d').drawImage(c, -x0, -y0);
      return [o, x0 - P, y0 - Q];
    };
    n = { tw: mt.width / 2 + 6, s: vrstva((g) => { g.lineWidth = 4; g.strokeStyle = 'rgba(20,26,40,0.75)'; g.strokeText(txt, 0, 0); }), f: vrstva((g) => { g.fillStyle = '#f3efe2'; g.fillText(txt, 0, 0); }) };
    NAZVY.set(key, n);
    return n;
  }
  // velká vozidla (autobus, tramvaj, vlak, kamion, sypač) nakreslená v tomto snímku: lidé za nimi se nekreslí (hidden v 89-kresleni.js).
  // Obrys = konvexní obal kvádru vozu v bodech obrázku, d = hloubka středu vozu; maže se na začátku každého snímku (z Liberce, 25. 11. 2026)
  const VOZ_OCC = [];
  const vozZakryje = (ix, iy, d) => VOZ_OCC.some((b) => b.d < d - 1 && ix >= b.bb[0] && ix <= b.bb[2] && iy >= b.bb[1] && iy <= b.bb[3] && inPoly(ix, iy, b.hull));
  const obal = (P) => {                                       // konvexní obal (monotónní řetězec)
    P.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const x = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], hi = [];
    for (const p of P) { while (lo.length > 1 && x(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (hi.length > 1 && x(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
    return lo.slice(0, -1).concat(hi.slice(0, -1));
  };
  function drawVehicle(o, len, wid, col, sx, ox, oy, night, isBus, lights = 3) {   // lights: 1 přední, 2 zadní
    const L = Math.hypot(o.dx, o.dy) || 1, fx_ = o.dx / L * (o.dirSign || 1), fy_ = o.dy / L * (o.dirSign || 1);
    const sxv = -fy_, syv = fx_;
    const lane = o.lane ?? 1.6, cxw = o.x - sxv * lane, cyw = o.y - syv * lane;
    const h0 = o.z ?? gz(cxw, cyw);                                            // výška silnice (na mostovce mostovka), jinak terén
    const base = toImg(cxw, cyw, h0);
    const nd = ndirOf(isBus), k = ((Math.round(Math.atan2(fy_, fx_) / (Math.PI * 2) * nd) % nd) + nd) % nd;
    const spr = vehicleSprite(col, k, isBus, len, wid, state.season === 'winter');
    drawBehindTrees(spr.c, base[0] + spr.x0, base[1] + spr.y0, spr.c.width, spr.c.height, cxw, cyw, h0, sx, ox, oy);
    if (isBus) {                                              // velký vůz zakryje lidi za sebou (výška ~3 m)
      const P = [];
      for (const s of [-len / 2, len / 2]) for (const t of [-wid / 2, wid / 2]) for (const h of [0, 3.1]) P.push(toImg(cxw + fx_ * s + sxv * t, cyw + fy_ * s + syv * t, h0 + h).slice(0, 2));
      const hull = obal(P), xs = hull.map((p) => p[0]), ys = hull.map((p) => p[1]);
      VOZ_OCC.push({ hull, d: depth(cxw, cyw, h0), bb: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] });
    }
    if (night > 0.3 && !o.noLights && sx >= LIGHTS_SX) {                                    // světla jen při přiblížení; kreslí se najednou (flushLights)
      const P = (s, t, h) => { const p = toImg(cxw + fx_ * s + sxv * t, cyw + fy_ * s + syv * t, h0 + h); return [ox + p[0] * sx, oy + p[1] * sx]; };
      const l = len / 2, w = wid / 2, V = (s, h) => !svetloSkryte(cxw + fx_ * s, cyw + fy_ * s, h0 + h);   // světla za budovou nebo stromem se nekreslí
      const head = (lights & 1) && V(l, 0.7), tail = (lights & 2) && V(-l, 0.7);
      if (head && V(l + 7, 0.3) && V(l + 14, 0.1)) NL.beams.push([P(l, -w, 0.6), P(l + 14, -w - 4, 0.1), P(l + 14, w + 4, 0.1), P(l, w, 0.6)]);
      for (const t of [-w * 0.7, w * 0.7]) { if (head) NL.head.push(P(l, t, 0.7)); if (tail) NL.tail.push(P(-l, t, 0.7)); }
    }
    return true;
  }
  // vánoční strom na náměstí Míru (v zimě, večer svítí)
  const xmas = (() => {
    const c = document.createElement('canvas'); c.width = 30; c.height = 48; const g = c.getContext('2d');
    g.fillStyle = '#4a3020'; g.fillRect(13, 41, 4, 6);
    const lights = [];
    for (let i = 0; i < 6; i++) {
      const top = 6 + i * 6, hw = 4 + i * 2.2;
      for (let y = 0; y < 9; y++) { const w_ = Math.round(hw * (y + 1) / 9); g.fillStyle = y < 2 ? '#2f6a42' : '#1f4f30'; g.fillRect(15 - w_, top + y, w_ * 2, 1); g.fillStyle = '#e8eef5'; if (y === 0) g.fillRect(15 - w_, top, w_ * 2, 1); }
      for (let k = 0; k < 3 + i; k++) lights.push([15 - hw + rnd(i * 10 + k) * hw * 2, top + 4 + rnd(i * 7 + k) * 4]);
    }
    g.fillStyle = '#f6d34a'; g.fillRect(13, 1, 4, 4); g.fillRect(14, 0, 2, 6); g.fillRect(12, 2, 6, 2);
    return { c, lights };
  })();
  const xmasPts = (() => {
    const pts = Array.isArray(OV.xmas?.[0]) ? [...OV.xmas] : OV.xmas ? [OV.xmas] : [];
    const s = {{STROM}};
    if (s && s.length === 2) {
      const x = (s[1] - cam.lon0) * cam.kx, y = (s[0] - cam.lat0) * cam.ky, p = toImg(x, y, gz(x, y));
      if (!pts.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 5)) pts.push(p);
    }
    return pts;
  })();
  // vánoční stromy (mesto.json "vanocni_strom"): strom samotný je ve vrstvě výzdoby (render.html mode=xmas), tady jen blikající světýlka
  // na jeho patrech. Tvar pater musí odpovídat render.html: patro i má spodek 1,2 + 1,75 i m, výšku 3 m a poloměr 3,7 − 0,56 i m.
  const xmasTrees = ({{XMAS_LL}} || []).map(([lat, lon], n) => {
    const x = (lon - cam.lon0) * cam.kx, y = (lat - cam.lat0) * cam.ky, g = gz(x, y), lights = [];
    for (let i = 0; i < 6; i++) {
      const z0 = 1.2 + i * 1.75, r = 3.7 - i * 0.56;
      for (let k = 0; k < 7 - i; k++) {
        const u = 0.12 + rnd(n * 100 + i * 10 + k) * 0.6, a = (225 + (rnd(n * 100 + i * 10 + k + 5) - 0.5) * 150) * Math.PI / 180;   // přivrácená strana (pohled od JZ)
        lights.push(toImg(x + Math.cos(a) * r * (1 - u), y + Math.sin(a) * r * (1 - u), g + z0 + 3.0 * u));
      }
    }
    return { c: toImg(x, y, g + 7), lights };
  });
  // kluziště (mesto.json "kluziste": [{lat, lon, d: délka m, s: šířka m, a: natočení delší strany ve ° od východu}]): jen v zimě
  const rinks = ({{KLUZISTE}} || []).map((k, i) => {
    const cx = (k.lon - cam.lon0) * cam.kx, cy = (k.lat - cam.lat0) * cam.ky, a = (k.a || 0) * Math.PI / 180, L = k.d || 40, W = k.s || 20;
    const ux = Math.cos(a), uy = Math.sin(a);
    const at = (s, t) => [cx + ux * s - uy * t, cy + uy * s + ux * t];
    const h = Math.max(...[-1, 0, 1].flatMap((i) => [-1, 0, 1].map((j) => gz(...at(i * L / 2, j * W / 2))))) + 0.12;   // vršek ledu jako v render.html
    const sk = Array.from({ length: Math.max(4, Math.round(L * W / 70)) }, (_, j) => ({ r: 0.3 + rnd(i * 50 + j) * 0.65, ph: rnd(i * 50 + j + 7) * 6.283,
      v: (0.18 + rnd(i * 50 + j + 3) * 0.2) * (j % 6 ? 1 : -1), col: SKIC[j % SKIC.length], hat: SKIC[(j * 3 + 1) % SKIC.length] }));
    return { at, ring: [at(-L / 2, -W / 2), at(L / 2, -W / 2), at(L / 2, W / 2), at(-L / 2, W / 2)], h, L, W, sk };
  });
  // vánoční stánky (mesto.json "vanocni_stanky"): stánky jsou ve vrstvě výzdoby (render.html mode=xmas), tady jen noční osvětlení.
  // Rozměry musí odpovídat render.html: stánek w × 2,4 m, okap 2,2 m, pult na straně −t, okénko 0,95–1,95 m.
  const stalls = [];
  for (const k of {{STANKY}} || []) {
    const n = k.n || 5, wS = k.w || 3.0, m = k.m ?? 1.2, a = (k.a || 0) * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a);
    const x0 = (k.lon - cam.lon0) * cam.kx, y0 = (k.lat - cam.lat0) * cam.ky;
    for (let i = 0; i < n; i++) {
      const sc = (i - (n - 1) / 2) * (wS + m), cx = x0 + ux * sc, cy = y0 + uy * sc, g = gz(cx, cy);
      const P = (s, t, h) => toImg(cx + ux * s - uy * t, cy + uy * s + ux * t, g + h), l = wS / 2;
      stalls.push({ c: P(0, 0, 1),
        win: [P(-l + 0.25, -1.23, 0.95), P(l - 0.25, -1.23, 0.95), P(l - 0.25, -1.23, 1.95), P(-l + 0.25, -1.23, 1.95)],
        pool: [P(-l - 0.8, -1.3, 0), P(l + 0.8, -1.3, 0), P(l + 2.2, -5.5, 0), P(-l - 2.2, -5.5, 0)],
        bulbs: Array.from({ length: 6 }, (_, j) => P(-l + 0.25 + j * (wS - 0.5) / 5, -1.45, 1.9)) });
    }
  }
  // svíčky na hrobech (overlay/<čtverec>.json "svicky": [x, y obrázku, náhoda]), kreslí se večer
  const svicky = [], SVB = 512, svGrid = new Map();             // mřížka po 512 px obrázku: každý snímek jen buňky ve výřezu
  onChunk.push((k, d) => {
    for (const [x, y, u] of d.svicky || []) {
      const q = [x, y, u, k], key = Math.floor(x / SVB) + ',' + Math.floor(y / SVB);
      svicky.push(q); if (!svGrid.has(key)) svGrid.set(key, []); svGrid.get(key).push(q);
    }
  });

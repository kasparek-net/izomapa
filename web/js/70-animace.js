  // ---------- animovaná vrstva ----------
  const fx = $('fx'), ctx = fx.getContext('2d');
  viewer.canvas.insertBefore(fx, viewer.canvas.lastChild);           // mezi dlaždice a popisky: vozidla nepřekryjí názvy míst
  const rnd = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const DISTRICTS = (OV.districts || []).slice().sort((p, q) => (q.k === 'obec') - (p.k === 'obec') || q.a - p.a);   // obce před místními částmi
  const DISPLAY_FONT = getComputedStyle(document.documentElement).getPropertyValue('--display').trim() || 'monospace';
  const sid = (str) => { let h = 7; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return Math.abs(h) % 1000003; };
  const occluded = (ix, iy, d) => {
    for (const b of grid.get(Math.floor(ix / CELL) + ',' + Math.floor(iy / CELL)) || [])
      if (shown(b.k) && b.d < d - 3 && ix >= b.bb[0] && ix <= b.bb[2] && iy >= b.bb[1] && iy <= b.bb[3] && inPoly(ix, iy, b.hull)) return true;
    return false;
  };
  // silniční graf
  const roads = [], ends = new Map(), cars = [];
  // vjezd na kruhový objezd: auto dá přednost autům na okruhu (25 m před vjezdem nebo právě v něm)
  function yieldZ(r, y) {
    const e = y[0] < 1 ? r.w[0] : r.w[r.w.length - 1], z = [y[0]];
    z.t = y[0] < 1 ? -1 : 1;                // jen pro směr k okruhu: auto vyjíždějící z okruhu by jinak čekalo samo na sebe a zablokovalo okruh
    z.rb = { k: y[1].toFixed(0) + ',' + y[2].toFixed(0), cx: y[1], cy: y[2], R: y[3], an: Math.atan2(e[1] - y[2], e[0] - y[1]) };
    return z;
  }
  function ringFree(g) {
    for (const c of cars) {
      if (c.q > tShare || roads[c.r].rbk !== g.k) continue;
      const o = along(roads[c.r], c.s), rx = o.x - g.cx, ry = o.y - g.cy, turn = Math.sign((rx * o.dy - ry * o.dx) * c.dir) || 1;   // směr jízdy po okruhu
      let d = ((g.an - Math.atan2(ry, rx)) * turn) % (2 * Math.PI); if (d < 0) d += 2 * Math.PI;
      if (d * g.R < 25 || (2 * Math.PI - d) * g.R < 5) return false;
    }
    return true;
  }
  const blocked = (z) => z.rb ? !ringFree(z.rb) : (z.g || z.xc).closed;    // vjezd na kruhový objezd, zavřený přejezd (skupina z.g) nebo semafor (fáze z.xc)
  // železniční přejezdy (z[0] metry od začátku kusu, z[1..2] svět): zavřeno ~25 s před příjezdem vlaku, dokud neprojede poslední vůz
  // Přejezdy přes sousední koleje (do XG_M od sebe) tvoří jeden přejezd: jedny výstražníky před první a za poslední kolejí,
  // zavřeno, když jede vlak po kterékoli koleji (v OSM je přejezd zvlášť na každé koleji).
  const XC = new Map(), xings = [], XG = [], XG_M = 15;
  function addXing(r, z) {
    const key = Math.round(z[1]) + ',' + Math.round(z[2]);
    if (!XC.has(key)) XC.set(key, { x: z[1], y: z[2], closed: false, on: null });
    z.xc = XC.get(key);
    let g = XG.find((q) => q.pts.some(([x, y]) => Math.hypot(x - z[1], y - z[2]) < XG_M));
    if (!g) XG.push(g = { pts: [], cs: new Set(), closed: false });
    g.pts.push([z[1], z[2]]); g.cs.add(z.xc); z.g = g;
    const lead = xings.find(([r2, z2]) => r2 === r && z2.g === g);       // na jednom kusu silnice jedny výstražníky pro celou skupinu
    if (lead) { lead[1].s0 = Math.min(lead[1].s0, z[0]); lead[1].s1 = Math.max(lead[1].s1, z[0]); }
    else { z.s0 = z.s1 = z[0]; xings.push([r, z]); }
  }
  function xingShapes(c) {                                 // na kterých tratích (tvar, metry od začátku) přejezd leží
    c.on = [];
    MHD.shapes.forEach((sh, i) => {
      let best = 4, bs = 0;
      for (let k = 1; k < sh.w.length; k++) {
        const a = sh.w[k - 1], b = sh.w[k], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((c.x - a[0]) * dx + (c.y - a[1]) * dy) / l2)), d = Math.hypot(a[0] + dx * t - c.x, a[1] + dy * t - c.y);
        if (d < best) { best = d; bs = sh.len[k - 1] + (sh.len[k] - sh.len[k - 1]) * t; }
      }
      if (best < 4) c.on.push([i, bs]);
    });
  }
  const trainS = (trip, el) => {                           // metry po trati jako v mhdPos (střed vlaku)
    const q = trip[4]; let i = 2; while (i < q.length - 2 && q[i] < el) i += 2;
    const f = Math.max(0, Math.min(1, (el - q[i - 2]) / ((q[i] - q[i - 2]) || 1)));
    return q[i - 1] + (q[i + 1] - q[i - 1]) * f;
  };
  const busWait = new Map();                               // zpoždění autobusů a tramvají (s) čekajících na přejezdu
  const shapeSigs = new Map();                             // semafory na trase autobusu: [metry po trase, semafor]; jen ve směru jízdy po stejné silnici
  function sigsOnShape(i) {
    const hit = shapeSigs.get(i);
    if (hit && hit.n === sigPosts.length) return hit.list;
    const sh = MHD.shapes[i], list = [];
    for (const [r, z] of sigPosts) {
      const o = along(r, z[0]), ol = Math.hypot(o.dx, o.dy) || 1;
      for (let k = 1; k < sh.w.length; k++) {
        const a = sh.w[k - 1], b = sh.w[k], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((o.x - a[0]) * dx + (o.y - a[1]) * dy) / l2));
        const dot = (dx * o.dx + dy * o.dy) / (Math.sqrt(l2) * ol);
        if (Math.hypot(a[0] + dx * t - o.x, a[1] + dy * t - o.y) < 4 && Math.abs(dot) > 0.8 && (!z.t || Math.sign(dot) === z.t)) { list.push([sh.len[k - 1] + (sh.len[k] - sh.len[k - 1]) * t - z.d, z]); break; }   // stop čára z.d m před semaforem, jen směr ke křižovatce
      }
    }
    shapeSigs.set(i, { n: sigPosts.length, list });
    return list;
  }
  function busDelay(i, trip, el, dt) {                     // před zavřeným přejezdem a na červenou stát, pak zpoždění dohnat (o polovinu rychleji)
    let d = busWait.get(i) || 0, wait = false;
    if (!XC.size && !sigPosts.length && !d) return 0;
    const s = trainS(trip, el - d);
    for (const c of XC.values()) if (c.closed && c.on) for (const [sh, sc] of c.on) if (sh === trip[1] && s > sc - 10 && s < sc - 2) wait = true;
    for (const [sp, z] of sigsOnShape(trip[1])) if (s > sp - 8 && s < sp && z.xc && z.xc.closed) wait = true;
    d = wait ? d + dt : Math.max(0, d - dt * 0.5);
    if (d) busWait.set(i, d); else busWait.delete(i);
    return d;
  }
  function updateXings() {
    if (!XC.size) return;
    const trains = MHD.on ? MHD.act.filter(([i]) => MHD.routes[MHD.trips[i][0]][1] === 2) : [];
    for (const c of XC.values()) {
      if (!trains.length) { c.closed = false; continue; }
      if (!c.on) xingShapes(c);
      c.closed = trains.some(([i, el]) => {
        const trip = MHD.trips[i], T = TRAINS[trainOf(MHD.routes[trip[0]][0])].cars.reduce((a, q) => a + q.len + 0.4, 0);
        return c.on.some(([sh, s]) => sh === trip[1] && trainS(trip, el + 25) + T / 2 > s - 5 && trainS(trip, el) - T / 2 < s + 8);
      });
    }
    for (const g of XG) g.closed = [...g.cs].some((c) => c.closed);
  }
  // semafory (OV.signals z nastroje/semafory.py, [x, y, křižovatka]): každá křižovatka má cyklus SIG_CYC s pro dvě osy
  // (osa 0 = směr nejvyšší třídy silnice, kolmé příjezdy osa 1); samotný přechod má jen osu 0 a zbytek cyklu patří chodcům.
  // Na kusu silnice r.sg: z = [metry od začátku, x, y], z.t směr jízdy ke křižovatce (0 = oba), z.d stop čára tolik m před bodem.
  const SIG_CYC = 64, SIG = new Map(), sigPosts = [];
  const SIG_RANK = { motorway: 7, trunk: 6, primary: 5, secondary: 4, tertiary: 3, unclassified: 2, residential: 1 };
  for (const [x, y, j] of OV.signals || []) {
    if (!SIG.has(j)) SIG.set(j, { pts: [], app: [], off: rnd(j + 900) * SIG_CYC, st: [{ closed: false, c: 'g' }, { closed: true, c: 'r' }] });
    SIG.get(j).pts.push([x, y]);
  }
  for (const J of SIG.values()) { J.cx = J.pts.reduce((a, p) => a + p[0], 0) / J.pts.length; J.cy = J.pts.reduce((a, p) => a + p[1], 0) / J.pts.length; }
  function projS(r, x, y) {                                // nejbližší bod kusu silnice: [vzdálenost, metry od začátku]
    let best = 1e9, bs = 0;
    for (let k = 1; k < r.w.length; k++) {
      const a = r.w[k - 1], b = r.w[k], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)), d = Math.hypot(a[0] + dx * t - x, a[1] + dy * t - y);
      if (d < best) { best = d; bs = r.len[k - 1] + (r.len[k] - r.len[k - 1]) * t; }
    }
    return [best, bs];
  }
  function addSignals(r) {
    if (!SIG.size || r.c === 'service' || r.c === 'living_street') return;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of r.w) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    for (const J of SIG.values()) {
      if (J.cx < x0 - 60 || J.cx > x1 + 60 || J.cy < y0 - 60 || J.cy > y1 + 60) continue;
      for (const [px, py] of J.pts) {
        const [d, s] = projS(r, px, py);
        if (d > 8) continue;
        const end = s < 1 ? -1 : s > r.L - 1 ? 1 : 0;        // semafor v uzlu na konci kusu: křižovatka je tam
        if (end && r.L < 20) continue;                      // krátký kus uvnitř křižovatky: tam se nestojí
        let t = end;
        if (!end) { const sc = projS(r, J.cx, J.cy)[1]; t = Math.abs(sc - s) < 3 ? 0 : Math.sign(sc - s); }
        if (r.o) { if (t && t !== r.o) continue; t = r.o; }   // jednosměrka: jen směr, kterým se jezdí
        if ((r.sg || []).some((q) => q.J === J && (q.t === t || !q.t || !t))) continue;   // víc bodů jedné křižovatky na tomtéž kusu
        const o = along(r, Math.max(0.5, Math.min(r.L - 0.5, s)));
        const z = [s, px, py]; Object.assign(z, { t, d: end ? 9 : 3, J, ang: Math.atan2(o.dy, o.dx), rank: SIG_RANK[r.c] || 0 });
        (r.sg = r.sg || []).push(z); J.app.push(z); sigPosts.push([r, z]);
        const ref = J.app.reduce((a, q) => (q.rank > a.rank ? q : a));
        for (const q of J.app) { let da = Math.abs(q.ang - ref.ang) % Math.PI; if (da > Math.PI / 2) da = Math.PI - da; q.xc = J.st[da > Math.PI / 4 ? 1 : 0]; }
      }
    }
  }
  function updateSignals() {                               // fáze podle hodin: všichni návštěvníci vidí stejnou barvu
    const t = Date.now() / 1000;
    for (const J of SIG.values()) {
      const p = (t + J.off) % SIG_CYC;
      J.st[0].c = p < 26 ? 'g' : p < 29 ? 'y' : 'r';
      J.st[1].c = p >= 32 && p < 58 ? 'g' : p >= 58 && p < 61 ? 'y' : 'r';
      for (const q of J.st) q.closed = q.c !== 'g';
    }
  }
  const SIG_LAMP = { r: [0, '#ff3b30', '255,59,48'], y: [1, '#ffc21a', '255,194,26'], g: [2, '#38e06a', '56,224,106'] };
  function drawSigPost(o, z, sx, ox, oy, night) {          // semafor: sloup a hlava se třemi světly, v noci svítící světlo září
    const x = ox + o.ix * sx, y = oy + o.iy * sx, h = 24 * sx, q = Math.max(1.6, 2.4 * sx);
    ctx.fillStyle = '#2a2c30'; ctx.fillRect(x - q * 0.3, y - h, q * 0.6, h);
    const hx = x - q * 0.9, hy = y - h - q * 4.2, [on, col, rgb] = SIG_LAMP[z.xc.c];
    ctx.fillStyle = '#17181b'; ctx.fillRect(hx, hy, q * 1.8, q * 4.4);
    for (let k = 0; k < 3; k++) { ctx.fillStyle = k === on ? col : '#3a3b40'; ctx.fillRect(hx + q * 0.4, hy + q * (0.35 + k * 1.35), q, q); }
    if (night > 0.3) {
      const lx = hx + q * 0.9, ly = hy + q * (0.85 + on * 1.35), g = ctx.createRadialGradient(lx, ly, 0, lx, ly, q * 3.5);
      g.addColorStop(0, `rgba(${rgb},${0.55 * Math.min(1, (night - 0.3) / 0.4)})`); g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g; ctx.fillRect(lx - q * 3.5, ly - q * 3.5, q * 7, q * 7);
    }
  }
  const ek = (p) => Math.round(p[0]) + ',' + Math.round(p[1]);
  const TRUCKC = ['#c42a20|#ecebe6|box', '#eceeed|#d6a13a|tarp', '#eceeed|#3f5f8a|tarp', '#2f4f86|#e4e4de|box', '#eceeed|#9aa0a7|box'];
  const CARC = ['#ecebe6', '#b3b8bf', '#2a2c31', '#b8291f', '#33529e', '#62666d', '#3d6b4c', '#cdbd99'];
  const VANC = ['#ecebe6', '#ecebe6', '#ecebe6', '#ecebe6', '#b3b8bf', '#2f3f6e', '#c23b2a', '#e8c547'];   // dodávky: hlavně bílé
  const CABC = ['#ecebe6', '#ecebe6', '#c23b2a', '#2f5fa8', '#e3a52b', '#3c6e47', '#1d1f24', '#b3b8bf'];   // kabiny tahačů
  const BOXC = ['#e9e8e2', '#e9e8e2', '#e9e8e2', '#c9ccd0', '#2f4f8a', '#a33a2c', '#4f6b4a', '#d9d2bf'];   // návěsy
  // druhy vozidel: len/wid rozměr v m, code obrázek ve vehicleSprite (3 nákladní auto, 5 dodávka, 7 tahač, 9 popelářské auto, 10 traktor),
  // vmax km/h, gap místo ve frontě před přejezdem (m). Kamion = tahač + návěs (TRAILER m) za ním po silnici.
  const VTYP = {
    car: { len: 4.2, wid: 1.76, code: false, gap: 8 }, van: { len: 5.4, wid: 2.0, code: 5, vmax: 110, gap: 9 },
    truck: { len: 9, wid: 2.45, code: 3, vmax: 80, gap: 13 }, semi: { len: 6.1, wid: 2.5, code: 7, vmax: 80, gap: 25 },
    garbage: { len: 9.2, wid: 2.5, code: 9, vmax: 35, gap: 13 }, tractor: { len: 4.3, wid: 2.3, code: 10, vmax: 30, gap: 8 },
  };
  const TRAILER = 13.6, TAH = 3.05 - 1.0 + 6.8;                 // střed návěsu za středem tahače (točnice 1 m před zadkem tahače)
  const MINOR = new Set(['residential', 'living_street', 'unclassified', 'tertiary']);   // popeláři a traktory jezdí po vedlejších silnicích
  // silnice čtverce: napojit na graf (konce se potkají i přes šev) a přidat auta
  onChunk.push((k, d) => {
    const i0 = roads.length;
    for (const r of d.roads) {
      const len = [0]; for (let i = 1; i < r.w.length; i++) len.push(len[i - 1] + Math.hypot(r.w[i][0] - r.w[i - 1][0], r.w[i][1] - r.w[i - 1][1]));
      if (len[len.length - 1] > 1) { roads.push({ ...r, k, len, L: len[len.length - 1] }); const rr = roads[roads.length - 1]; for (const z of r.j || []) addXing(rr, z); rr.jy = [...(r.j || []), ...(r.y || []).map((y) => yieldZ(rr, y))]; if (r.rb) rr.rbk = r.rb[0].toFixed(0) + ',' + r.rb[1].toFixed(0); addSignals(rr); }   // i krátké kousky (kruhový objezd u vjezdů), jinak v okruhu zůstanou mezery a auta tam stojí
    }
    for (let i = i0; i < roads.length; i++) { const r = roads[i]; for (const [end, dir] of [[r.w[0], 1], [r.w[r.w.length - 1], -1]]) { const q = ek(end); if (!ends.has(q)) ends.set(q, []); ends.get(q).push([i, dir]); } }
    // konce, které se v datech minou o pár metrů (rozdělená vozovka, mostovka), propojit, ať auto nemusí otáčet ani mizet
    for (let i = i0; i < roads.length; i++) for (const end of [roads[i].w[0], roads[i].w[roads[i].w.length - 1]]) {
      const q = ek(end); if (ends.get(q).length > 1) continue;
      let best = null, bd = 36; const X = Math.round(end[0]), Y = Math.round(end[1]);
      for (let dx = -6; dx <= 6; dx++) for (let dy = -6; dy <= 6; dy++) {
        const d = dx * dx + dy * dy, l2 = (dx || dy) && d < bd && ends.get((X + dx) + ',' + (Y + dy));
        if (l2) { bd = d; best = l2; }
      }
      if (best) { const mine = ends.get(q).slice(); ends.get(q).push(...best.filter((e) => e[0] !== i)); best.push(...mine); }
    }
    const main = []; for (let i = i0; i < roads.length; i++) if (roads[i].c !== 'service') main.push(i);
    // s daty sčítání (r.v = vozidla za 24 h) je na silnici tolik aut, kolik odpovídá intenzitě a délce:
    // ve špičce projede za hodinu asi 10 % denní intenzity, při 45 km/h je to v / 450 aut na kilometr (odhad)
    const weights = main.map((i) => (roads[i].v || 0) * roads[i].L), wsum = weights.reduce((a, b) => a + b, 0);
    const n0 = cars.length, n = wsum ? Math.min(300, Math.round(wsum / 450 / 1000 * CAR_DENS)) : Math.min(110, Math.round(main.length / 6));
    const pickMain = (u) => { if (!wsum) return main[Math.floor(u * main.length)]; let x = u * wsum; for (let k = 0; k < main.length; k++) { x -= weights[k]; if (x <= 0) return main[k]; } return main[main.length - 1]; };
    for (let j = 0; j < n && main.length; j++) {
      const i = n0 + j, r_ = pickMain(rnd(i)), c = { r: r_, dir: roads[r_].o || (rnd(i + 9) > 0.5 ? 1 : -1), s: rnd(i + 3) * roads[r_].L,   // po celé délce, jinak se na dlouhé silnici auta nalepí do hloučku
        f: 0.85 + rnd(i + 5) * 0.25, q: rnd(i + 7), col: CARC[i % CARC.length], truck: rnd(i + 11) * 100 < (roads[r_].t || 0) };
      if (c.truck) c.col = TRUCKC[i % TRUCKC.length];
      const u_ = rnd(i + 13), rc = roads[r_].c;
      c.t = c.truck ? (u_ < 0.55 && !MINOR.has(rc) ? 'semi' : 'truck') : u_ < 0.1 ? 'van' : u_ < 0.11 ? 'garbage' : u_ < 0.116 ? 'tractor' : 'car';
      if (c.t === 'van') c.col = VANC[i % VANC.length];
      else if (c.t === 'semi') { c.col = CABC[i % CABC.length]; c.col2 = BOXC[(i >> 3) % BOXC.length]; }
      else if (c.t === 'garbage') c.col = '#ecebe6|#e8742a';
      else if (c.t === 'tractor') c.col = rnd(i + 17) < 0.7 ? '#3f7a2e' : '#b52a1e';
      c.T = VTYP[c.t]; c.pr = -1;
      if (c.dir < 0) c.s = roads[c.r].L - c.s;
      cars.push(c);
    }
  });
  function along(r, s) {
    const L = r.len; let i = 1; while (i < L.length - 1 && L[i] < s) i++;
    const t = Math.max(0, Math.min(1, (s - L[i - 1]) / ((L[i] - L[i - 1]) || 1)));
    const a = r.w[i - 1], b = r.w[i], pa = r.p[i - 1], pb = r.p[i];
    return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, ix: pa[0] + (pb[0] - pa[0]) * t, iy: pa[1] + (pb[1] - pa[1]) * t, d: pa[2] + (pb[2] - pa[2]) * t, dx: b[0] - a[0], dy: b[1] - a[1], z: a.length > 2 ? a[2] + (b[2] - a[2]) * t : undefined };
  }
  function pickExit(all, c) {
    const big = c.truck ? all.filter(([i]) => roads[i].t) : c.t === 'garbage' || c.t === 'tractor' ? all.filter(([i]) => MINOR.has(roads[i].c)) : all, opts = big.length ? big : all;   // nákladní auta drží sčítané silnice, popeláři a traktory vedlejší
    const sum = opts.reduce((a, [i]) => a + (roads[i].v || 0), 0);
    if (!sum) return opts[Math.floor(Math.random() * opts.length)];
    let x = Math.random() * sum;
    for (const o of opts) { x -= roads[o[0]].v || 0; if (x <= 0) return o; }
    return opts[opts.length - 1];
  }
  // podíl aut podle denní doby: odhad tvaru dne, ne měření ze sčítání (špička 6 a 15 h, v noci málo)
  const DAY_SHARE = [.08, .05, .04, .04, .08, .4, 1, .9, .75, .65, .6, .65, .7, .75, .85, 1, .9, .7, .55, .4, .3, .22, .16, .12];
  const trafficShare = () => {
    if (!roads.some((r) => r.v)) return 1;
    if ($('realTime').checked) return DAY_SHARE[+new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Prague', hour: 'numeric', hourCycle: 'h23' }).format(new Date())];
    return 1 - 0.85 * state.night;
  };
  // pevná hustota na silnici (ne strop na celou mapu: ten se dělil podle počtu načtených čtverců a auta chodila ve vlnách);
  // strop aut na celou mapu; rozděluje se rovnoměrně přes c.q, takže platí pro všechny čtverce stejně
  const CAR_DENS = 0.4, SLOW_SHARE = 0.35;   // CAR_DENS: zlomek špičkové hustoty (plná působila jako zácpa); slabší zařízení kreslí jen část aut
  const MAX_CARS = 1000, MAX_CARS_SLOW = 300;
  // Zvolená auta jsou stabilní podle q. Při dosažení stropu vybereme přesný počet,
  // místo náhodného prahu, který může limit překročit.
  function limitCars(all, share, slow) {
    const threshold = share * (slow ? SLOW_SHARE : 1), cap = Math.floor(share * (slow ? MAX_CARS_SLOW : MAX_CARS));
    const eligible = all.filter((c) => c.q <= threshold);
    const allowed = eligible.length > cap ? new Set(eligible.sort((a, b) => a.q - b.q).slice(0, cap)) : null;
    return { threshold, allowed };
  }
  let tShare = 1, tShareT = 0, tShareCount = -1, tShareSlow = null, tAllowed = null;
  const carActive = (c) => c.q <= tShare && (!tAllowed || tAllowed.has(c)) && (c.t !== 'garbage' || state.night < 0.5);   // popeláři jen ve dne
  // rychlost podle limitu z dat, jinak odhad podle třídy silnice; c.f je povaha řidiče
  const CLASS_KMH = { motorway: 110, trunk: 90, primary: 50, secondary: 50, tertiary: 50, unclassified: 40, residential: 30, living_street: 20 };
  const roadSpeed = (r) => (r.x ? Math.min(r.l || 50, 50) : r.l || CLASS_KMH[r.c] || 40) / 3.6;   // r.x = nájezdová rampa
  const carSpeed = (c, r) => Math.min(c.truck ? Math.min(roadSpeed(r), 22) * 0.85 : roadSpeed(r), (c.T.vmax || 999) / 3.6) * c.f;   // nákladní auta o něco pomaleji, popeláři a traktory pomalu
  const curbPt = (o, side, off) => {                       // bod u pravého okraje vozovky pro auta jedoucí po kusu (side 1) nebo proti (-1)
    const L = Math.hypot(o.dx, o.dy) || 1, x = o.x + o.dy / L * side * off, y = o.y - o.dx / L * side * off, h = o.z ?? gz(x, y), [ix, iy] = toImg(x, y, h);
    return { x, y, ix, iy, d: depth(x, y, h) };
  };
  function drawXPost(o, z, sx, ox, oy, now, night) {      // výstražník s křížem; v noci světlo září
    const x = ox + o.ix * sx, y = oy + o.iy * sx, h = 30 * sx, q = Math.max(2.5, 3.4 * sx), ph = Math.floor(now / 500) % 2;
    ctx.fillStyle = '#26262a'; ctx.fillRect(x - q * 0.35, y - h - q * 2.6, q * 0.7, h + q * 2.6);
    ctx.strokeStyle = '#d23a2e'; ctx.lineWidth = q * 0.9; ctx.beginPath();
    ctx.moveTo(x - q * 1.8, y - h - q * 3.6); ctx.lineTo(x + q * 1.8, y - h - q * 1.2); ctx.moveTo(x + q * 1.8, y - h - q * 3.6); ctx.lineTo(x - q * 1.8, y - h - q * 1.2); ctx.stroke();
    ctx.strokeStyle = '#f4f4f0'; ctx.lineWidth = q * 0.45; ctx.stroke();
    ctx.fillStyle = '#26262a'; ctx.fillRect(x - q * 2, y - h - q * 0.2, q * 4, q * 1.6);
    const lamp = z.g.closed ? [x + (ph ? 1.05 : -1.05) * q, '#ff4438', '255,68,56'] : Math.floor(now / 900) % 2 ? [x, '#f4f4f0', '244,244,240'] : null;
    if (!lamp) return;
    if (night > 0.3) {
      const g = ctx.createRadialGradient(lamp[0], y - h + q * 0.6, 0, lamp[0], y - h + q * 0.6, q * 3.5);
      g.addColorStop(0, `rgba(${lamp[2]},${0.55 * Math.min(1, (night - 0.3) / 0.4)})`); g.addColorStop(1, `rgba(${lamp[2]},0)`);
      ctx.fillStyle = g; ctx.fillRect(lamp[0] - q * 3.5, y - h + q * 0.6 - q * 3.5, q * 7, q * 7);
    }
    ctx.fillStyle = lamp[1]; ctx.fillRect(lamp[0] - q * 0.6, y - h + q * 0.05, q * 1.2, q * 1.1);
  }
  // fronta před semaforem nebo přejezdem sahá za začátek dalšího kusu silnice: auto zastaví ve frontě ještě na svém kusu
  // (jinak by všechna stála na sobě na začátku dalšího kusu) a po rozjezdu pokračuje na kus, který si vybralo (c.nx)
  function queueBack(c, r, i, dir) {
    const q = roads[i], s0 = dir > 0 ? 0 : q.L, qi = dir > 0 ? 0 : 1;
    for (const zs of [q.jy, q.sg]) if (zs) for (const z of zs) {
      if (!blocked(z) || (z.t && z.t !== dir)) continue;
      const over = dir * (s0 - (z[0] - dir * ((z.d ?? 6) + ((z.q && z.q[qi]) || 0))));
      if (over <= 0) continue;
      c.s = Math.max(0, Math.min(r.L, (c.dir > 0 ? r.L : 0) - c.dir * over)); c.hold = z; (z.q = z.q || [0, 0])[qi] += c.T.gap; c.nx = [i, dir];
      return true;
    }
    return false;
  }
  function stepCar(c, dt) {
    if (c.hold) { if (blocked(c.hold)) return; c.hold.q = null; c.hold = null; }
    const r = roads[c.r], next = c.s + carSpeed(c, r) * dt * c.dir;
    for (const zs of [r.jy, r.sg]) if (zs) for (const z of zs) {   // zavřený přejezd, plný kruhový objezd (6 m před) nebo červená/žlutá na semaforu (z.d m před bodem); fronta po c.T.gap m
      if (!blocked(z) || (z.t && z.t !== c.dir)) continue;  // semafor platí jen pro směr ke křižovatce
      const D = z.d ?? 6, qi = c.dir > 0 ? 0 : 1, stop = z[0] - c.dir * (D + ((z.q && z.q[qi]) || 0));   // z.q = délka fronty v m
      if (c.dir * (stop - c.s) >= 0 && c.dir * (next - stop) > 0) { c.s = stop; c.hold = z; (z.q = z.q || [0, 0])[qi] += c.T.gap; return; }
      if (c.dir * (stop - c.s) < 0 && c.dir * (z[0] - c.dir * D - c.s) >= 0) { c.hold = z; (z.q = z.q || [0, 0])[qi] += c.T.gap; return; }   // fronta mezitím narostla za auto: zastavit na místě
    }
    c.s = next;
    if (c.s < 0 || c.s > r.L) {
      const endPt = c.s < 0 ? r.w[0] : r.w[r.w.length - 1];
      const pr0 = c.pr, pd0 = c.pdir;
      c.pr = c.r; c.pdir = c.dir;                           // návěs kamionu ještě chvíli jede po předchozí silnici
      const opts = (ends.get(ek(endPt)) || []).filter(([i, dir]) => i !== c.r && roads[i].c !== 'service' && (!roads[i].o || roads[i].o === dir));
      if (opts.length) {
        const nx = c.nx && opts.find(([i, dir]) => i === c.nx[0] && dir === c.nx[1]); c.nx = null;
        const [i, dir] = nx || pickExit(opts, c);
        if (queueBack(c, r, i, dir)) { c.pr = pr0; c.pdir = pd0; return; }
        c.r = i; c.dir = dir; c.s = dir > 0 ? 0 : roads[i].L;
      }
      else if (r.o && (ends.get(ek(endPt)) || []).some(([i]) => i !== c.r && roads[i].c !== 'service')) {   // data mají navazující kus opačně: radši pokračovat než zmizet
        const [i, dir] = pickExit((ends.get(ek(endPt)) || []).filter(([i]) => i !== c.r && roads[i].c !== 'service'), c); c.r = i; c.dir = dir; c.s = dir > 0 ? 0 : roads[i].L;
      }
      else if (r.o) {                  // konec jednosměrky: otočit se nesmí, auto se objeví jinde
        let i = c.r; for (let k = 0; k < 20; k++) { i = Math.floor(Math.random() * roads.length); if (roads[i].c !== 'service') break; }
        c.r = i; c.dir = roads[i].o || 1; c.s = c.dir > 0 ? 0 : roads[i].L; c.pr = -1;
      }
      else { c.dir *= -1; c.s = Math.max(0, Math.min(r.L, c.s)); c.pr = -1; }
    }
  }
  function trailerPos(c) {                                  // návěs kamionu TAH m za tahačem, po předchozí silnici, když tahač právě odbočil
    const r = roads[c.r], done = c.dir > 0 ? c.s : r.L - c.s;
    if (done >= TAH || c.pr < 0) { const o = along(r, Math.max(0, Math.min(r.L, c.s - TAH * c.dir))); o.dirSign = c.dir; o.lane = r.o ? 0 : 1.6; return o; }
    const q = roads[c.pr], rem = Math.min(q.L, TAH - done);
    const o = along(q, c.pdir > 0 ? q.L - rem : rem); o.dirSign = c.pdir; o.lane = q.o ? 0 : 1.6; return o;
  }
  const bus = (() => {
    if (!OV.bus) return null;
    const w = OV.bus.w; if (w.length < 2) return null;
    const len = [0]; for (let i = 1; i < w.length; i++) len.push(len[i - 1] + Math.hypot(w[i][0] - w[i - 1][0], w[i][1] - w[i - 1][1]));
    const r = { w, p: OV.bus.p, len, L: len[len.length - 1] };
    const stopS = OV.bus.stops.map(([sx, sy]) => { let best = 0, bd = 1e18; r.p.forEach((p, i) => { const d = (p[0] - sx) ** 2 + (p[1] - sy) ** 2; if (d < bd) { bd = d; best = i; } }); return len[best]; });
    return { r, s: 0, dir: 1, v: 9, wait: 3, stopS };
  })();
  // tramvaje: linky z overlay.json, na každé několik souprav (dva články), jezdí tam a zpět a stojí v zastávkách
  const trams = (OV.trams || []).flatMap((t) => {
    const w = t.w, len = [0]; for (let i = 1; i < w.length; i++) len.push(len[i - 1] + Math.hypot(w[i][0] - w[i - 1][0], w[i][1] - w[i - 1][1]));
    const r = { w, p: t.p, len, L: len[len.length - 1] };
    const stopS = t.stops.map(([sx, sy]) => { let best = 0, bd = 1e18; r.p.forEach((p, i) => { const d = (p[0] - sx) ** 2 + (p[1] - sy) ** 2; if (d < bd) { bd = d; best = i; } }); return len[best]; });
    return Array.from({ length: t.n }, (_, j) => ({ r, s: r.L * (j + 0.5) / t.n, dir: j % 2 ? -1 : 1, v: 8, wait: 0, stopS }));
  });
  // MHD podle jízdních řádů GTFS (site/mhd.json z mhd.py): poloha každého spoje podle skutečného času
  const MHD = { on: false, act: [], t: -1, drawn: [], follow: null };
  // bez GTFS v mesto.json se mhd.json nevyrábí: nežádat o něj (jinak chyba 404 v konzoli)
  if ({{MHD}}) fetch('mhd.json' + VER).then((r) => r.json()).then((m) => {
    m.shapes = m.shapes.map((w) => { const len = [0]; for (let i = 1; i < w.length; i++) len.push(len[i - 1] + Math.hypot(w[i][0] - w[i - 1][0], w[i][1] - w[i - 1][1])); return { w, len, L: len[len.length - 1] }; });
    m.dur = m.trips.map((t) => t[4][t[4].length - 2]);
    m.maxDur = m.dur.reduce((x, d) => Math.max(x, d), 0);   // ne Math.max(...): u velkého GTFS přeteče zásobník
    m.maxWait = m.trips.reduce((x, t) => Math.max(x, t[7] || 0), 0);   // čekání na konečné před odjezdem (mhd.py)
    Object.assign(MHD, m, { on: true });
    stopsReady();
  }).catch(() => {});
  const pragueNow = () => {                                // datum, den v týdnu (po = 0) a sekundy od půlnoci (čas v Česku)
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short', hour12: false })
      .formatToParts(new Date()).map((q) => [q.type, q.value]));
    return { d: +(p.year + p.month + p.day), wd: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday), s: (+p.hour % 24) * 3600 + +p.minute * 60 + +p.second + (Date.now() % 1000) / 1000 };
  };
  const ymd = (d, k) => { const t = new Date(Date.UTC(Math.floor(d / 1e4), Math.floor(d / 100) % 100 - 1, d % 100 + k)); return t.getUTCFullYear() * 1e4 + (t.getUTCMonth() + 1) * 100 + t.getUTCDate(); };   // pražské datum RRRRMMDD posunuté o k dní
  function mhdServices(d, wd, strict) {                    // služby jízdního řádu platné v daný den
    const on = new Set();
    for (const [id, [days, from, to, add, rem]] of Object.entries(MHD.services)) {
      if (rem.includes(d)) continue;
      if (add.includes(d) || (days[wd] && (!strict || (d >= from && d <= to)))) on.add(id);
    }
    return on;
  }
  function mhdActive() {                                   // jedoucí spoje (dnešní i ty, co vyjely včera před půlnocí)
    const n = pragueNow();
    let today = mhdServices(n.d, n.wd, true);
    if (!MHD.trips.some((t) => today.has(t[2]))) today = mhdServices(n.d, n.wd, false);   // prošlý jízdní řád: aspoň podle dne v týdnu
    const yest = mhdServices(ymd(n.d, -1), (n.wd + 6) % 7, false), out = [];
    for (const [svc, t] of [[today, n.s], [yest, n.s + 86400]]) {
      const T = MHD.trips; let lo = 0, hi = T.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (T[m][3] < t - MHD.maxDur) lo = m + 1; else hi = m; }
      for (let i = lo; i < T.length && T[i][3] <= t + (MHD.maxWait || 0); i++) {
        if (!svc.has(T[i][2])) continue;
        const el = t - T[i][3];
        if (el <= MHD.dur[i] && el >= -(T[i][7] || 0)) out.push(el >= 0 ? [i, el] : [i, 0, -el]);   // [i, s od odjezdu, s do odjezdu když stojí na konečné]
      }
    }
    const fronta = {};                                     // víc vozů na téže konečné: kdo odjíždí později, stojí za ním (a[3] = pořadí)
    // autobus na konečné jen poslední 3 minuty před odjezdem a nejvýš jeden na stanovišti (jinak na velké konečné vzniklo „hnízdo
    // autobusů“); ostatní čekají mimo mapu (odstavná plocha, pauza řidiče). Tramvaje beze změny, mají vlastní odstavné koleje.
    const BUS_CEKA = 180, stan = new Set();
    for (let k = out.length - 1; k >= 0; k--) { const a = out[k]; if (a[2] && MHD.routes[MHD.trips[a[0]][0]][1] === 3 && a[2] > BUS_CEKA) out.splice(k, 1); }
    for (const a of out.filter((q) => q[2] && MHD.routes[MHD.trips[q[0]][0]][1] === 3).sort((p, q) => p[2] - q[2])) {
      const w0 = MHD.shapes[MHD.trips[a[0]][1]].w[0], k = `${Math.round(w0[0] / 4)}_${Math.round(w0[1] / 4)}`;
      if (stan.has(k)) out.splice(out.indexOf(a), 1); else stan.add(k);
    }
    for (const a of out.filter((q) => q[2]).sort((p, q) => p[2] - q[2])) {
      const t = MHD.trips[a[0]], w0 = MHD.shapes[t[1]].w[0], k = `${MHD.routes[t[0]][1]}_${Math.round(w0[0] / 4)}_${Math.round(w0[1] / 4)}`;   // fronta po stanovištích (začátek trasy), ne po názvu zastávky
      a[3] = fronta[k] = (fronta[k] ?? -1) + 1;
    }
    return out;
  }
  function mhdFollow(i) {                                  // kliknutí na vozidlo: pohled jede za ním, lišta ukazuje linku, cíl a další zastávku
    MHD.follow = i; $('follow').hidden = false; mhdFollowText(); closeCard();
  }
  function mhdFollowText() {
    const i = MHD.follow, a = MHD.act.find((q) => q[0] === i);
    if (!a) { $('followTxt').textContent = 'Spoj dojel do cílové zastávky.'; MHD.follow = null; setTimeout(() => { if (MHD.follow === null) $('follow').hidden = true; }, 4000); return; }
    const t = MHD.trips[i], [line, typ] = MHD.routes[t[0]], z = t[6]; let next = '';
    for (let k = 0; k < z.length; k += 2) if (z[k + 1] >= a[1]) { next = MHD.names[z[k]]; break; }
    const b = document.createElement('b'); b.textContent = `${typ === 0 ? 'Tramvaj' : typ === 2 ? 'Vlak' : 'Autobus'} ${line}`;
    const odj = a[2] ? ` · stojí na konečné, odjezd za ${Math.max(1, Math.round(a[2] / 60))}\u00a0min` : next ? ` · další zastávka ${next}` : '';
    $('followTxt').replaceChildren(b, ` → ${MHD.names[t[5]]}`, odj);
  }
  $('followStop').addEventListener('click', () => { MHD.follow = null; if (typeof PLANES !== 'undefined') PLANES.follow = null; $('follow').hidden = true; });
  viewer.addHandler('canvas-drag', () => {
    if (MHD.follow !== null) { MHD.follow = null; $('follow').hidden = true; }
    if (typeof PLANES !== 'undefined' && PLANES.follow !== null) { PLANES.follow = null; $('follow').hidden = true; }
  });
  function odstavPos(trip, ceka, poradi) {                 // tramvaj na konečné, kde kolej za zastávkou slepě končí: z nástupiště dozadu na konec koleje, před odjezdem zpátky
    const pole = MHD.odstav && MHD.odstav[trip[1]];
    if (!pole) return null;
    const od = pole[(poradi || 0) % pole.length];
    if (!od.len) { od.len = [0]; for (let i = 1; i < od.length; i++) od.len.push(od.len[i - 1] + Math.hypot(od[i][0] - od[i - 1][0], od[i][1] - od[i - 1][1])); od.L = od.len[od.len.length - 1]; }
    const f = Math.min(1, Math.min((trip[7] || 0) - ceka, ceka) / 30), s = Math.max(0, od.L * f - 8 - ((poradi || 0) >= pole.length ? 34 : 0));
    const bod = (s_) => { let k = 1; while (k < od.len.length - 1 && od.len[k] < s_) k++; const a = od[k - 1], b = od[k], u = Math.max(0, Math.min(1, (s_ - od.len[k - 1]) / ((od.len[k] - od.len[k - 1]) || 1))); return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]; };
    const [x, y] = bod(s), [x2, y2] = bod(Math.min(od.L, s + 6)), h = gz(x, y), [ix, iy] = toImg(x, y, h);   // směr z delšího úseku, koleje jsou po krátkých kouscích
    return { x, y, z: h, ix, iy, dx: x2 - x, dy: y2 - y, dirSign: 1 };
  }
  // zastávky (mhd.json "stops": [jméno, x, y, druh]): kliknutí ukáže nejbližší odjezdy podle jízdního řádu, hledání je najde
  function stopsReady() {
    if (!MHD.stops) return;
    MHD.stopPts = MHD.stops.map(([n, x, y, kd]) => { const [ix, iy] = toImg(x, y, gz(x, y)); return { n, x, y, kd, ix, iy }; });
    const seen = new Set();
    for (const s of MHD.stopPts) {
      if (seen.has(s.n)) continue; seen.add(s.n);
      const nm = MHD.names[s.n];
      index.push({ label: nm, kind: 'zastávka', k: `c${Math.round(s.x / (2 * cam.half))}_${Math.round(s.y / (2 * cam.half))}`, n: norm(nm), go: () => { goTo(s.ix, s.iy, 2); showStop(s); } });
    }
  }
  function stopDepartures(nid) {                             // [s do odjezdu, spoj] na hodinu dopředu (bez cílové zastávky spoje), i noční spoje po půlnoci
    const p = pragueNow();
    let today = mhdServices(p.d, p.wd, true);
    if (!MHD.trips.some((t) => today.has(t[2]))) today = mhdServices(p.d, p.wd, false);
    const yest = mhdServices(ymd(p.d, -1), (p.wd + 6) % 7, false), tom = mhdServices(ymd(p.d, 1), (p.wd + 1) % 7, false), out = [];
    for (const [svc, base] of [[today, 0], [yest, -86400], [tom, 86400]]) for (const t of MHD.trips) {
      if (!svc.has(t[2]) || MHD.routes[t[0]][1] === 2) continue;
      const z = t[6];
      for (let k = 0; k < z.length - 2; k += 2) if (z[k] === nid) { const dt = base + t[3] + z[k + 1] - p.s; if (dt >= -20 && dt <= 3600) out.push([dt, t]); }
    }
    return out.sort((a, b) => a[0] - b[0]);
  }
  function showStop(s) {
    const hm = (dt) => { const p = pragueNow(), v = Math.round((p.s + dt) / 60) % 1440; return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`; };
    const za = (dt) => (dt < 60 ? 'teď' : `za ${Math.round(dt / 60)}\u00a0min`);
    const groups = new Map();
    for (const [dt, t] of stopDepartures(s.n)) {
      const [line, typ] = MHD.routes[t[0]], key = `${typ === 0 ? 'Tramvaj' : 'Autobus'} ${line} → ${MHD.names[t[5]]}`;
      if (!groups.has(key)) groups.set(key, []);
      if (groups.get(key).length < 3) groups.get(key).push(dt);
    }
    const rows = [...groups.entries()].sort((a, b) => a[1][0] - b[1][0]).slice(0, 10).map(([k, v]) => [k, `${hm(v[0])} (${za(v[0])})` + v.slice(1).map((d) => ', ' + hm(d)).join('')]);
    showCard({ title: `Zastávka ${MHD.names[s.n]}`, text: rows.length ? 'Odjezdy podle jízdního řádu, bez zpoždění.' : 'V příští hodině odtud podle jízdního řádu nic nejede.',
      rows, lon: s.x / cam.kx + cam.lon0, lat: s.y / cam.ky + cam.lat0 });
  }
  const stopAt = (ix, iy) => {                              // zastávka pod kliknutím (do ~20 px na obrazovce, nejméně 6 m)
    if (!MHD.stopPts) return null;
    const scr = viewer.viewport.getContainerSize().x / (viewer.viewport.getBounds(true).width * W);
    if (scr < 0.12) return null;
    const r = Math.max(20 / scr, 30); let best = null, bd = r;
    for (const s of MHD.stopPts) { const d = Math.hypot(s.ix - ix, s.iy - iy); if (d < bd) { bd = d; best = s; } }
    return best;
  };
  function mhdPos(trip, el, T = 0, off = 0) {                              // kde na trase je spoj el sekund po výjezdu
    const q = trip[4]; let i = 2; while (i < q.length - 2 && q[i] < el) i += 2;
    const f = Math.max(0, Math.min(1, (el - q[i - 2]) / ((q[i] - q[i - 2]) || 1)));
    const sh = MHD.shapes[trip[1]], s0 = Math.min(sh.L, q[i - 1] + (q[i + 1] - q[i - 1]) * f), s = Math.max(0, Math.min(sh.L, Math.max(T / 2, Math.min(sh.L - T / 2, s0)) + off));   // T: délka vlaku, off: článek od středu
    return shapePos(sh, s);
  }
  // poloha a směr vozu v metru s trasy. Směr z bodů před a za vozidlem: trasy z GTFS mívají u zastávek krátké zalomené úseky
  // a „ostruhy“ k označníku (pár metrů tam a zpět). Na ostruze leží oba body ±4 m na ní a vůz by se stočil napříč, proto když body
  // nejsou aspoň na 80 % délky úseku od sebe (ostrý obrat), okno se zvětší na ±13 m a ±22 m – za kořen ostruhy. Na začátku a konci
  // trasy se počítá jen skutečná délka úseku (jinak by na konečné stál vůz šejdrem). Na rovné trase zůstane ±4 m.
  function shapePos(sh, s) {
    const L = sh.len;
    const at = (s) => {
      let k = 1; while (k < L.length - 1 && L[k] < s) k++;
      const a = sh.w[k - 1], b = sh.w[k], u = Math.max(0, Math.min(1, (s - L[k - 1]) / ((L[k] - L[k - 1]) || 1)));
      return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
    };
    const [x, y] = at(s);
    let p0, p1, dx, dy;
    for (const w of [4, 13, 22]) {
      const sa = Math.max(0, s - w), sb = Math.min(sh.L, s + w);
      p0 = at(sa); p1 = at(sb); dx = p1[0] - p0[0]; dy = p1[1] - p0[1];
      if (dx * dx + dy * dy > (0.8 * (sb - sa)) ** 2) break;
    }
    const h = deckZ(x, y, dx, dy) ?? gz(x, y), [ix, iy] = toImg(x, y, h);
    return { x, y, z: h, ix, iy, dx, dy, dirSign: 1 };   // z: autobus, tramvaj a vlak na mostě ve výšce mostovky
  }
  // fronta na konečné: trasa, po které vozy linky na konečnou přijíždějí (spoj stejné linky, který končí v první zastávce tohoto spoje)
  const PRIJEZD = new Map();
  function prijezdSh(trip) {
    const z0 = trip[6][0], key = trip[0] + '|' + z0;
    if (PRIJEZD.has(key)) return PRIJEZD.get(key);
    let sh = null;
    for (const t of MHD.trips) { const z = t[6]; if (z[z.length - 2] === z0 && t[0] === trip[0]) { sh = MHD.shapes[t[1]]; break; } }
    if (!sh) for (const t of MHD.trips) { const z = t[6]; if (z[z.length - 2] === z0) { sh = MHD.shapes[t[1]]; break; } }
    PRIJEZD.set(key, sh); return sh;
  }

  function stepShuttle(b, dt, stopWait, endWait) {
    if (b.wait > 0) { b.wait -= dt; return; }
    const prev = b.s; b.s += b.v * dt * b.dir;
    for (const s of b.stopS) if ((prev - s) * (b.s - s) <= 0 && Math.abs(prev - s) > 0.01) { b.s = s; b.wait = stopWait; }
    if (b.s >= b.r.L || b.s <= 0) { b.dir *= -1; b.s = Math.max(0, Math.min(b.r.L, b.s)); b.wait = endWait; }
  }
  // lyžaři: v zimě sjíždějí sjezdovky (data shora dolů) obloučky, dole se objeví znovu nahoře
  const skiers = [], SKIC = ['#d8352a', '#2f6fd1', '#f2c230', '#2aa36b', '#e0629a', '#f07a24', '#1d1f24', '#7b4fc9'];
  onChunk.push((k, d) => {
    for (const pl of d.pistes || []) {
      const len = [0]; for (let i = 1; i < pl.length; i++) len.push(len[i - 1] + Math.hypot(pl[i][0] - pl[i - 1][0], pl[i][1] - pl[i - 1][1]));
      const r = { w: pl, len, L: len[len.length - 1], k };
      if (r.L < 40) continue;
      const n = Math.max(1, Math.round(r.L / 80));
      for (let j = 0; j < n; j++) {
        const i = skiers.length + 1;
        skiers.push({ r, s: r.L * j / n + rnd(i) * 30, v: 5 + rnd(i + 1) * 5, amp: 3 + rnd(i + 2) * 9, wl: 22 + rnd(i + 3) * 30, ph: rnd(i + 4) * 6.3,
                      col: SKIC[i % SKIC.length], hat: SKIC[(i * 3 + 1) % SKIC.length] });
      }
    }
  });
  if (location.hostname === 'localhost') window.__izo = { trams, skiers, MHD, mhdActive, mhdPos, cars, roads, state, XC, busWait, sigsOnShape, trainS, SIG, ringFree: (g) => ringFree(g), get planes() { return PLANES; } };       // ladění v lokálním náhledu
  function drawSkier(q, sx, ox, oy) {
    const L = q.r.len; let i = 1; while (i < L.length - 1 && L[i] < q.s) i++;
    const a = q.r.w[i - 1], b = q.r.w[i], t = Math.max(0, Math.min(1, (q.s - L[i - 1]) / ((L[i] - L[i - 1]) || 1)));
    const dx = b[0] - a[0], dy = b[1] - a[1], dl = Math.hypot(dx, dy) || 1, ph = q.s / q.wl * Math.PI * 2 + q.ph, off = Math.sin(ph) * q.amp;
    const x = a[0] + dx * t - dy / dl * off, y = a[1] + dy * t + dx / dl * off, h = gz(x, y);
    const p = toImg(x, y, h);
    if (occluded(p[0], p[1], depth(x, y, h))) return;
    for (const q of treeShapes(x, y, h, [p[0] - 1, p[1] - 9, p[0] + 1, p[1]]))
      if (q[0] === 1 ? ((p[0] - q[1][0]) / q[2]) ** 2 + ((p[1] - 4 - q[1][1]) / q[3]) ** 2 < 1 : p[1] - 4 > q[1][1] && p[1] - 4 < q[2][1] && Math.abs(p[0] - q[1][0]) < q[3] * (p[1] - 4 - q[1][1]) / (q[2][1] - q[1][1])) return;
    const top = toImg(x, y, h + 1.8), u = Math.max(1, Math.round((p[1] - top[1]) * sx / 8));
    const X = Math.round(ox + p[0] * sx), Y = Math.round(oy + p[1] * sx), lean = Math.cos(ph) > 0 ? 1 : -1;
    const R = (cx, cy, w, hh, c) => { ctx.fillStyle = c; ctx.fillRect(X + cx * u, Y - cy * u, w * u, hh * u); };
    R(-3, 1, 6, 1, '#2a2c31');                         // lyže
    R(-1, 3, 2, 2, '#2a2c31');                         // nohy
    R(-1 + (lean > 0 ? 0 : -1), 6, 3, 3, q.col);       // bunda, předklon do oblouku
    R(lean > 0 ? 0 : -1, 7, 2, 1, '#e8c6a4');          // obličej
    R(lean > 0 ? 0 : -1, 8, 2, 1, q.hat);              // čepice
    R(lean > 0 ? 2 : -3, 4, 1, 3, '#9aa0a8');          // hůlka
  }

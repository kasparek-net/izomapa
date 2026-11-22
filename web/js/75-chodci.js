  // ---- chodci: pixeloví lidé (postava 16 bodů po 10 cm) po pěších cestách a náměstích (overlay walk) a po chodnících podél ulic (roads).
  // Oblečení podle ročního období, počet podle hodiny (realTime), kreslí se jen zblízka; obrázek každé postavy se kreslí jednou do cache.
  const PEOPLE = [], PWK = new Map();                         // PWK: konce pěších čar -> [čára, směr]
  const PDENS = { p: 3, f: 0.9, s: 0.5, t: 0.2, k: 0.2, c: 0, d: 0 };   // lidí na 100 m podle druhu cesty (p pěší zóna, f chodník, s schody, t cesta, k cyklostezka, c / d cyklotrasa po silnici / po cestě)
  const BDENS = { k: 0.9, t: 0.06, c: 0.25, d: 0.25 };      // cyklistů na 100 m: cyklostezky, cyklotrasy, v lese a v parku občas
  const BIKE_SEASON = { spring: 0.35, summer: 1, autumn: 0.25, winter: 0.06 };   // na jaře a na podzim jen pár, v létě víc
  const BIKE_COL = ['#c23a2a', '#2a2c31', '#2f6fd1', '#e8e4da', '#2aa36b', '#f2c230', '#7a7f88', '#e86a2a', '#5a3a7a', '#1d6f8a'];
  const PSIDE = { residential: 0.22, living_street: 0.5, tertiary: 0.35, secondary: 0.35, primary: 0.3, unclassified: 0.1 };   // chodníky podél ulic
  const pWalk = (r) => PSIDE[r.c] && !r.tunnel && !r.rb;     // prstenec kruhového objezdu (r.rb) chodník nemá, chodci přejdou po vjezdech
  const PSIDE_OFF = { residential: 3.8, living_street: 2.6, tertiary: 5, secondary: 5.6, primary: 6.2, unclassified: 3.6 };
  const PEOPLE_SHARE = [.06, .04, .03, .03, .04, .12, .35, .7, .75, .7, .75, .85, .9, .85, .85, .95, 1, 1, .85, .65, .45, .3, .18, .1];
  const pinPoly = (P, x, y) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  const pEk = (p) => Math.round(p[0]) + ',' + Math.round(p[1]);
  onChunk.push((k, d) => {
    let i = PEOPLE.length * 7 + k.length * 131 + 17;
    const add = (o) => { const n = ++i; PEOPLE.push({ k, q: rnd(n), oi: Math.floor(rnd(n + 1) * 160), v: 1.05 + rnd(n + 2) * 0.5, ph: rnd(n + 3) * 4, wait: 0,
      kid: rnd(n + 4) < 0.1, pair: rnd(n + 5) < 0.13, dog: rnd(n + 6) < 0.06 ? ['#7a5532', '#e8e0d0', '#2b2b30', '#b08a4e', '#d9bf7a'][n % 5] : null, ...o }); };
    const W = d.walk || {}, lines = W.l || [], kinds = W.c || '';
    lines.forEach((w, j) => {
      const len = [0]; for (let m = 1; m < w.length; m++) len.push(len[m - 1] + Math.hypot(w[m][0] - w[m - 1][0], w[m][1] - w[m - 1][1]));
      const r = { w, len, L: len[len.length - 1], c: kinds[j] || 'f', k };
      for (const [e, dir] of [[w[0], 1], [w[w.length - 1], -1]]) { const q = pEk(e); if (!PWK.has(q)) PWK.set(q, []); PWK.get(q).push([r, dir]); }
      const n = r.L / 100 * (PDENS[r.c] ?? 0.5), cnt = Math.floor(n) + (rnd(i + j) < n % 1 ? 1 : 0);
      for (let m = 0; m < cnt; m++) add({ m: 'l', r, s: rnd(i + m * 3) * r.L, dir: rnd(i + m) < 0.5 ? 1 : -1, side: (rnd(i + m * 5) - 0.5) * 1.4 });
      const nb = r.L / 100 * (BDENS[r.c] || 0), cb = Math.floor(nb) + (rnd(i + j * 13 + 777) < nb % 1 ? 1 : 0);   // cyklisti
      for (let m = 0; m < cb; m++) { const z = i + j * 17 + m * 41 + 999;
        add({ m: 'l', r, s: rnd(z) * r.L, dir: rnd(z + 1) < 0.5 ? 1 : -1, side: (rnd(z + 2) - 0.5) * 0.8, v: 4 + rnd(z + 3) * 2.6, kid: false, pair: false, dog: null,
          bike: { col: BIKE_COL[Math.floor(rnd(z + 4) * BIKE_COL.length)], helm: rnd(z + 5) < 0.55 ? P_ACC[Math.floor(rnd(z + 6) * P_ACC.length)] : null } }); }
    });
    for (const P of W.a || []) {                             // náměstí a pěší plochy: chodí mezi náhodnými body uvnitř
      let A = 0; for (let a = 0, b = P.length - 1; a < P.length; b = a++) A += (P[b][0] + P[a][0]) * (P[b][1] - P[a][1]); A = Math.abs(A / 2);
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of P) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      const ar = { P, x0, y0, x1, y1 }, cnt = Math.min(60, Math.round(A / 450));
      for (let m = 0; m < cnt; m++) for (let t = 0; t < 30; t++) { const x = x0 + rnd(i + m * 31 + t) * (x1 - x0), y = y0 + rnd(i + m * 37 + t + 5) * (y1 - y0); if (pinPoly(P, x, y)) { add({ m: 'a', ar, x, y, tx: x, ty: y }); break; } }
    }
    for (let j = 0; j < roads.length; j++) {                 // chodníky podél ulic tohoto čtverce
      const r = roads[j]; if (r.k !== k || !pWalk(r)) continue;
      const n = r.L / 100 * PSIDE[r.c] * (r.v ? Math.min(2, 0.6 + r.v / 12000) : 1), cnt = Math.floor(n) + (rnd(i + j * 3) < n % 1 ? 1 : 0);
      for (let m = 0; m < cnt; m++) add({ m: 'r', ri: j, s: rnd(i + m * 7 + j) * r.L, dir: rnd(i + m + j) < 0.5 ? 1 : -1, side: rnd(i + m * 11 + j) < 0.5 ? 1 : -1 });
    }
  });
  function pPos(p) {                                         // svět [x, y, z, dx, dy] podle druhu cesty
    if (p.m === 'a') return [p.x, p.y, gz(p.x, p.y), p.vx || 0, p.vy || 1];
    if (p.m === 'r') {
      const r = roads[p.ri], o = along(r, p.s), L = Math.hypot(o.dx, o.dy) || 1, off = (PSIDE_OFF[r.c] || 4) * p.side;
      const x = o.x + o.dy / L * off, y = o.y - o.dx / L * off; return [x, y, o.z ?? gz(x, y), o.dx * p.dir, o.dy * p.dir];
    }
    const r = p.r, Ls = r.len; let i = 1; while (i < Ls.length - 1 && Ls[i] < p.s) i++;
    const a = r.w[i - 1], b = r.w[i], t = Math.max(0, Math.min(1, (p.s - Ls[i - 1]) / ((Ls[i] - Ls[i - 1]) || 1))), dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    const sd = r.c === 'c' ? p.dir * 2.3 : p.side;            // po silnici u pravého okraje
    const x = a[0] + dx * t + dy / L * sd, y = a[1] + dy * t - dx / L * sd; return [x, y, gz(x, y), dx * p.dir, dy * p.dir];
  }
  // lidé na nástupišti: před příjezdem vlaku (3 min) přicházejí a čekají, při stání nastoupí, vystoupivší se po odjezdu rozejdou.
  // Vše podle času jízdy vlaku (el), takže bez stavu a stejné pro všechny návštěvníky. Strana nástupiště podle pěších cest v okolí.
  const PLAT = { on: {{NASTUPISTE}}, dw: new Map(), side: new Map() };   // zapíná "nastupiste": true v mesto.json (hodí se na menší stanice s pár kolejemi)
  function trainDwells(i) {                                  // [[příjezd, odjezd, x, y, tx, ty], …] zastavení vlaku v mapě (s od výjezdu)
    if (PLAT.dw.has(i)) return PLAT.dw.get(i);
    const trip = MHD.trips[i], q = trip[4], out = [];
    const add = (ta, td, el) => {
      const o = mhdPos(trip, el), L = Math.hypot(o.dx, o.dy) || 1;
      if (!cam.grounds.some((g) => Math.abs(o.x - g.cx) <= cam.half && Math.abs(o.y - g.cy) <= cam.half)) return;
      out.push([ta, td, o.x, o.y, o.dx / L, o.dy / L]);
    };
    if (q.length > 3 && q[1] === q[3]) add(-120, q[2], q[2] / 2); else add(-120, 0, 0);                 // výchozí stanice: nástup před odjezdem
    for (let k = 2; k < q.length - 2; k += 2) if (q[k + 1] === q[k + 3] && q[k + 2] > q[k]) add(q[k], q[k + 2], (q[k] + q[k + 2]) / 2);
    const e = q[q.length - 2]; if (q[q.length - 1] !== q[q.length - 3] || q.length < 4) add(e, e + 25, e);   // konečná: jen výstup
    PLAT.dw.set(i, out); return out;
  }
  function platSide(x, y, tx, ty) {                          // 1 / -1: na které straně koleje jsou pěší cesty (nástupiště), 0 = obě
    const key = Math.round(x / 30) + ',' + Math.round(y / 30);
    if (PLAT.side.has(key)) return PLAT.side.get(key);
    let a = 0, b = 0;
    for (const ls of PWK.values()) for (const [r] of ls) for (const w of r.w) {
      const dx = w[0] - x, dy = w[1] - y, al = dx * tx + dy * ty, la = -dx * ty + dy * tx;
      if (Math.abs(al) < 40 && Math.abs(la) > 2.5 && Math.abs(la) < 18) { if (la > 0) a++; else b++; }
    }
    const v = a > b * 2 ? 1 : b > a * 2 ? -1 : 0; if (a + b) PLAT.side.set(key, v); return v;   // bez cest (čtverec se ještě načítá) neukládat
  }
  function platformPeople(share, tNow) {                     // pseudo-postavy [p, P, ip] pro kreslení spolu s chodci
    const res = [];
    if (!PLAT.on || !MHD.on || !MHD.act) return res;
    for (const a of MHD.act) {
      const i = a[0], trip = MHD.trips[i];
      if (MHD.routes[trip[0]][1] !== 2) continue;
      const el = a[2] ? -a[2] : a[1] + tNow;
      trainDwells(i).forEach(([ta, td, x, y, tx, ty], k) => {
        if (el < ta - 190 || el > td + 45) return;
        const side = platSide(x, y, tx, ty);
        const seed = i * 131 + k * 17 + 7, nW = Math.round((6 + rnd(seed) * 14) * Math.max(0.2, share)), nA = Math.round((2 + rnd(seed + 1) * 8) * Math.max(0.2, share));
        const sd = (j) => side || (j % 2 ? 1 : -1), dwell = Math.max(10, td - ta);
        const near = el > ta - 20 && el < td + 8, dc = near ? depth(x, y, gz(x, y)) : 0;   // vlak u nástupiště zakryje lidi za sebou
        const pt = (al, la, j, dx, dy, moving) => {
          const sg = sd(j), px = x + tx * al - ty * la * sg, py = y + ty * al + tx * la * sg, z = gz(px, py);
          if (near && depth(px, py, z) > dc) return;
          res.push([{ oi: (seed * 7 + j * 29) % 160, moving, ph: el * 7.5 + j, pair: false, kid: false, dog: null }, [px, py, z, dx, dy], toImg(px, py, z)]);
        };
        for (let j = 0; j < nW; j++) {                       // čekající: přijdou z boku, stojí čelem ke koleji, při stání nastoupí
          const r1 = rnd(seed + 10 + j), r2 = rnd(seed + 40 + j), al = (r1 - 0.5) * 50, la0 = 3.2 + r2 * 1.6;
          const tin = ta - 180 + rnd(seed + 70 + j) * 165, tout = ta + 3 + rnd(seed + 90 + j) * dwell * 0.7;
          if (el < tin || el > tout) continue;
          const sg = sd(j), nx = -ty * sg, ny = tx * sg;     // normála od koleje k nástupišti
          if (el < tin + 10) { const la = la0 + (tin + 10 - el) * 1.3; pt(al, la, j, -nx, -ny, true); }
          else if (el > tout - 2) pt(al, la0 - (el - tout + 2) * 0.8, j, -nx, -ny, true);
          else pt(al, la0, j, -nx * 0.3 + tx * (r1 < 0.5 ? 1 : -1) * 0.1, -ny * 0.3 + ty * 0.1, false);
        }
        for (let j = 0; j < nA; j++) {                       // vystoupivší: od vlaku pryč z nástupiště
          const jj = j + 50, r1 = rnd(seed + 120 + j), al0 = (r1 - 0.5) * 40, t0 = ta + 4 + rnd(seed + 150 + j) * Math.min(25, dwell * 0.5);
          if (el < t0 || el > Math.max(t0 + 50, td + 40)) continue;   // za vlakem je vidět až po odjezdu, tak se rozcházejí i chvíli po něm
          const sg = sd(jj), nx = -ty * sg, ny = tx * sg, back = r1 < 0.5 ? -1 : 1, v = Math.min(1.25, 50 / Math.max(50, td + 40 - t0));
          const w = (el - t0) * v, la = 2.4 + Math.min(w, 4), al = al0 + Math.max(0, w - 4) * back;
          pt(al, la, jj, w < 4 ? nx : tx * back, w < 4 ? ny : ty * back, true);
        }
      });
    }
    return res;
  }
  function stepPerson(p, dt) {
    if (p.wait > 0) { p.wait -= dt; p.moving = false; return; }
    p.moving = true; p.ph += p.bike ? dt * 5 : dt * 7.5 * p.v;
    if (p.m === 'a') {
      const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
      if (d < 0.5) { if (Math.random() < 0.3) p.wait = 1 + Math.random() * 5; for (let t = 0; t < 12; t++) { const a = p.ar, x = p.x + (Math.random() - 0.5) * 40, y = p.y + (Math.random() - 0.5) * 40; if (pinPoly(a.P, x, y)) { p.tx = x; p.ty = y; break; } } return; }
      const s = Math.min(d, p.v * dt); p.x += dx / d * s; p.y += dy / d * s; p.vx = dx; p.vy = dy; return;
    }
    const r = p.m === 'r' ? roads[p.ri] : p.r;
    p.s += p.v * dt * p.dir;
    if (p.s >= 0 && p.s <= r.L) return;
    const endPt = p.s < 0 ? r.w[0] : r.w[r.w.length - 1];
    if (Math.random() < (p.bike ? 0.02 : 0.15)) p.wait = 1 + Math.random() * 4;   // zastaví se (výloha, telefon)
    let opts;
    if (p.m === 'l') opts = (PWK.get(pEk(endPt)) || []).filter(([q]) => q !== r && (p.bike ? q.c !== 's' : q.c !== 'c' && q.c !== 'd'));
    else opts = (ends.get(ek(endPt)) || []).filter(([j]) => j !== p.ri && pWalk(roads[j]));
    if (p.bike && opts.length) {                                                // cyklista se drží cyklostezky nebo cyklotrasy
      const G = (c) => c === 'k' ? 'k' : c === 'c' || c === 'd' ? 'r' : 'o', g = G(r.c);
      let ok = opts.filter(([q]) => G(q.c) === g); if (!ok.length) ok = opts.filter(([q]) => G(q.c) !== 'o');
      if (ok.length) opts = ok; else if (g === 'r' || (g === 'k' && Math.random() < 0.6)) opts = [];
    }
    if (opts.length && Math.random() < (p.bike ? 0.97 : 0.85)) {
      const [q, dir] = opts[Math.floor(Math.random() * opts.length)];
      if (p.m === 'l') { p.r = q; } else { p.ri = q; } p.dir = dir; p.s = dir > 0 ? 0 : (p.m === 'l' ? q : roads[q]).L;
    } else { p.dir *= -1; p.s = Math.max(0, Math.min(r.L, p.s)); }               // sem tam: otočí se
  }
  // šatník: barvy a střihy podle období (náhodné, ale stálé podle čísla postavy)
  const P_SKIN = ['#f6dcc6', '#efcfb2', '#e9c19f', '#f3d5bd', '#e4b896'], P_HAIR = ['#2b1d14', '#4a3020', '#7a5532', '#b08a4e', '#d9bf7a', '#a8432a', '#9a9a9a', '#e6dfcf'];
  const P_PAL = {
    summer: { top: ['#f4f1ea', '#e94b3c', '#f2c230', '#5aa7e0', '#57b77a', '#f08ab0', '#2f3a4a', '#f39a3d', '#8e6cc9', '#ffffff'], bot: ['#3d5a86', '#2c4468', '#c8b48a', '#5a6b4a', '#2a2a2e', '#e8e2d2'] },
    spring: { top: ['#9fc7e8', '#f3e3b5', '#a8d5a2', '#e8a0a8', '#f4f1ea', '#6f8fb8', '#d9c27a', '#c4573e'], bot: ['#3d5a86', '#2c4468', '#2a2a2e', '#6b5f50', '#c8b48a'] },
    autumn: { top: ['#b5652c', '#7a5a2e', '#6b7a3a', '#8a2f2f', '#2f4a6b', '#c99a3a', '#4a4038', '#9c4a2a', '#d7cdb8'], bot: ['#2c4468', '#2a2a2e', '#4a4640', '#6b5f50', '#3d3530'] },
    winter: { top: ['#1f2a3a', '#2b2b30', '#7a1f2a', '#3b5a7a', '#c23a2a', '#e8e4da', '#2f5a3f', '#5a4a7a', '#d6a12a', '#e86a2a'], bot: ['#2a2a2e', '#1f2430', '#3d3530', '#2c4468'] },
  };
  const P_ACC = ['#c23a2a', '#f2c230', '#2f6fd1', '#e8e4da', '#2aa36b', '#e0629a', '#e86a2a', '#1d1f24'];
  const OUTF = {};
  function outfitOf(season, i, kid) {
    const key = season + (kid ? 'k' : '') + i; if (OUTF[key]) return OUTF[key];
    let n = i * 977 + (kid ? 50000 : 0) + { spring: 1, summer: 2, autumn: 3, winter: 4 }[season] * 100000;
    const R = () => rnd(++n), pick = (a) => a[Math.floor(R() * a.length)], ch = (x) => R() < x, P = P_PAL[season] || P_PAL.summer;
    const o = { kid, skin: pick(P_SKIN), hair: pick(kid ? P_HAIR.slice(0, 6) : P_HAIR), shoes: pick(['#2a2a2e', '#f2f0ea', '#6b4a30', '#1d1f24', '#8a2f2f']), season };
    o.hairStyle = pick(kid ? ['short', 'long', 'bun'] : ['short', 'short', 'long', 'bun', 'long', 'bald']); if (o.hairStyle === 'bald' && o.hair !== '#9a9a9a') o.hairStyle = 'short';
    o.topC = pick(P.top); o.topC2 = pick(P.top); o.botC = pick(P.bot);
    if (season === 'summer') { o.top = pick(['tee', 'tee', 'tee', 'dress', 'shirt', 'tank']); o.bot = o.top === 'dress' ? 'none' : pick(['shorts', 'shorts', 'jeans', 'skirt', 'trousers']); if (ch(0.15)) o.hat = { t: 'cap', c: pick(P_ACC) }; o.glasses = ch(0.3); }
    else if (season === 'spring') { o.top = pick(['long', 'jacket', 'hoodie', 'jacket', 'tee']); o.bot = pick(['jeans', 'jeans', 'trousers', 'skirt']); if (ch(0.08)) o.hat = { t: 'cap', c: pick(P_ACC) }; }
    else if (season === 'autumn') { o.top = pick(['jacket', 'hoodie', 'coat', 'jacket', 'long']); o.bot = pick(['jeans', 'trousers', 'trousers', 'skirt']); if (ch(0.4)) o.scarf = pick(P_ACC); if (ch(0.35)) o.hat = { t: pick(['beanie', 'beanie', 'beret']), c: pick(P_ACC) }; }
    else { o.top = pick(['puffer', 'puffer', 'coat', 'coat', 'jacket']); o.bot = pick(['trousers', 'jeans', 'trousers']); o.scarf = ch(0.75) ? pick(P_ACC) : null; o.gloves = ch(0.6) ? pick(['#1d1f24', o.scarf || '#c23a2a', '#e8e4da']) : null; o.hat = ch(0.85) ? { t: pick(['beanie', 'bobble', 'bobble']), c: pick(P_ACC), c2: pick(P_ACC) } : null; o.shoes = pick(['#2a2a2e', '#4a3020', '#1d1f24']); }
    const b = R();
    if (!kid) o.bag = b < 0.22 ? { t: 'backpack', c: pick(['#2a2a2e', '#2f4a6b', '#8a2f2f', '#6b7a3a', '#d6a12a']) } : b < 0.4 ? { t: 'handbag', c: pick(['#6b4a30', '#1d1f24', '#c23a2a', '#e8e2d2']) } : b < 0.5 ? { t: 'shopper', c: pick(['#e8e4da', '#f2c230', '#2aa36b']) } : null;
    else if (b < 0.4) o.bag = { t: 'backpack', c: pick(P_ACC) };
    o.umb = ch(kid ? 0.3 : 0.8) ? pick(['#1d1f24', '#1d1f24', '#2f4a6b', '#c23a2a', '#2aa36b', '#f2c230', '#e0629a', '#6b3a6b']) : null;   // deštník, když prší
    return (OUTF[key] = o);
  }
  const PGW = 9, PGH = 23, PCX = 4, PBASE = 21;               // mřížka postavy (body), nohy uprostřed dole
  const pShade = (hex, f) => { const v = parseInt(hex.slice(1), 16); return `rgb(${[v >> 16, (v >> 8) & 255, v & 255].map((c) => Math.max(0, Math.min(255, Math.round(c * f))))})`; };
  function personGrid(o, back, frame, umb) {
    const g = Array.from({ length: PGH }, () => Array(PGW).fill(null)), CX = PCX;
    const set = (x, y, c) => { if (x >= 0 && x < PGW && y >= 0 && y < PGH && c) g[y][x] = c; };
    const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c); };
    const legH = o.kid ? 3 : 4, torsoH = o.kid ? 3 : 4, bob = frame % 2 ? -1 : 0, shoeY = PBASE, legTop = shoeY - legH, hip = legTop - 1, tTop = hip - torsoH, neck = tTop - 1, headB = neck - 1, headT = headB - 3;
    const B = (y) => y + bob, lift = frame === 1 ? 'L' : frame === 3 ? 'R' : '', cold = o.season === 'winter' || o.season === 'autumn';
    const legC = { jeans: o.botC, trousers: o.botC, shorts: o.botC, skirt: o.skin, none: o.skin }[o.bot] || o.botC;
    for (const [side, x0] of [['L', CX - 2], ['R', CX + 1]]) {
      const up = lift === side ? 1 : 0;
      for (let y = legTop; y < shoeY - up; y++) rect(x0, B(y), x0 + 1, B(y), o.bot === 'shorts' && y >= legTop + 2 ? o.skin : (o.top === 'dress' || o.bot === 'skirt') && y >= legTop + 1 ? (cold ? '#2a2a2e' : o.skin) : legC);
      rect(x0, B(shoeY - up), x0 + 1, B(shoeY - up), o.shoes);
    }
    const arm = { tee: 'short', tank: 'none', dress: 'short' }[o.top] || 'long', wide = o.top === 'puffer';
    rect(CX - 2 - (wide ? 1 : 0), B(tTop), CX + 2 + (wide ? 1 : 0), B(hip), o.topC);
    if (wide) { rect(CX - 3, B(tTop + 1), CX + 3, B(tTop + 1), pShade(o.topC, 0.78)); rect(CX - 3, B(tTop + 3), CX + 3, B(tTop + 3), pShade(o.topC, 0.78)); }
    if (o.top === 'coat') rect(CX - 2, B(hip + 1), CX + 2, B(hip + 2), o.topC);
    if (o.top === 'jacket' && !back) rect(CX, B(tTop), CX, B(hip), o.topC2);
    if (o.top === 'hoodie') { if (back) rect(CX - 1, B(neck), CX + 1, B(tTop + 1), pShade(o.topC, 0.85)); else { set(CX - 1, B(tTop + 1), '#f2f0ea'); set(CX + 1, B(tTop + 1), '#f2f0ea'); } }
    if (o.top === 'dress') { rect(CX - 2, B(hip + 1), CX + 2, B(hip + 1), o.topC); rect(CX - 3, B(hip + 2), CX + 3, B(hip + 2), o.topC); }
    if (o.bot === 'skirt') { rect(CX - 2, B(hip), CX + 2, B(hip), o.botC); rect(CX - 3, B(hip + 1), CX + 3, B(hip + 1), o.botC); }
    else if (o.top !== 'dress' && o.top !== 'coat') rect(CX - 2, B(hip), CX + 2, B(hip), pShade(legC, 0.85));
    const sw = frame === 1 ? 1 : frame === 3 ? -1 : 0;
    for (const [x, s] of [[CX - 3 - (wide ? 1 : 0), sw], [CX + 3 + (wide ? 1 : 0), -sw]]) {
      if (umb && x > CX) continue;                          // ruka zvednutá k deštníku (kreslí se u deštníku)
      const y1 = hip + (s < 0 ? -1 : 0);
      for (let y = tTop; y <= y1; y++) set(x, B(y), arm === 'none' ? o.skin : arm === 'long' || y <= tTop + 1 ? pShade(o.topC, 0.9) : o.skin);
      set(x, B(y1 + 1), o.gloves || o.skin);
    }
    set(CX, B(neck), o.skin);
    if (o.scarf) { rect(CX - 1, B(neck), CX + 1, B(neck), o.scarf); if (!back) rect(CX - 1, B(tTop), CX - 1, B(tTop + 2), o.scarf); }
    rect(CX - 1, B(headT), CX + 1, B(headB), back ? o.hair : o.skin);
    if (!back) {
      if (o.hairStyle !== 'bald') rect(CX - 1, B(headT), CX + 1, B(headT), o.hair);
      if (o.hairStyle === 'long') { for (const x of [CX - 2, CX - 1, CX + 1, CX + 2]) set(x, B(headT + 1), o.hair); rect(CX - 2, B(headT + 2), CX - 2, B(neck + 1), o.hair); rect(CX + 2, B(headT + 2), CX + 2, B(neck + 1), o.hair); }
      if (o.glasses) rect(CX - 1, B(headT + 1), CX + 1, B(headT + 1), '#1d1f24'); else { set(CX - 1, B(headT + 1), '#3a2a22'); set(CX + 1, B(headT + 1), '#3a2a22'); }
    } else { if (o.hairStyle === 'bald') rect(CX - 1, B(headT), CX + 1, B(headB), pShade(o.skin, 0.95)); if (o.hairStyle === 'long') rect(CX - 1, B(neck), CX + 1, B(tTop + 2), o.hair); }
    if (o.hairStyle === 'bun') set(CX, B(headT - 1), o.hair);
    if (o.hat) {
      const c = o.hat.c;
      if (o.hat.t === 'cap') { rect(CX - 1, B(headT - 1), CX + 1, B(headT), c); if (!back) set(CX + 2, B(headT), pShade(c, 0.8)); }
      if (o.hat.t === 'beanie' || o.hat.t === 'bobble') { rect(CX - 1, B(headT - 1), CX + 1, B(headT), c); rect(CX - 1, B(headT + (back ? 1 : 0)), CX + 1, B(headT + (back ? 1 : 0)), pShade(c, 0.8)); }
      if (o.hat.t === 'bobble') set(CX, B(headT - 2), o.hat.c2 || '#f2f0ea');
      if (o.hat.t === 'beret') { rect(CX - 2, B(headT - 1), CX + 1, B(headT - 1), c); rect(CX - 1, B(headT), CX + 1, B(headT), c); }
    }
    if (umb) {                                               // deštník: stříška nad hlavou, tyč do zvednuté ruky
      const c = umb, rim = headT - 3, hx = CX + 3 + (wide ? 1 : 0);
      set(CX, rim - 3, '#3a3a40'); rect(CX - 1, rim - 2, CX + 1, rim - 2, c); rect(CX - 3, rim - 1, CX + 3, rim - 1, c);
      rect(CX - 4, rim, CX + 4, rim, pShade(c, 0.72)); set(CX - 2, rim - 1, pShade(c, 1.35));
      for (let y = rim + 1; y <= B(headB); y++) set(CX + 2, y, '#3a3a40');
      set(CX + 2, B(headB + 1), o.gloves || o.skin); set(hx, B(tTop), pShade(o.topC, 0.9)); set(hx - 1 , B(neck), pShade(o.topC, 0.9));
    }
    if (o.bag) {
      const c = o.bag.c;
      if (o.bag.t === 'backpack') { if (back) { rect(CX - 2, B(tTop + 1), CX + 2, B(hip - 1), c); rect(CX - 2, B(tTop + 1), CX + 2, B(tTop + 1), pShade(c, 0.75)); } else { set(CX - 2, B(tTop), pShade(c, 0.8)); set(CX + 2, B(tTop), pShade(c, 0.8)); } }
      if (o.bag.t === 'handbag') { rect(CX + 4, B(hip), CX + 4, B(hip + 1), c); set(CX + 3, B(tTop + 1), pShade(c, 0.7)); }
      if (o.bag.t === 'shopper') rect(CX - 4, B(hip + 1), CX - 3, B(hip + 3), c);
    }
    return g;
  }
  // obrázek postavy s obrysem (1 bod = 1 px, okraj 1 px), v noci ztmavený; cache podle oblečení, směru, kroku a tmy
  const PSPR = new Map();
  function personSprite(o, key, back, mir, frame, nb, umb) {
    const id = key + (back ? 'b' : 'f') + (mir ? 'm' : '') + frame + nb + (umb ? 'u' : '');
    let c = PSPR.get(id); if (c) return c;
    if (PSPR.size > 6000) PSPR.clear();
    const g = personGrid(o, back, frame, umb), f = 1 - nb * 0.12, at = (x, y) => y >= 0 && y < PGH && x >= 0 && x < PGW ? g[y][mir ? PGW - 1 - x : x] : null;
    c = document.createElement('canvas'); c.width = PGW + 2; c.height = PGH + 2; const q = c.getContext('2d');
    q.fillStyle = 'rgba(24,26,32,0.85)';
    for (let y = -1; y <= PGH; y++) for (let x = -1; x <= PGW; x++) if (!at(x, y) && (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1))) q.fillRect(x + 1, y + 1, 1, 1);
    for (let y = 0; y < PGH; y++) for (let x = 0; x < PGW; x++) {
      const col = at(x, y); if (!col) continue;
      q.fillStyle = col[0] === '#' ? pShade(col, f) : col; q.fillRect(x + 1, y + 1, 1, 1);
      if (!at(x + 1, y)) { q.fillStyle = 'rgba(0,0,0,0.16)'; q.fillRect(x + 1, y + 1, 1, 1); }
    }
    PSPR.set(id, c); return c;
  }
  // cyklista: mřížka 19 × 20 bodů po 10 cm (kola 0,7 m), z boku čelem doprava (mir = zrcadlově), nebo zepředu / zezadu
  const BGW = 19, BGH = 20, BCX = 9, BBASE = 19;
  function bikeGrid(o, b, view, frame) {
    const g = Array.from({ length: BGH }, () => Array(BGW).fill(null));
    const set = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < BGW && y >= 0 && y < BGH && (c || c === 0)) g[y][x] = c; };
    const line = (x0, y0, x1, y1, c) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1); for (let k = 0; k <= n; k++) set(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n, c); };
    const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c); };
    const TY = '#26272b', shin = o.bot === 'shorts' || o.bot === 'skirt' || o.top === 'dress' ? o.skin : o.botC, arm = { tee: 'short', tank: 'none', dress: 'short' }[o.top] ? o.skin : o.topC;
    const head = b.helm || o.hair;
    if (view === 's') {
      const a = frame * Math.PI / 2, BB = [9, 15], P1 = [BB[0] + 2 * Math.cos(a), BB[1] + 2 * Math.sin(a)], P2 = [BB[0] - 2 * Math.cos(a), BB[1] - 2 * Math.sin(a)];
      const leg = (P, c, cs) => { const H = [7, 9], K = [(H[0] + P[0]) / 2 + 1.5, (H[1] + P[1]) / 2 - 1]; line(H[0], H[1], K[0], K[1], c); line(K[0], K[1], P[0], P[1], cs); set(P[0], P[1], o.shoes); set(P[0] + 1, P[1], o.shoes); };
      for (const cx of [4, 14]) for (let y = 12; y <= 19; y++) for (let x = cx - 4; x <= cx + 4; x++) { const d = Math.hypot(x - cx, y - 16); if (d >= 2.6 && d < 3.4) set(x, y, TY); else if (d < 2.6) set(x, y, 0); }
      leg(P2, pShade(o.botC, 0.7), pShade(shin, 0.7));
      set(4, 16, '#9aa0a8'); set(14, 16, '#9aa0a8');
      line(4, 16, 7, 11, b.col); line(7, 11, 9, 15, b.col); line(4, 16, 9, 15, b.col); line(7, 11, 12, 11, b.col); line(9, 15, 12, 11, b.col); line(12, 10, 14, 16, b.col);
      rect(6, 10, 8, 10, TY); set(12, 9, TY); rect(12, 8, 13, 8, TY);
      leg(P1, o.botC, shin);
      rect(6, 8, 8, 8, o.topC); rect(7, 7, 9, 7, o.topC); rect(8, 6, 10, 6, o.topC); rect(9, 5, 10, 5, o.topC);   // trup v předklonu
      set(11, 6, arm); set(12, 7, arm); set(13, 8, o.skin);
      rect(10, 2, 12, 4, o.skin); set(12, 3, pShade(o.skin, 0.8));
      if (b.helm) { rect(9, 1, 12, 1, head); set(9, 2, head); set(10, 2, head); }
      else { rect(10, 1, 12, 1, o.hair); set(10, 2, o.hair); set(10, 3, o.hair); }
    } else {
      const up = frame % 2 ? 1 : 0, L = frame < 2;
      rect(9, 12, 9, 19, TY); rect(9, 10, 9, 11, b.col);
      if (view === 'b') { rect(8, 9, 10, 10, TY); }
      rect(5, 9, 13, 9, TY);
      for (const [x, lift] of [[8, L ? up : 0], [10, L ? 0 : up]]) { rect(x, 10, x, 12 - lift, o.botC); rect(x, 13 - lift, x, 15 - lift, shin); set(x, 16 - lift, o.shoes); }
      rect(7, 5, 11, 8, o.topC); line(6, 6, 6, 8, arm); line(12, 6, 12, 8, arm); set(6, 9, o.skin); set(12, 9, o.skin);
      rect(8, 1, 10, 4, view === 'b' ? o.hair : o.skin); rect(8, 0, 10, 0, head); if (b.helm) { rect(7, 1, 11, 1, head); }
      else if (view === 'f') { rect(8, 1, 10, 1, o.hair); }
    }
    return g;
  }
  const BSPR = new Map();
  function bikeSprite(o, key, b, view, mir, frame, nb) {
    const id = key + b.col + (b.helm || '') + view + (mir ? 'm' : '') + frame + nb;
    let c = BSPR.get(id); if (c) return c;
    if (BSPR.size > 3000) BSPR.clear();
    const g = bikeGrid(o, b, view, view === 's' ? frame : frame), f = 1 - nb * 0.12, at = (x, y) => y >= 0 && y < BGH && x >= 0 && x < BGW ? g[y][mir ? BGW - 1 - x : x] : null;
    c = document.createElement('canvas'); c.width = BGW + 2; c.height = BGH + 2; const q = c.getContext('2d');
    q.fillStyle = 'rgba(24,26,32,0.85)';
    for (let y = -1; y <= BGH; y++) for (let x = -1; x <= BGW; x++) if (at(x, y) == null && (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1))) q.fillRect(x + 1, y + 1, 1, 1);   // 0 = průhledné bez obrysu (vnitřek kola)
    for (let y = 0; y < BGH; y++) for (let x = 0; x < BGW; x++) { const col = at(x, y); if (col) { q.fillStyle = col[0] === '#' ? pShade(col, f) : col; q.fillRect(x + 1, y + 1, 1, 1); } }
    BSPR.set(id, c); return c;
  }
  function drawDogAt(X, Y, u, mir, frame, col) {
    const rows = [[0, 0, 0, 1, 1], [1, 1, 1, 1, 1], [1, 1, 1, 1, 0], frame % 2 ? [1, 0, 0, 1, 0] : [0, 1, 0, 0, 1]], ox = X - 2.5 * u, oy = Y - 4 * u;
    ctx.fillStyle = 'rgba(24,26,32,0.85)'; rows.forEach((r, j) => r.forEach((v, i) => { if (v) ctx.fillRect(ox + (mir ? 4 - i : i) * u - u, oy + j * u - u, 3 * u, 3 * u); }));
    rows.forEach((r, j) => r.forEach((v, i) => { if (v) { ctx.fillStyle = j === 3 ? pShade(col, 0.7) : col; ctx.fillRect(ox + (mir ? 4 - i : i) * u, oy + j * u, u, u); } }));
  }

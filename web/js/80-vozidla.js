  // jedoucí vozidla: stejný model jako zaparkovaná auta v renderu (karoserie, prosklení, střecha, 4 kola), stěny stínované
  // stejným sluncem (od jihovýchodu). Kreslí se jako render: do malého obrázku v rozlišení mapy (1 px = cam.mpp),
  // s tmavým obrysem, a zvětší se bez vyhlazení. Obrázky se cachují podle barvy a směru (48 směrů).
  const SUNV = (() => { const v = [0.38, -0.68, 0.62], n = Math.hypot(...v); return v.map((q) => q / n); })();
  const RGB = {}, rgbOf = (hex) => RGB[hex] || (RGB[hex] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)));
  const lit = (rgb, d) => { const f = (0.62 + 0.42 * Math.max(0, d)) / 0.88; return `rgb(${rgb.map((q) => Math.min(255, Math.round(q * f))).join(',')})`; };
  const VEH = new Map(), NDIR = 48, NDIR_VLAK = 240;   // vlak: jemnější natočení, ať na sebe vozy navazují (48 směrů = schod na spoji)
  const ndirOf = (isBus) => isBus === 4 ? NDIR_VLAK : NDIR;
  // vlaky: délky článků podle skutečných řad (Wikipedie), barvy podle jednotného schématu ČD; výška a čela jsou přibližné.
  // f / r = čelo vpředu / vzadu; deck 2 = patrový; loco = bez bočních oken. Výběr: "vlak" v mesto.json.
  const CD = { low: [18, 63, 115], body: [31, 106, 176], band: [232, 240, 246], roof: [120, 128, 136] };
  const CDW = { low: [31, 95, 168], body: [236, 240, 242], band: [31, 95, 168], roof: [150, 156, 162] };
  const TRAINS = {
    regiopanter: { h: 4.2, ...CD, nose: 2.6, top: 'box', cars: [{ len: 26.2, f: 1 }, { len: 26.2, r: 1 }] },      // RegioPanter, 52,9 m
    regioshark: { h: 3.9, ...CD, nose: 2.2, top: 'box', cars: [{ len: 21.6, f: 1 }, { len: 21.6, r: 1 }] },       // řada 844, 43,73 m
    regionova: { h: 3.8, ...CD, nose: 1.2, top: 'box', cars: [{ len: 14, f: 1 }, { len: 14, r: 1 }] },            // řada 814, 28,44 m
    vuz810: { h: 3.7, ...CDW, nose: 0.7, cars: [{ len: 13.97, f: 1, r: 1 }] },                                    // řada 810, 13,97 m
    cityelefant: { h: 4.6, ...CDW, nose: 1.6, deck: 2, top: 'panto', cars: [{ len: 26.2, f: 1 }, { len: 26.2 }, { len: 26.2, r: 1 }] },   // řada 471, 79,2 m
    rychlik: { h: 4.1, ...CD, nose: 1.4, cars: [{ len: 18, f: 1, loco: 1, top: 'panto' }, { len: 26.4 }, { len: 26.4 }, { len: 26.4 }] },   // lokomotiva 380 (18 m) a vozy
  };
  const VLAK = {{VLAK}};
  const trainOf = (line) => TRAINS[VLAK.linky[line]] ? VLAK.linky[line] : TRAINS[VLAK.vychozi] ? VLAK.vychozi : 'regionova';
  // col = "kabina|nástavba|druh" (druh: box = skříň, tarp = plachta)
  function truckFaces(ctx) {
    const { R, box, faces, fx_, fy_, sxv, syv, vis, sun, l, w, col, snow } = ctx;
    const [cabHex, bodyHex, kind] = col.split('|'), CAB = rgbOf(cabHex), BODY = rgbOf(bodyHex);
    const DARK = [34, 35, 38], TYRE = [26, 26, 28], HUB = [150, 152, 156], GLASS = [62, 78, 98], GREY = [118, 121, 127], GUARD = [196, 198, 200];
    const sCab = l - 2.25, sBox = sCab - 0.18;                     // kabina 2,25 m, mezera 18 cm, nástavba do konce
    const parts = [];                                              // [střed s, střed t, z0, box()] -> malíř od vzdálených
    const P = (s0, s1, t0, t1, z0, z1, rgb, top) => parts.push([(s0 + s1) / 2, (t0 + t1) / 2, z0, () => box(s0, s1, t0, t1, z0, z1, rgb, top)]);
    const Qs = (s0, s1, t, z0, z1, rgb) => {                       // plocha na boku (t = ±w), jen když je bok vidět
      const side = Math.sign(t), nx = sxv * side, ny = syv * side;
      if (!vis(nx, ny)) return;
      parts.push([(s0 + s1) / 2, t * 1.01, z0 + 0.01, () => faces.push([[R(s0, t, z0), R(s1, t, z0), R(s1, t, z1), R(s0, t, z1)], lit(rgb, sun(nx, ny, 0))])]);
    };
    const Qf = (t0, t1, z0, z1, rgb) => {                          // plocha na čele kabiny (s = l)
      if (!vis(fx_, fy_)) return;
      parts.push([l + 0.01, (t0 + t1) / 2, z0 + 0.01, () => faces.push([[R(l + 0.005, t0, z0), R(l + 0.005, t1, z0), R(l + 0.005, t1, z1), R(l + 0.005, t0, z1)], lit(rgb, sun(fx_, fy_, 0))])]);
    };
    // podvozek a kola
    P(-l + 0.4, l - 0.3, -w * 0.42, w * 0.42, 0.45, 0.95, DARK);
    const axles = [l - 1.35, -l + 2.3];
    for (const s_ of axles) for (const side of [-1, 1]) {
      P(s_ - 0.5, s_ + 0.5, side * w * 0.96 - 0.16, side * w * 0.96 + 0.16, 0, 1.0, TYRE);
      Qs(s_ - 0.2, s_ + 0.2, side * (w * 0.96 + 0.161), 0.3, 0.7, HUB);
    }
    for (const side of [-1, 1]) {
      P(sCab - 0.25, sCab + 0.75, side * w * 0.88 - 0.18, side * w * 0.88 + 0.18, 0.5, 1.05, GREY);     // nádrž
      P(-l + 2.9, sCab - 0.35, side * w * 0.9 - 0.04, side * w * 0.9 + 0.04, 0.55, 0.72, GUARD);           // boční zábrana
    }
    P(-l, -l + 0.12, -w * 0.8, w * 0.8, 0.45, 0.62, DARK);                                                 // zadní zábrana
    // kabina: plochá čela, okna, maska, nárazník, zvýšená střecha se spoilerem
    P(sCab, l, -w * 0.97, w * 0.97, 0.95, 2.95, CAB);
    P(l - 0.08, l + 0.06, -w * 0.97, w * 0.97, 0.4, 0.95, DARK);                                           // nárazník
    Qf(-w * 0.86, w * 0.86, 1.85, 2.75, GLASS);                                                            // čelní sklo
    Qf(-w * 0.62, w * 0.62, 1.2, 1.5, DARK);                                                               // maska
    Qf(-w * 0.9, -w * 0.62, 1.0, 1.15, [236, 232, 214]); Qf(w * 0.62, w * 0.9, 1.0, 1.15, [236, 232, 214]); // světla
    for (const side of [-1, 1]) Qs(l - 1.15, l - 0.12, side * w * 0.971, 1.85, 2.72, GLASS);              // boční okno
    P(sCab + 0.05, l - 0.3, -w * 0.93, w * 0.93, 2.95, 3.25, CAB, snow);                                  // střecha kabiny
    P(sCab + 0.05, l - 0.95, -w * 0.9, w * 0.9, 3.25, 3.55, CAB, snow);                                   // spoiler
    for (const side of [-1, 1]) P(l - 0.75, l - 0.5, side * (w + 0.12) - 0.06, side * (w + 0.12) + 0.06, 1.75, 2.45, DARK);   // zrcátka
    // nástavba: skříň nebo plachta, rám dole, horní lišta
    const top = 3.7;
    P(-l, sBox, -w, w, 1.05, top, BODY, snow || BODY.map((q) => Math.min(255, q + 10)));
    for (const side of [-1, 1]) {
      Qs(-l, sBox, side * w * 1.002, 1.05, 1.25, kind === 'tarp' ? GREY : [170, 172, 176]);                // rám
      Qs(-l, sBox, side * w * 1.002, top - 0.14, top, kind === 'tarp' ? BODY.map((q) => q * 0.82) : [205, 207, 210]);
      if (kind === 'tarp') for (let s_ = -l + 0.9; s_ < sBox - 0.3; s_ += 1.15)                           // přezky plachty
        Qs(s_, s_ + 0.12, side * w * 1.003, 1.25, 1.45, BODY.map((q) => q * 0.7));
      else for (let s_ = -l + 1.2; s_ < sBox - 0.4; s_ += 1.9)                                             // spáry skříně
        Qs(s_, s_ + 0.07, side * w * 1.003, 1.25, top - 0.14, BODY.map((q) => q * 0.86));
    }
    // vzdálenější díly první (pohled od jihozápadu = větší x + y je dál), při shodě nižší dřív
    const depth = ([s, t, z]) => (fx_ * s + sxv * t) + (fy_ * s + syv * t);
    parts.sort((a, b) => depth(b) - depth(a) || a[2] - b[2]).forEach((p) => p[3]());
  }
  function vehicleSprite(col, k, isBus, len, wid, snowy) {
    const key = `${col}|${k}|${isBus ? +isBus : 0}|${snowy ? 1 : 0}`;      // isBus: 1 autobus, 2 tramvaj, 3 nákladní auto, 4 vlak, 5–10 další vozidla (VTYP)
    if (VEH.has(key)) return VEH.get(key);
    const a = k / ndirOf(isBus) * Math.PI * 2, fx_ = Math.cos(a), fy_ = Math.sin(a), sxv = -fy_, syv = fx_;
    const O = toImg(0, 0, 0), R = (s, t, h) => { const p = toImg(fx_ * s + sxv * t, fy_ * s + syv * t, h); return [p[0] - O[0], p[1] - O[1]]; };
    const l = len / 2, w = wid / 2, faces = [];
    const vis = (nx, ny) => nx + ny < 0;                                   // normála míří ke kameře (na jihozápad)
    const sun = (nx, ny, nz) => nx * SUNV[0] + ny * SUNV[1] + nz * SUNV[2];
    const box = (s0, s1, t0, t1, z0, z1, rgb, topRgb) => {
      for (const [nx, ny, A, B] of [[fx_, fy_, [s1, t0], [s1, t1]], [-fx_, -fy_, [s0, t1], [s0, t0]], [sxv, syv, [s1, t1], [s0, t1]], [-sxv, -syv, [s0, t0], [s1, t0]]])
        if (vis(nx, ny)) faces.push([[R(A[0], A[1], z0), R(B[0], B[1], z0), R(B[0], B[1], z1), R(A[0], A[1], z1)], lit(rgb, sun(nx, ny, 0))]);
      faces.push([[R(s0, t0, z1), R(s1, t0, z1), R(s1, t1, z1), R(s0, t1, z1)], lit(topRgb || rgb, sun(0, 0, 1))]);
    };
    const c = rgbOf(col), DARK = [31, 31, 33], GLASS = [71, 87, 107], snow = snowy ? [238, 242, 248] : null;
    const near = vis(sxv, syv) ? 1 : -1;                                     // strana přivrácená ke kameře
    const wheels = (side) => { if (isBus >= 2) return; for (const s_ of isBus ? [-l + 2.6, l - 3.0] : [-1.35, 1.35]) box(s_ - (isBus ? 0.48 : 0.32), s_ + (isBus ? 0.48 : 0.32), side * (w - 0.06) - 0.1, side * (w - 0.06) + 0.1, 0, isBus ? 0.8 : 0.62, DARK); };
    wheels(-near);
    if (isBus >= 5) {
      // 5 dodávka, 7 tahač, 8 návěs, 9 popelářské auto (kabina|nástavba), 10 traktor. Díly se kreslí po vrstvách (podvozek, karoserie, nástavby)
      // a ve vrstvě odzadu dopředu podle toho, jestli čelo míří ke kameře; okna jsou plochy přilepené na stěnu dílu.
      const [c1, c2] = String(col).split('|'), hx = (q, d) => (q && q[0] === '#' ? rgbOf(q) : d);
      const A = hx(c1, [200, 200, 196]), B = hx(c2, A), GL = [58, 70, 88], DK = DARK, sn = (q) => snow || q;
      const tone = (q, f) => q.map((v) => Math.min(255, Math.round(v * f)));
      const fwd = vis(fx_, fy_), parts = [], axles = [];
      const Pt = (s0, s1, t0, t1, z0, z1, rgb, top, layer = 1) => { const e = { k: layer * 1000 + (fwd ? 1 : -1) * (s0 + s1) / 2, f: [() => box(s0, s1, t0, t1, z0, z1, rgb, top)] }; parts.push(e); return e; };
      const win = (e, sA, tA, sB, tB, z0, z1, rgb = GL) => e.f.push(() => {
        const es = sB - sA, et = tB - tA, el = Math.hypot(es, et) || 1; let ns = et / el, nt = -es / el;
        if (ns * (sA + sB) + nt * (tA + tB) < 0) { ns = -ns; nt = -nt; }
        const nx = fx_ * ns + sxv * nt, ny = fy_ * ns + syv * nt;
        if (vis(nx, ny)) faces.push([[R(sA, tA, z0), R(sB, tB, z0), R(sB, tB, z1), R(sA, tA, z1)], lit(rgb, sun(nx, ny, 0))]);
      });
      const cab = (s0, s1, z0, z1, zg, rgb) => {                            // kabina se sklem vpředu a okny po stranách
        const e = Pt(s0, s1, -w, w, z0, z1, rgb, sn(rgb));
        win(e, s1, -w * 0.86, s1, w * 0.86, zg, z1 - 0.3);
        for (const sd of [-1, 1]) win(e, s1 - 0.25, sd * w, s0 + 0.35, sd * w, zg + 0.05, z1 - 0.32);
        return e;
      };
      if (isBus === 5) {                                                    // dodávka
        axles.push([l - 0.95, 0.36, w, 0.13], [-l + 1.0, 0.36, w, 0.13]);
        Pt(-l, l, -w, w, 0.3, 1.05, A, A, 0);
        const e = Pt(l - 1.2, l, -w * 0.97, w * 0.97, 1.05, 1.95, A, sn(A));
        win(e, l, -w * 0.86, l, w * 0.86, 1.1, 1.88);
        for (const sd of [-1, 1]) win(e, l - 0.15, sd * w * 0.97, l - 1.05, sd * w * 0.97, 1.15, 1.85);
        Pt(-l, l - 1.2, -w, w, 1.05, 2.35, A, sn(A));
      } else if (isBus === 9) {                                             // popelářské auto
        axles.push([l - 1.3, 0.5, w, 0.15], [-l + 1.9, 0.5, w, 0.15], [-l + 3.2, 0.5, w, 0.15]);
        Pt(-l + 0.2, l - 0.2, -w * 0.8, w * 0.8, 0.5, 1.05, DK, DK, 0);
        cab(l - 2.2, l, 0.6, 2.75, 1.6, A);
        Pt(-l + 0.55, l - 2.3, -w, w, 1.0, 3.35, B, sn(tone(B, 1.05))); Pt(-l, -l + 0.55, -w * 0.94, w * 0.94, 0.8, 3.0, tone(B, 0.8), sn(tone(B, 0.8)));
      } else if (isBus === 7) {                                             // tahač návěsu
        axles.push([l - 1.25, 0.5, w, 0.15], [-l + 1.25, 0.5, w, 0.15]);
        Pt(-l, l - 0.3, -w * 0.82, w * 0.82, 0.55, 1.2, DK, DK, 0);
        cab(l - 2.35, l, 0.65, 3.05, 1.7, A);
        Pt(l - 2.35, l - 0.75, -w * 0.9, w * 0.9, 3.05, 3.85, A, sn(A), 2);
      } else if (isBus === 8) {                                             // návěs: plachta nebo skříň
        axles.push([-l + 1.3, 0.5, w, 0.15], [-l + 2.6, 0.5, w, 0.15], [-l + 3.9, 0.5, w, 0.15]);
        Pt(-l, l, -w * 0.85, w * 0.85, 0.95, 1.3, DK, DK, 0);
        Pt(-l, l, -w, w, 1.3, 4.0, A, sn(tone(A, 1.04)));
      } else if (isBus === 10) {                                            // traktor
        axles.push([l - 0.75, 0.42, w * 0.8, 0.14], [-l + 1.05, 0.8, w, 0.24]);
        Pt(-0.3, l, -0.55, 0.55, 0.75, 1.55, A, sn(A));
        Pt(-l + 0.25, -0.3, -w * 0.72, w * 0.72, 0.95, 1.45, A, A);
        Pt(-l + 0.3, -0.35, -w * 0.7, w * 0.7, 1.45, 2.6, GL, GL, 2);
        Pt(-l + 0.2, -0.25, -w * 0.78, w * 0.78, 2.6, 2.75, A, sn(A), 3);
      } else if (isBus === 11) {                                            // sypač s radlicí (Tatra): col "#oranžová|#modrá|r", r = radlice dole (zásah)
        const OR = A, BL = B, down = String(col).split('|')[2] === 'r', TK = [218, 220, 216], SV = [176, 180, 186], tt = (a, b) => [Math.min(a, b), Math.max(a, b)];
        axles.push([l - 1.75, 0.55, w, 0.17], [-l + 1.85, 0.55, w, 0.17]);
        Pt(-l + 0.3, l - 0.5, -w * 0.78, w * 0.78, 0.55, 1.15, DK, DK, 0);                      // rám
        Pt(l - 0.55, l, -w * 0.96, w * 0.96, 0.45, 1.2, DK, DK, 0);                             // nárazník
        const ce = cab(l - 2.2, l - 0.15, 1.15, 3.15, 2.05, OR);                                   // kabina
        win(ce, l - 0.15, -w * 0.9, l - 0.15, w * 0.9, 1.45, 1.75, DK);                             // maska
        Pt(l - 2.38, l - 2.2, w * 0.7, w * 0.88, 1.3, 3.8, SV, SV, 2);                             // výfuk za kabinou
        for (const sd of [-1, 1]) Pt(l - 1.15, l - 0.85, sd * w * 0.62 - 0.15, sd * w * 0.62 + 0.15, 3.15, 3.42, [255, 168, 0], [255, 196, 50], 2);   // majáky
        Pt(-l + 0.15, l - 2.45, -w * 0.8, w * 0.8, 1.15, 1.95, tone(OR, 0.9), tone(OR, 0.9));     // spodek násypky
        const hp = Pt(-l + 0.05, l - 2.45, -w, w, 1.95, 3.0, OR, sn(tone(OR, 1.06)), 2);            // nástavba se solí
        for (const sd of [-1, 1]) {
          win(hp, l - 2.45, sd * w, -l + 0.05, sd * w, 2.58, 2.76, BL);                               // modrý pruh
          Pt(-l + 0.7, l - 3.0, ...tt(sd * w * 0.8, sd * w * 1.0), 1.2, 1.85, TK, TK);              // nádrže se solankou
        }
        Pt(-l - 0.05, -l + 0.25, -0.45, 0.45, 0.5, 1.0, DK, DK, 0);                                // talíř posypu vzadu
        const z0 = down ? 0.02 : 0.45, z1 = z0 + 1.15, bA = [l + 1.35, -w * 1.3], bB = [l + 0.55, w * 1.3];   // radlice: šikmý štít před vozem
        Pt(l, l + 0.8, -0.45, 0.45, z0 + 0.35, z0 + 0.7, DK, DK, 0);                               // rameno radlice
        parts.push({ k: 1000 + (fwd ? 1 : -1) * (l + 1.0), f: [() => {
          const es = bB[0] - bA[0], et = bB[1] - bA[1], el = Math.hypot(es, et), ns = et / el, nt = -es / el;
          const nx = fx_ * ns + sxv * nt, ny = fy_ * ns + syv * nt, front = vis(nx, ny), d = sun(front ? nx : -nx, front ? ny : -ny, 0.2);
          const q = (za, zb, rgb) => faces.push([[R(bA[0], bA[1], za), R(bB[0], bB[1], za), R(bB[0], bB[1], zb), R(bA[0], bA[1], zb)], lit(rgb, d)]);
          q(z0, z0 + 0.18, front ? BL : DK); q(z0 + 0.18, z1, front ? OR : tone(OR, 0.78));
          faces.push([[R(bA[0], bA[1], z1), R(bB[0], bB[1], z1), R(bB[0] - 0.14, bB[1], z1), R(bA[0] - 0.14, bA[1], z1)], lit(OR, sun(0, 0, 1))]);
        }] });
        for (const [s_, t_] of [bA, bB]) {                                                          // tyčky s praporky na krajích radlice
          Pt(s_ - 0.05, s_ + 0.05, t_ - 0.05, t_ + 0.05, z1, z1 + 1.0, DK, DK, 3);
          Pt(s_ - 0.06, s_ + 0.06, ...tt(t_, t_ - Math.sign(t_) * 0.4), z1 + 0.65, z1 + 1.0, [255, 112, 30], [255, 112, 30], 3);
        }
      }
      const wh = (side) => { for (const [s_, r_, th, hw] of axles) box(s_ - r_ * 0.8, s_ + r_ * 0.8, side * (th - 0.08) - hw, side * (th - 0.08) + hw, 0, r_ * 1.7, DK); };
      wh(-near);
      parts.sort((a, b) => a.k - b.k);
      for (const e of parts) for (const f of e.f) f();
      wh(near);
    } else if (isBus === 4) {
      const [, name, ci] = col.split('|'), M = TRAINS[name], car = M.cars[+ci], h = M.h, nf = car.f ? M.nose : 0, nr = car.r ? M.nose : 0, ROOF = snow || M.roof;
      for (const s_ of [-l + 3.4, l - 3.4]) box(s_ - 1.4, s_ + 1.4, -w * 0.82, w * 0.82, 0.12, 0.6, DARK);       // podvozky
      const fp = [[-l + nr, -w], [l - nf, -w], [l, -w * (nf ? 0.5 : 1)], [l, w * (nf ? 0.5 : 1)], [l - nf, w], [-l + nr, w], [-l, w * (nr ? 0.5 : 1)], [-l, -w * (nr ? 0.5 : 1)]];
      const bands = car.loco ? [[0.6, 1.2, M.low], [1.2, 1.5, M.band], [1.5, h - 0.3, M.body]]
        : M.deck === 2 ? [[0.6, 1.05, M.low], [1.05, 1.95, null], [1.95, 2.3, M.band], [2.3, 3.5, null], [3.5, h - 0.3, M.body]]
          : [[0.6, 1.05, M.low], [1.05, 1.3, M.band], [1.3, 2.75, null], [2.75, h - 0.3, M.body]];
      const Q = (A, B, z0, z1, rgb, d) => faces.push([[R(A[0], A[1], z0), R(B[0], B[1], z0), R(B[0], B[1], z1), R(A[0], A[1], z1)], lit(rgb, d)]);
      for (let i = 0; i < fp.length; i++) {
        const A = fp[i], B = fp[(i + 1) % fp.length], es = B[0] - A[0], et = B[1] - A[1], el = Math.hypot(es, et);
        if (el < 0.01) continue;
        const ns = et / el, nt = -es / el, nx = fx_ * ns + sxv * nt, ny = fy_ * ns + syv * nt;
        if (!vis(nx, ny)) continue;
        const d = sun(nx, ny, 0), isEnd = Math.abs(ns) > 0.3, nose = isEnd && (ns > 0 ? nf : nr);
        if (car.loco && nose) { Q(A, B, 0.6, 1.5, M.low, d); Q(A, B, 1.5, 2.1, M.band, d); Q(A, B, 2.1, h - 0.9, GLASS, d); Q(A, B, h - 0.9, h - 0.3, M.body, d); continue; }
        for (const [z0, z1, cl] of bands) {
          if (cl) { Q(A, B, z0, z1, cl, d); continue; }
          if (isEnd) { Q(A, B, z0, z1, nose ? GLASS : M.body, d); continue; }
          Q(A, B, z0, z1, M.body, d);
          const n = Math.max(1, Math.round(el / 2.4)), e = 0.22 / el, P = (q) => [A[0] + es * q, A[1] + et * q];
          for (let k = 0; k < n; k++) Q(P(k / n + e), P((k + 1) / n - e), z0, z1, GLASS, d);
        }
      }
      const ip = fp.map(([s_, t_]) => [s_ * (1 - 0.3 / l), t_ * 0.78]), z1 = h - 0.3;
      for (let i = 0; i < fp.length; i++) {
        const A = fp[i], B = fp[(i + 1) % fp.length], a = ip[i], b = ip[(i + 1) % fp.length], es = B[0] - A[0], et = B[1] - A[1], el = Math.hypot(es, et);
        if (el < 0.01) continue;
        const nx = fx_ * et / el - sxv * es / el, ny = fy_ * et / el - syv * es / el;
        if (nx + ny >= 0.3) continue;
        faces.push([[R(A[0], A[1], z1), R(B[0], B[1], z1), R(b[0], b[1], h), R(a[0], a[1], h)], lit(ROOF, sun(nx * 0.6, ny * 0.6, 0.8))]);
      }
      faces.push([ip.map(([s_, t_]) => R(s_, t_, h)), lit(ROOF, sun(0, 0, 1))]);
      const top = car.top || M.top;
      if (top === 'box') box(-l * 0.5, l * 0.45, -0.7, 0.7, h, h + 0.3, ROOF);                                      // baterie nebo klimatizace
      if (top === 'panto') { box(l * 0.25, l * 0.45, -0.5, 0.5, h, h + 0.12, DARK); box(l * 0.33, l * 0.37, -0.55, 0.55, h + 0.12, h + 0.55, DARK); }   // sběrač
    } else if (isBus === 2) {                                                      // tramvaj T3: zkosená čela, zaoblená střecha, okna se sloupky
      const WH = [236, 238, 232], GR = [34, 138, 90], OR = [234, 150, 38], YE = [238, 196, 40], ROOF = snow || [214, 218, 212];
      const ch = 1.0, fp = [[-l + ch, -w], [l - ch, -w], [l, -w * 0.5], [l, w * 0.5], [l - ch, w], [-l + ch, w], [-l, w * 0.5], [-l, -w * 0.5]];
      const bands = [[0.25, 0.45, DARK], [0.45, 1.15, GR], [1.15, 1.27, OR], [1.27, 1.5, WH], [1.5, 2.48, null], [2.48, 2.62, WH], [2.62, 2.88, GR], [2.88, 2.98, WH]];
      const Q = (A, B, z0, z1, rgb, d) => faces.push([[R(A[0], A[1], z0), R(B[0], B[1], z0), R(B[0], B[1], z1), R(A[0], A[1], z1)], lit(rgb, d)]);
      for (let i = 0; i < fp.length; i++) {
        const A = fp[i], B = fp[(i + 1) % fp.length], es = B[0] - A[0], et = B[1] - A[1], el = Math.hypot(es, et), ns = et / el, nt = -es / el;
        const nx = fx_ * ns + sxv * nt, ny = fy_ * ns + syv * nt;
        if (!vis(nx, ny)) continue;
        const d = sun(nx, ny, 0), isEnd = Math.abs(ns) > 0.3;
        for (const [z0, z1, col] of bands) {
          if (col) { Q(A, B, z0, z1, col, d); continue; }
          if (isEnd) { Q(A, B, z0, z1 + 0.12, GLASS, d); continue; }          // čelní okno
          Q(A, B, z0, z1, WH, d);
          const n = Math.max(1, Math.round(el / 2.1)), e = 0.18 / el, P = (q) => [A[0] + es * q, A[1] + et * q];
          for (let k = 0; k < n; k++) Q(P(k / n + e), P((k + 1) / n - e), z0, z1, GLASS, d);
        }
      }
      const rz = 3.2, ip = fp.map(([s_, t_]) => [s_ * (1 - 0.32 / l), t_ * (1 - 0.32 / w * 1.6)]);
      for (let i = 0; i < fp.length; i++) {                                 // zaoblená hrana střechy
        const A = fp[i], B = fp[(i + 1) % fp.length], a = ip[i], b = ip[(i + 1) % fp.length], es = B[0] - A[0], et = B[1] - A[1], el = Math.hypot(es, et);
        const nx = fx_ * et / el - sxv * es / el, ny = fy_ * et / el - syv * es / el;
        if (nx + ny >= 0.3) continue;
        faces.push([[R(A[0], A[1], 2.98), R(B[0], B[1], 2.98), R(b[0], b[1], rz), R(a[0], a[1], rz)], lit(snow || WH, sun(nx * 0.6, ny * 0.6, 0.8))]);
      }
      faces.push([ip.map(([s_, t_]) => R(s_, t_, rz)), lit(ROOF, sun(0, 0, 1))]);
      box(-0.9, 0.7, -0.45, 0.45, rz, rz + 0.15, [92, 94, 100]);
      box(-0.5, 0.4, -0.06, 0.06, rz + 0.15, rz + 0.75, YE); box(-0.05, 0.35, -0.06, 0.06, rz + 0.6, rz + 1.05, YE); box(0.15, 0.3, -0.75, 0.75, rz + 1.0, rz + 1.08, YE);
    } else if (isBus === 3) {
      truckFaces({ R, box, faces, fx_, fy_, sxv, syv, vis, sun, l, w, col, snow });
    } else if (isBus) {                                                     // autobus: bílý, zelený a žlutý pruh, tmavá okna, žluté čelo
      const WH = [238, 238, 234], GR = [30, 140, 84], YL = [244, 196, 28], GL = [40, 44, 52], DOOR = [54, 58, 66], ROOF = snow || [222, 224, 220];
      const ch = 0.45, fp = [[-l + ch, -w], [l - ch, -w], [l, -w + ch], [l, w - ch], [l - ch, w], [-l + ch, w], [-l, w - ch], [-l, -w + ch]];
      const bands = [[0.3, 0.55, GR], [0.55, 0.95, YL], [0.95, 1.15, WH], [1.15, 2.7, null], [2.7, 3.0, WH]];
      const Q = (A, B, z0, z1, rgb, d) => faces.push([[R(A[0], A[1], z0), R(B[0], B[1], z0), R(B[0], B[1], z1), R(A[0], A[1], z1)], lit(rgb, d)]);
      for (let i = 0; i < fp.length; i++) {
        const A = fp[i], B = fp[(i + 1) % fp.length], es = B[0] - A[0], et = B[1] - A[1], el = Math.hypot(es, et), ns = et / el, nt = -es / el;
        const nx = fx_ * ns + sxv * nt, ny = fy_ * ns + syv * nt;
        if (!vis(nx, ny)) continue;
        const d = sun(nx, ny, 0), front = ns > 0.9, back = ns < -0.9, corner = Math.abs(ns) < 0.9 && Math.abs(nt) < 0.9;
        for (const [z0, z1, col] of bands) {
          if (col) { Q(A, B, z0, z1, front && z0 < 1 ? GR : col, d); continue; }
          if (front) { Q(A, B, 0.95, 2.85, GL, d); continue; }                // čelní sklo
          if (back) { Q(A, B, z0, z1, WH, d); Q(A, B, 1.6, 2.6, GL, d); continue; }
          if (corner) { Q(A, B, z0, z1, ns > 0 ? YL : WH, d); continue; }      // žlutý roh čela
          Q(A, B, z0, z1, GL, d);
          for (const ds of [-3.6, 0.2, 3.9]) {                               // dveře
            const q0 = (ds - A[0]) / es, q1 = (ds + 1.2 - A[0]) / es, P = (q) => [A[0] + es * q, A[1] + et * q];
            if (q0 > 0 && q1 < 1) Q(P(Math.min(q0, q1)), P(Math.max(q0, q1)), 0.35, 2.7, DOOR, d);
          }
        }
      }
      const rz = 3.0, ip = fp.map(([s_, t_]) => [s_ * 0.97, t_ * 0.86]);
      for (let i = 0; i < fp.length; i++) {
        const A = fp[i], B = fp[(i + 1) % fp.length], a = ip[i], b = ip[(i + 1) % fp.length], es = B[0] - A[0], et = B[1] - A[1], el = Math.hypot(es, et);
        const ns = et / el, nx = fx_ * ns - sxv * es / el, ny = fy_ * ns - syv * es / el;
        if (nx + ny >= 0.3) continue;
        faces.push([[R(A[0], A[1], 2.95), R(B[0], B[1], 2.95), R(b[0], b[1], rz + 0.08), R(a[0], a[1], rz + 0.08)], lit(ns > 0.5 ? YL : (snow || WH), sun(nx * 0.6, ny * 0.6, 0.8))]);
      }
      faces.push([ip.map(([s_, t_]) => R(s_, t_, rz + 0.08)), lit(ROOF, sun(0, 0, 1))]);
      box(-l * 0.45, l * 0.55, -0.75, 0.75, rz + 0.08, rz + 0.38, WH, ROOF);   // baterie na střeše
      box(l - 1.1, l - 0.35, -0.95, 0.95, rz, rz + 0.18, YL);                  // žlutá čepice čela
    } else {
      box(-l, l, -w * 0.98, w * 0.98, 0.3, 1.0, c);
      box(-l * 0.57, l * 0.48, -w * 0.89, w * 0.89, 1.0, 1.45, GLASS);
      box(-l * 0.55, l * 0.45, -w * 0.87, w * 0.87, 1.45, 1.52, c, snow);
    }
    wheels(near);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [pts] of faces) for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    x0 = Math.floor(x0) - 1; y0 = Math.floor(y0) - 1;
    const cw = Math.ceil(x1) - x0 + 2, chh = Math.ceil(y1) - y0 + 2;
    const cv = document.createElement('canvas'); cv.width = cw; cv.height = chh;
    const g = cv.getContext('2d');
    for (const [pts, fill] of faces) { g.fillStyle = fill; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x - x0, y - y0) : g.moveTo(x - x0, y - y0))); g.closePath(); g.fill(); }
    // jako render: bez poloprůhledných okrajů a s tmavým obrysem 1 px kolem siluety
    const im = g.getImageData(0, 0, cw, chh), d = im.data, solid = new Uint8Array(cw * chh);
    for (let i = 0; i < cw * chh; i++) { solid[i] = d[i * 4 + 3] >= 110 ? 1 : 0; d[i * 4 + 3] = solid[i] ? 255 : 0; }
    for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) {
      const i = y * cw + x; if (solid[i]) continue;
      if ((x > 0 && solid[i - 1]) || (x < cw - 1 && solid[i + 1]) || (y > 0 && solid[i - cw]) || (y < chh - 1 && solid[i + cw])) d.set([27, 28, 34, 255], i * 4);
    }
    g.putImageData(im, 0, 0);
    const spr = { c: cv, x0, y0 }; VEH.set(key, spr); return spr;
  }

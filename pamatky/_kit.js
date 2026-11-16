// Stavebnice pro vlastní modely památek (pamatky/<slug>.js). Návod: pamatky/README.md.
// Jednotky metry, barvy '#rrggbb' | [r, g, b] 0–255 | [r, g, b] 0–1. Souřadnice v rámci F: s = podél, t = napříč, h = výška nad terénem
// rámce (F.z). Bufery: 'X' = pevné tvary (bez textury, aw.z = sníh nahoře v zimě), 'R' = střechy (sníh na šikmých plochách, aw.x > 0.5
// = řady tašek), 'W' = zdi s okny podle stylu fasády ze shaderu render.html (aw = [u podél zdi, v výška nad M.g, délka zdi, styl]).
// Hostitel (render.html, blok „vlastní modely památek“) dodá: THREE, W, R, X, pushTri, vyska(x, y), sezona, noc, stromy a model M.

export function makeKit(H, M) {
  const { THREE, W, R, X, pushTri } = H;
  const BUF = { W, R, X };
  const buf = (b) => (typeof b === 'string' ? BUF[b] : b) || X;
  const tv = (x, y, z) => [x, z, -y];                               // (východ, sever, výška) -> three
  const K = { M, BUF, sezona: H.sezona || 'summer', noc: !!H.noc };   // sezona: spring | summer | autumn | winter (stromy, kašny bez vody v zimě)

  // ---------- barvy ----------
  const c = K.c = (v) => {
    if (typeof v === 'string') { const h = v.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); }
    return v.some((q) => q > 1) ? v.map((q) => q / 255) : v.slice();
  };
  K.sv = (v, k) => c(v).map((q) => Math.min(1, q * k));          // světlejší / tmavší (k > 1 / k < 1)
  K.mix = (a, b, t) => { const A = c(a), B = c(b); return A.map((q, i) => q + (B[i] - q) * t); };
  K.C = {                                                         // výchozí paleta (přepiš podle fotek)
    omitka: '#e6dcc4', piskovec: '#c9b58f', zula: '#8c877d', cihla: '#a4553a', bila: '#eeeae0',
    tasky: '#9c4a30', bridlice: '#4c535c', med: '#6f9e8a', plech: '#7d8389', zlato: '#d8b24c',
    sklo: '#4d6077', sklo2: '#2f3b4a', dvere: '#4a3426', drevo: '#6b4a32', tmava: '#2a2b2e',
  };
  const AWX = [0, 1, 1, 0], AWR = [0, 0, 0, 0];
  const hash = (a, b = 0) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  K.hash = hash;

  // ---------- rámce ----------
  // rámec = bod (x, y) v místních souřadnicích čtverce, výška z, úhel a (rad, od východu proti směru hodin)
  function frame(x, y, z, a) {
    const ca = Math.cos(a), sa = Math.sin(a);
    const F = {
      x, y, z, a,
      P: (s, t, h) => tv(x + ca * s - sa * t, y + sa * s + ca * t, z + h),
      xy: (s, t) => [x + ca * s - sa * t, y + sa * s + ca * t],
      st: (px, py) => { const dx = px - x, dy = py - y; return [ca * dx + sa * dy, -sa * dx + ca * dy]; },
      sub: (s = 0, t = 0, da = 0, dh = 0) => { const [nx, ny] = F.xy(s, t); return frame(nx, ny, z + dh, a + da); },
      // směr k divákovi mapy (kamera od jihozápadu) v souřadnicích s, t
      kDivakovi: [ca * -Math.SQRT1_2 + sa * -Math.SQRT1_2, -sa * -Math.SQRT1_2 + ca * -Math.SQRT1_2],
    };
    return F;
  }
  K.ramec = frame;
  const r = M.ram;
  K.F = frame(r.x, r.y, M.g, r.a);           // hlavní rámec: střed opsaného obdélníku, s podél delší strany (−L/2..L/2), t napříč (−W/2..W/2)
  K.svet = frame(0, 0, M.g, 0);              // s = x (východ), t = y (sever) – pro půdorysy M.budovy[i].p
  K.dno = M.b - M.g;                         // spodek zdí (pod terénem, aby stavba na svahu nevisela)
  K.vyska = H.vyska;                         // výška terénu v bodě (x, y) místních souřadnic
  K.vyskaF = (F, s, t) => { const [x, y] = F.xy(s, t); return H.vyska(x, y) - F.z; };   // terén pod bodem rámce (relativně k F.z)

  // ---------- nízká úroveň ----------
  K.tri = (B, F, a, b, d, col, aw) => pushTri(buf(B), F.P(...a), F.P(...b), F.P(...d), c(col), aw || (buf(B) === R ? AWR : AWX));
  K.quad = (B, F, a, b, d, e, col, aw) => { K.tri(B, F, a, b, d, col, aw); K.tri(B, F, a, d, e, col, aw); };
  K.box = (F, s0, s1, t0, t1, h0, h1, col, o = {}) => {
    const B = buf(o.buf), aw = o.aw || (B === R ? AWR : AWX), C = c(col), CT = o.top ? c(o.top) : C;
    const p = [[s0, t0, h0], [s1, t0, h0], [s1, t1, h0], [s0, t1, h0], [s0, t0, h1], [s1, t0, h1], [s1, t1, h1], [s0, t1, h1]];
    const q = (i, j, k, l, cc) => K.quad(B, F, p[i], p[j], p[k], p[l], cc, aw);
    q(0, 1, 5, 4, C); q(1, 2, 6, 5, C); q(2, 3, 7, 6, C); q(3, 0, 4, 7, C); q(4, 5, 6, 7, CT);
    if (o.dno) q(0, 3, 2, 1, C);
  };
  // šikmý kvádr mezi body A a B (trám, žebro, vzpěra): průřez w × d
  K.tram = (F, A, B, w, d, col, o = {}) => {
    const dir = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], L = Math.hypot(...dir) || 1;
    const u = dir.map((q) => q / L), up = Math.abs(u[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
    const n1 = norm(cross(u, up)), n2 = cross(n1, u);
    const off = (P, a, b) => [P[0] + n1[0] * a + n2[0] * b, P[1] + n1[1] * a + n2[1] * b, P[2] + n1[2] * a + n2[2] * b];
    const cs = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
    for (let i = 0; i < 4; i++) { const [a0, b0] = cs[i], [a1, b1] = cs[(i + 1) % 4]; K.quad(o.buf, F, off(A, a0, b0), off(A, a1, b1), off(B, a1, b1), off(B, a0, b0), col, o.aw); }
  };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((q) => q / l); };

  // ---------- polygony ----------
  const area = (P) => { let s = 0; for (let i = 0; i < P.length; i++) { const [x0, y0] = P[i], [x1, y1] = P[(i + 1) % P.length]; s += x0 * y1 - x1 * y0; } return s / 2; };
  K.ccw = (P) => (area(P) < 0 ? P.slice().reverse() : P.slice());      // proti směru hodin (pak je vnějšek vpravo od směru hrany)
  K.plocha = area;
  // rovnoběžné odsazení polygonu (d > 0 ven), ostré rohy
  K.odsad = (P0, d) => {
    const P = K.ccw(P0), n = P.length, out = [];
    for (let i = 0; i < n; i++) {
      const a = P[(i + n - 1) % n], b = P[i], e = P[(i + 1) % n];
      const n1 = norm2([b[1] - a[1], -(b[0] - a[0])]), n2 = norm2([e[1] - b[1], -(e[0] - b[0])]);
      const m = norm2([n1[0] + n2[0], n1[1] + n2[1]]), k = Math.max(0.5, n1[0] * m[0] + n1[1] * m[1]);
      out.push([b[0] + m[0] * d / k, b[1] + m[1] * d / k]);
    }
    return out;
  };
  const inPoly = (x, y, P) => { let cc = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) cc = !cc; } return cc; };
  K.vPolygonu = inPoly;
  const norm2 = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
  // vodorovná plocha nad polygonem (v rámci F)
  K.deska = (F, P, h, col, o = {}) => {
    const B = buf(o.buf || 'X'), pts = P.map(([s, t]) => new THREE.Vector2(s, t));
    for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(pts, [])) K.tri(B, F, [...P[i], h], [...P[j], h], [...P[k], h], col, o.aw);
  };
  // hranol z polygonu: boční stěny od h0 do h1 (+ víko). o.st = styl oken ze shaderu (zdi pak jdou do bufferu W), o.vicko = barva víka
  // (false = bez víka), o.vickoBuf ('R' = jako střecha), o.zed = barva jen stěn (jinak col)
  K.hranol = (F, P0, h0, h1, col, o = {}) => {
    const P = K.ccw(P0), n = P.length;
    for (let i = 0; i < n; i++) {
      const A = P[i], B_ = P[(i + 1) % n];
      if (o.st !== undefined) K.zed(F, A, B_, h0, h1, o.zed || col, o.st);
      else K.quad(o.buf, F, [...A, h0], [...B_, h0], [...B_, h1], [...A, h1], o.zed || col, o.aw);
    }
    if (o.vicko !== false) K.deska(F, P, h1, o.vicko || col, { buf: o.vickoBuf || o.buf || 'X', aw: o.vickoAw });
  };
  // zeď s texturou oken ze shaderu render.html (styl st: 0 rodinný dům, 1 panelák, 2 garáž, 3 hala, 4 kostel, 5 hladká, 11 činžák,
  // 13 zámek, 14 sklo a kámen, 15 skoro plná); v = výška nad M.g. Okna, která mají být vidět zblízka, kresli raději K.okna.
  K.zed = (F, A, B_, h0, h1, col, st = 5, du = 0) => {
    const len = Math.hypot(B_[0] - A[0], B_[1] - A[1]), C = c(col);
    const v0 = F.z + h0 - M.g, v1 = F.z + h1 - M.g, u0 = du, u1 = du + len;
    const a = F.P(A[0], A[1], h0), b = F.P(B_[0], B_[1], h0), d = F.P(B_[0], B_[1], h1), e = F.P(A[0], A[1], h1);
    pushTri(W, a, b, d, C, [[u0, v0, len, st], [u1, v0, len, st], [u1, v1, len, st]]);
    pushTri(W, a, d, e, C, [[u0, v0, len, st], [u1, v1, len, st], [u0, v1, len, st]]);
  };
  // půdorys budovy z dat (M.budovy[i].p) v souřadnicích rámce F (výchozí K.F), proti směru hodin
  K.pudorys = (i = 0, F = K.F, tol = 0.25) => K.zjednodus(K.ccw(M.budovy[i].p.map(([x, y]) => F.st(x, y))), tol);
  // zjednodušení uzavřeného polygonu (Douglas–Peucker, tolerance v m): pryč drobné zuby a skoro rovné lomy z dat
  K.zjednodus = (P, tol = 0.25) => {
    if (P.length < 5 || !tol) return P;
    const dp = (pts) => {
      if (pts.length < 3) return pts;
      const [a, b] = [pts[0], pts[pts.length - 1]], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-9;
      let im = -1, dm = 0;
      for (let i = 1; i < pts.length - 1; i++) { const d = Math.abs((b[0] - a[0]) * (a[1] - pts[i][1]) - (a[0] - pts[i][0]) * (b[1] - a[1])) / L; if (d > dm) { dm = d; im = i; } }
      return dm > tol ? [...dp(pts.slice(0, im + 1)).slice(0, -1), ...dp(pts.slice(im))] : [a, b];
    };
    let far = 0, fd = 0; for (let i = 1; i < P.length; i++) { const d = Math.hypot(P[i][0] - P[0][0], P[i][1] - P[0][1]); if (d > fd) { fd = d; far = i; } }
    const out = [...dp(P.slice(0, far + 1)).slice(0, -1), ...dp([...P.slice(far), P[0]]).slice(0, -1)];
    return out.length >= 3 ? out : P;
  };
  K.doRamu = (F, P) => P.map(([x, y]) => F.st(x, y));               // místní xy -> s, t rámce F
  // hrany polygonu (v rámci F, proti směru hodin): {i, A, B, L, n (vnější normála [s, t]), divak (> 0 = hrana je vidět z mapy),
  // sv (světová strana normály), soused (0–1: podíl hrany přiléhající k sousední budově = štítová zeď bez oken)}
  K.hrany = (F, P0) => {
    const P = K.ccw(P0), out = [], kd = F.kDivakovi;
    for (let i = 0; i < P.length; i++) {
      const A = P[i], B_ = P[(i + 1) % P.length], L = Math.hypot(B_[0] - A[0], B_[1] - A[1]);
      if (L < 0.05) continue;
      const n = [(B_[1] - A[1]) / L, -(B_[0] - A[0]) / L], ang = F.a + Math.atan2(n[1], n[0]);
      const sv = ['V', 'SV', 'S', 'SZ', 'Z', 'JZ', 'J', 'JV'][((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8];
      // soused: podíl délky hrany, kde těsně za ní stojí jiná budova (štítová zeď v řadové zástavbě – bez oken)
      let hit = 0; const ns = 7;
      for (let k = 0; k < ns; k++) {
        const u = (k + 0.5) / ns, [px, py] = F.xy(A[0] + (B_[0] - A[0]) * u + n[0] * 0.7, A[1] + (B_[1] - A[1]) * u + n[1] * 0.7);
        if ((M.okoli || []).some((q) => inPoly(px, py, q.p))) hit++;
      }
      out.push({ i, A, B: B_, L, n, divak: n[0] * kd[0] + n[1] * kd[1], sv, soused: hit / ns });
    }
    return out;
  };
  // střechy nad díly budovy z dat (prep rozdělí půdorys na obdélníky M.budovy[i].parts = [cx, cy, úhel, délka, šířka]);
  // o.h = okap nad M.g (výchozí podle dat), o.v = výška střechy, o.typ 'valba' | 'sedlo' (výchozí podle dat), o.presah
  K.strechaZDat = (i, col, o = {}) => {
    const b = M.budovy[i]; if (!b) return;
    const h = o.h ?? (b.e - M.g), v = o.v ?? (b.rh || 3), typ = o.typ || (b.r === 'hipped' ? 'valba' : 'sedlo');
    if (!b.parts || !b.parts.length || b.r === 'flat') { K.deska(K.svet, b.p, h, col, { buf: 'R' }); return; }
    for (const [cx, cy, a, pl, pw] of b.parts) {
      const G = frame(cx, cy, M.g, a);
      K.sedlo(G, -pl / 2, pl / 2, -pw / 2, pw / 2, h, v, col, { valba: typ === 'valba', presah: o.presah ?? 0.35, stit: o.stit || b.wc, ...o.dalsi });
    }
  };

  // ---------- svislé profily (štíty, atiky, desky) ----------
  // profil [[u, h], ...] ve svislé rovině zdi A -> B (u = vzdálenost od A), vytažený do tloušťky tl ven (vnějšek = vpravo od A -> B)
  K.profil = (F, A, B_, prof, tl, col, o = {}) => {
    const L = Math.hypot(B_[0] - A[0], B_[1] - A[1]), d = [(B_[0] - A[0]) / L, (B_[1] - A[1]) / L], nrm = [d[1], -d[0]];
    const o0 = o.od ?? 0, P = (u, h, k) => [A[0] + d[0] * u + nrm[0] * k, A[1] + d[1] * u + nrm[1] * k, h];
    const pts = prof.map(([u, h]) => new THREE.Vector2(u, h)), tris = THREE.ShapeUtils.triangulateShape(pts, []);
    for (const k of [o0, o0 + tl]) for (const [i, j, m] of tris) K.tri(o.buf, F, P(...prof[i], k), P(...prof[j], k), P(...prof[m], k), col, o.aw);
    for (let i = 0; i < prof.length; i++) {
      const [u0, h0] = prof[i], [u1, h1] = prof[(i + 1) % prof.length];
      K.quad(o.buf, F, P(u0, h0, o0), P(u1, h1, o0), P(u1, h1, o0 + tl), P(u0, h0, o0 + tl), o.bok ? o.bok : K.sv(col, 0.92), o.aw);
    }
  };
  // štít nad zdí A -> B od výšky h: 'troj' (trojúhelník, v = výška), 'stupne' (o.n stupňů), 'vlna' (volutový barokní), 'pul' (segment)
  K.stit = (F, A, B_, h, v, col, tvar = 'troj', o = {}) => {
    const L = Math.hypot(B_[0] - A[0], B_[1] - A[1]); let p;
    // obrys štítu zleva (0, h) nahoru a doprava dolů (L, h); profil se uzavře podél základny
    if (tvar === 'troj') p = [[0, h], [L / 2, h + v], [L, h]];
    else if (tvar === 'stupne') {
      const n = o.n || 4, hl = L / 2; p = [[0, h]];
      for (let i = 0; i < n; i++) { const z = h + v * (i + 1) / n; p.push([hl * i / n, z], [hl * (i + 1) / n, z]); }
      for (let i = n - 1; i >= 0; i--) { const z = h + v * (i + 1) / n; if (i < n - 1) p.push([L - hl * (i + 1) / n, z]); p.push([L - hl * i / n, z]); }
      p.push([L, h]);
      p = p.filter((q, i) => i === 0 || Math.abs(q[0] - p[i - 1][0]) + Math.abs(q[1] - p[i - 1][1]) > 1e-6);
    } else if (tvar === 'pul') {
      p = []; for (let i = 0; i <= 12; i++) { const a = Math.PI * (1 - i / 12); p.push([L / 2 + Math.cos(a) * L / 2, h + Math.sin(a) * v]); }
    } else {                                                     // vlna: volutové boky a nástavec nahoře
      const k = [[0, 0], [0.08, 0.05], [0.12, 0.25], [0.2, 0.32], [0.26, 0.5], [0.33, 0.58], [0.36, 0.82], [0.42, 0.88], [0.45, 1]];
      p = [...k.map(([u, z]) => [u * L, h + z * v]), ...k.slice().reverse().map(([u, z]) => [L - u * L, h + z * v])];
    }
    K.profil(F, A, B_, p, o.tl ?? 0.5, col, { od: o.od ?? -0.25, ...o });
    if (o.rimsa !== false) K.lem(F, A, B_, p, o.lem || K.sv(col, 1.08), 0.18, (o.tl ?? 0.5) + 0.2, (o.od ?? -0.25) - 0.1);
  };
  // lem (římsa) po lomené čáře profilu [[u, h], ...] na zdi A -> B
  K.lem = (F, A, B_, prof, col, tl = 0.18, hl = 0.7, od = -0.1) => {
    const L = Math.hypot(B_[0] - A[0], B_[1] - A[1]), d = [(B_[0] - A[0]) / L, (B_[1] - A[1]) / L], nrm = [d[1], -d[0]];
    const P = (u, h, k) => [A[0] + d[0] * u + nrm[0] * k, A[1] + d[1] * u + nrm[1] * k, h];
    for (let i = 0; i + 1 < prof.length; i++) {
      const [u0, h0] = prof[i], [u1, h1] = prof[i + 1];
      K.quad('X', F, P(u0, h0, od), P(u1, h1, od), P(u1, h1 + tl, od), P(u0, h0 + tl, od), col);
      K.quad('X', F, P(u0, h0 + tl, od), P(u1, h1 + tl, od), P(u1, h1 + tl, od + hl), P(u0, h0 + tl, od + hl), col);
      K.quad('X', F, P(u0, h0, od + hl), P(u1, h1, od + hl), P(u1, h1 + tl, od + hl), P(u0, h0 + tl, od + hl), K.sv(col, 0.9));
    }
  };

  // ---------- okna, dveře, římsy ----------
  // okna na zdi A -> B (vnějšek vpravo). o.rady = [[h0, h1], ...] spodek/vršek okna v každém patře; o.rozestup (m) nebo o.pocet;
  // o.sirka; o.okraj (od konců zdi); o.oblouk: 0 | 'pul' | 'seg' | 'lom'; o.sklo, o.ram (šambrána, null = bez), o.ramS (šířka rámu);
  // o.parapet (true), o.vynech = [indexy oken], o.od (odsazení od zdi), o.sviti (podíl rozsvícených v noci, 0.35)
  K.okna = (F, A, B_, o = {}) => {
    const L = Math.hypot(B_[0] - A[0], B_[1] - A[1]), d = [(B_[0] - A[0]) / L, (B_[1] - A[1]) / L], nrm = [d[1], -d[0]];
    const w = o.sirka ?? 1.2, okr = o.okraj ?? 1.0, od = o.od ?? 0.04;
    let n = o.pocet ?? Math.max(1, Math.floor((L - 2 * okr + (o.rozestup ?? 2.8) - w) / (o.rozestup ?? 2.8)));
    const sp = n > 1 ? (o.rozestup && !o.pocet ? o.rozestup : (L - 2 * okr - w) / (n - 1)) : 0;
    const u0 = n > 1 ? (L - sp * (n - 1)) / 2 : L / 2;
    const P = (u, h, k) => [A[0] + d[0] * u + nrm[0] * k, A[1] + d[1] * u + nrm[1] * k, h];
    const SK = c(o.sklo || K.C.sklo), RM = o.ram === null ? null : c(o.ram || K.C.bila), rs = o.ramS ?? 0.16, sv = o.sviti ?? 0.35;
    (o.rady || [[1.0, 2.6]]).forEach(([h0, h1], ri) => {
      for (let i = 0; i < n; i++) {
        if (o.vynech && o.vynech.includes(i)) continue;
        const u = (o.pozice ? o.pozice[i] : u0 + i * sp), a = u - w / 2, b = u + w / 2;
        const glow = hash(F.x + u * 3.1 + ri * 7.7, F.y + h0) < sv ? 0.55 : 0, awg = [glow, 1, 0, 0];
        K.quad('X', F, P(a, h0, od), P(b, h0, od), P(b, h1, od), P(a, h1, od), SK, awg);
        let top = h1;
        if (o.oblouk) {                                                        // záklenek
          const rv = o.oblouk === 'seg' ? w * 0.22 : o.oblouk === 'lom' ? w * 0.85 : w / 2, m = 8;
          for (let k = 0; k < m; k++) {
            const t0 = k / m, t1 = (k + 1) / m;
            const f = (t) => o.oblouk === 'lom' ? (t < 0.5 ? Math.pow(t * 2, 0.6) : Math.pow((1 - t) * 2, 0.6)) : Math.sin(Math.PI * t);
            K.tri('X', F, P(u, h1, od), P(a + w * t0, h1 + rv * f(t0), od), P(a + w * t1, h1 + rv * f(t1), od), SK, awg);
          }
          top = h1 + rv;
        }
        if (RM) {                                                              // šambrána a parapet
          K.quad('X', F, P(a - rs, h0 - rs, od + 0.03), P(a, h0 - rs, od + 0.03), P(a, top, od + 0.03), P(a - rs, top, od + 0.03), RM);
          K.quad('X', F, P(b, h0 - rs, od + 0.03), P(b + rs, h0 - rs, od + 0.03), P(b + rs, top, od + 0.03), P(b, top, od + 0.03), RM);
          if (!o.oblouk) K.quad('X', F, P(a - rs, h1, od + 0.03), P(b + rs, h1, od + 0.03), P(b + rs, h1 + rs, od + 0.03), P(a - rs, h1 + rs, od + 0.03), RM);
          else K.quad('X', F, P(u - rs, top, od + 0.03), P(u + rs, top, od + 0.03), P(u + rs, top + rs * 1.5, od + 0.03), P(u - rs, top + rs * 1.5, od + 0.03), RM);   // klenák
        }
        if (o.parapet !== false) K.box(F.sub(...P(u, 0, 0).slice(0, 2), Math.atan2(d[1], d[0])), -w / 2 - 0.1, w / 2 + 0.1, -(0.14 + od), 0.02, h0 - 0.16, h0, RM || K.C.bila);
        if (o.pricle) {                                                        // okenní kříž
          const pc = c(o.pricle === true ? (RM || K.C.bila) : o.pricle), zz = h0 + (h1 - h0) * 0.62;
          K.quad('X', F, P(u - 0.05, h0, od + 0.01), P(u + 0.05, h0, od + 0.01), P(u + 0.05, top, od + 0.01), P(u - 0.05, top, od + 0.01), pc);
          K.quad('X', F, P(a, zz - 0.05, od + 0.01), P(b, zz - 0.05, od + 0.01), P(b, zz + 0.05, od + 0.01), P(a, zz + 0.05, od + 0.01), pc);
        }
      }
    });
  };
  // dveře / portál na zdi A -> B ve vzdálenosti u od A
  K.dvere = (F, A, B_, u, w, v, o = {}) => {
    K.okna(F, A, B_, { pozice: [u], pocet: 1, sirka: w, rady: [[o.h0 ?? 0, v]], oblouk: o.oblouk, sklo: o.barva || K.C.dvere, ram: o.ram ?? K.C.piskovec, ramS: o.ramS ?? 0.35, parapet: false, sviti: 0, od: o.od });
  };
  // vodorovná římsa / kordon kolem polygonu (v rámci F) ve výšce h: výška v, přesah p
  K.rimsa = (F, P, h, v, p, col, o = {}) => {
    const A = K.ccw(P), Bp = K.odsad(A, p), n = A.length, C = c(col), D = K.sv(col, 0.82);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      K.quad('X', F, [...Bp[i], h], [...Bp[j], h], [...Bp[j], h + v], [...Bp[i], h + v], C);
      K.quad('X', F, [...A[i], h + v], [...A[j], h + v], [...Bp[j], h + v], [...Bp[i], h + v], o.top ? c(o.top) : C);
      K.quad('X', F, [...A[i], h], [...A[j], h], [...Bp[j], h], [...Bp[i], h], D);
    }
  };
  // vodorovné pásy (bosáž, rustika) na zdi: jen tmavší linky po výšce
  K.pasy = (F, A, B_, h0, h1, krok, col, o = {}) => {
    const L = Math.hypot(B_[0] - A[0], B_[1] - A[1]), d = [(B_[0] - A[0]) / L, (B_[1] - A[1]) / L], nrm = [d[1], -d[0]], od = o.od ?? 0.03;
    const P = (u, h) => [A[0] + d[0] * u + nrm[0] * od, A[1] + d[1] * u + nrm[1] * od, h];
    for (let h = h0 + krok; h < h1 - 0.01; h += krok) K.quad('X', F, P(0, h - 0.06), P(L, h - 0.06), P(L, h + 0.06), P(0, h + 0.06), col);
  };
  // pilastry / lizény na zdi A -> B: pozice [u...], šířka w, výstupek k
  K.pilastry = (F, A, B_, pozice, w, k, h0, h1, col) => {
    const ang = Math.atan2(B_[1] - A[1], B_[0] - A[0]);
    for (const u of pozice) { const G = F.sub(A[0] + Math.cos(ang) * u, A[1] + Math.sin(ang) * u, ang); K.box(G, -w / 2, w / 2, -k, 0.02, h0, h1, col); }
  };

  // ---------- střechy nad obdélníkem s0..s1 × t0..t1 (v rámci F), okap ve výšce h, výška střechy v ----------
  // o.osa 's' (hřeben podél s) | 't'; o.valba [k0, k1] = délka valby na koncích (0 = štít, true = polovina šířky); o.presah;
  // o.stit = barva štítové zdi (jinak barva o.zed nebo omítka); o.tasky (řady tašek, výchozí true pro tašky/břidlici)
  K.sedlo = (F, s0, s1, t0, t1, h, v, col, o = {}) => {
    if ((o.osa || 's') === 't') { const G = F.sub((s0 + s1) / 2, (t0 + t1) / 2, Math.PI / 2); const hl = (s1 - s0) / 2, hw = (t1 - t0) / 2; return K.sedlo(G, -hw, hw, -hl, hl, h, v, col, { ...o, osa: 's' }); }
    const p = o.presah ?? 0.4, tm = (t0 + t1) / 2, hw = (t1 - t0) / 2;
    let [k0, k1] = o.valba === true ? [hw, hw] : o.valba || [0, 0];
    if (k0 === true) k0 = hw; if (k1 === true) k1 = hw;
    const S0 = s0 - p, S1 = s1 + p, T0 = t0 - p, T1 = t1 + p, hE = h - p * v / hw, top = h + v;
    const aw = o.tasky === false ? AWR : [1, F.P(0, 0, top)[1], F.P(0, 0, hE)[1], 0];
    const r0 = s0 + k0, r1 = s1 - k1;
    K.quad('R', F, [S0, T0, hE], [S1, T0, hE], [r1, tm, top], [r0, tm, top], col, aw);
    K.quad('R', F, [S1, T1, hE], [S0, T1, hE], [r0, tm, top], [r1, tm, top], col, aw);
    for (const [S, k, r_] of [[S0, k0, r0], [S1, k1, r1]]) {
      if (k > 0) K.tri('R', F, [S, T0, hE], [S, T1, hE], [r_, tm, top], col, aw);
      else if (o.stit !== false) {
        const sc = o.stit || o.zed || K.C.omitka, ss = S === S0 ? s0 : s1;
        K.tri('X', F, [ss, t0, h], [ss, t1, h], [ss, tm, top - (p > 0 ? 0.15 : 0)], sc);
      }
    }
  };
  K.valba = (F, s0, s1, t0, t1, h, v, col, o = {}) => K.sedlo(F, s0, s1, t0, t1, h, v, col, { valba: true, ...o });
  // mansardová: spodní strmá část (výška v1, odsazení k dovnitř), nad ní nízká valba (v2)
  K.mansarda = (F, s0, s1, t0, t1, h, v1, k, v2, col, o = {}) => {
    const p = o.presah ?? 0.3, aw = [1, F.P(0, 0, h + v1 + v2)[1], F.P(0, 0, h)[1], 0];
    const A = [[s0 - p, t0 - p], [s1 + p, t0 - p], [s1 + p, t1 + p], [s0 - p, t1 + p]], I = [[s0 + k, t0 + k], [s1 - k, t0 + k], [s1 - k, t1 - k], [s0 + k, t1 - k]];
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; K.quad('R', F, [...A[i], h], [...A[j], h], [...I[j], h + v1], [...I[i], h + v1], col, aw); }
    K.valba(F, s0 + k, s1 - k, t0 + k, t1 - k, h + v1, v2, o.horni || col, { presah: 0.05, ...o.hornio });
  };
  // jehlan / komolý jehlan / kužel s n stranami, střed (s, t), poloměr r0 dole, r1 nahoře (0 = špička)
  K.jehlan = (F, s, t, r0, r1, h0, h1, n, col, o = {}) => {
    const G = F.sub(s, t, 0), rot = o.rot ?? (n === 4 ? Math.PI / 4 : 0), B = o.buf || 'R';
    for (let i = 0; i < n; i++) {
      const a0 = rot + i / n * Math.PI * 2, a1 = rot + (i + 1) / n * Math.PI * 2, P = (rr, a, h) => [Math.cos(a) * rr, Math.sin(a) * rr, h];
      if (r1 > 0.001) K.quad(B, G, P(r0, a0, h0), P(r0, a1, h0), P(r1, a1, h1), P(r1, a0, h1), col, o.aw);
      else K.tri(B, G, P(r0, a0, h0), P(r0, a1, h0), [0, 0, h1], col, o.aw);
    }
    if (o.vicko) K.deska(G, Array.from({ length: n }, (_, i) => [Math.cos(rot + i / n * Math.PI * 2) * r1, Math.sin(rot + i / n * Math.PI * 2) * r1]), h1, o.vicko === true ? col : o.vicko, { buf: B });
  };
  K.valec = (F, s, t, r, h0, h1, n, col, o = {}) => K.jehlan(F, s, t, r, r, h0, h1, n, col, { buf: 'X', vicko: true, ...o });
  // rotační těleso: profil [[r, h], ...] zdola nahoru (h relativně k h0), n segmentů – báně, kupole, cibule, makovice
  K.rotace = (F, s, t, h0, prof, n, col, o = {}) => {
    for (let k = 0; k + 1 < prof.length; k++) K.jehlan(F, s, t, prof[k][0], prof[k + 1][0], h0 + prof[k][1], h0 + prof[k + 1][1], n, col, { rot: 0, ...o });
  };
  K.kupole = (F, s, t, r, h0, v, col, o = {}) => {
    const m = o.m ?? 6, prof = [];
    for (let i = 0; i <= m; i++) { const a = i / m * Math.PI / 2; prof.push([r * Math.cos(a), v * Math.sin(a)]); }
    K.rotace(F, s, t, h0, prof, o.n ?? 12, col, o);
  };
  // barokní báň (cibule) s lucernou a špicí; r = poloměr spodku, v = celková výška
  K.cibule = (F, s, t, r, h0, v, col, o = {}) => {
    const prof = [[1, 0], [1.02, 0.08], [0.78, 0.2], [0.45, 0.28], [0.38, 0.32], [0.38, 0.44], [0.6, 0.5], [0.66, 0.56], [0.55, 0.64], [0.25, 0.72], [0.16, 0.8], [0.04, 1.0]];
    K.rotace(F, s, t, h0, prof.map(([a, b]) => [a * r, b * v]), o.n ?? 8, col, o);
    if (o.lucerna) K.valec(F, s, t, r * 0.36, h0 + v * 0.32, h0 + v * 0.44, o.n ?? 8, o.lucerna);
  };
  // kříž, makovice, korouhev
  K.kriz = (F, s, t, h, v, col = K.C.zlato) => {
    const G = F.sub(s, t, 0); K.box(G, -0.07, 0.07, -0.07, 0.07, h, h + v, col); K.box(G, -0.07, 0.07, -v * 0.3, v * 0.3, h + v * 0.62, h + v * 0.74, col);
  };
  K.koule = (F, s, t, h, r, col = K.C.zlato) => K.rotace(F, s, t, h, [[0.01, 0], [r * 0.7, r * 0.3], [r, r], [r * 0.7, r * 1.7], [0.01, r * 2]], 8, col, { buf: 'X' });

  // ---------- věže, sloupy, zábradlí, hodiny ----------
  // hranolová věž: střed (s, t), šířka w (a hloubka d), od h0 do h1; o.okna = {rady, sirka, oblouk}; o.rimsa = barva římsy nahoře
  K.vez = (F, s, t, w, d, h0, h1, col, o = {}) => {
    const G = F.sub(s, t, o.rot || 0), hw = w / 2, hd = d / 2;
    const P = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
    if (o.st !== undefined) K.hranol(G, P, h0, h1, col, { st: o.st, vicko: o.vicko ?? col });
    else K.box(G, -hw, hw, -hd, hd, h0, h1, col);
    if (o.okna) for (let i = 0; i < 4; i++) K.okna(G, P[i], P[(i + 1) % 4], { pocet: 1, sirka: Math.min(w, d) * 0.35, ...o.okna });
    if (o.rimsa) K.rimsa(G, P, h1 - 0.5, 0.5, 0.3, o.rimsa);
    return G;
  };
  // řada sloupů na úsečce A -> B (n sloupů včetně krajních), poloměr r, hlavice a patka
  K.sloupy = (F, A, B_, n, h0, h1, r, col, o = {}) => {
    for (let i = 0; i < n; i++) {
      const k = n > 1 ? i / (n - 1) : 0.5, s = A[0] + (B_[0] - A[0]) * k, t = A[1] + (B_[1] - A[1]) * k;
      K.valec(F, s, t, r, h0 + 0.3, h1 - 0.35, o.n ?? 8, col);
      K.box(F.sub(s, t), -r * 1.4, r * 1.4, -r * 1.4, r * 1.4, h0, h0 + 0.3, o.patka || col);
      K.box(F.sub(s, t), -r * 1.5, r * 1.5, -r * 1.5, r * 1.5, h1 - 0.35, h1, o.hlavice || col);
    }
  };
  // balustráda / zábradlí na úsečce A -> B: madlo ve výšce h + v, kuželky po krok
  K.balustrada = (F, A, B_, h, v, col, o = {}) => {
    const L = Math.hypot(B_[0] - A[0], B_[1] - A[1]), ang = Math.atan2(B_[1] - A[1], B_[0] - A[0]), G = F.sub(A[0], A[1], ang), krok = o.krok ?? 0.4;
    K.box(G, 0, L, -0.14, 0.14, h + v - 0.14, h + v, col);
    if (o.sokl !== false) K.box(G, 0, L, -0.12, 0.12, h, h + 0.12, col);
    for (let u = krok / 2; u < L; u += krok) K.box(G, u - 0.06, u + 0.06, -0.06, 0.06, h, h + v - 0.14, col);
  };
  // ciferník na zdi A -> B (vnějšek vpravo) v místě u, střed ve výšce h, poloměr r
  K.hodiny = (F, A, B_, u, h, r, o = {}) => {
    const L = Math.hypot(B_[0] - A[0], B_[1] - A[1]), d = [(B_[0] - A[0]) / L, (B_[1] - A[1]) / L], nrm = [d[1], -d[0]], od = o.od ?? 0.08;
    const P = (x, z, k) => [A[0] + d[0] * (u + x) + nrm[0] * k, A[1] + d[1] * (u + x) + nrm[1] * k, h + z];
    const N = 16, DIAL = c(o.cifernik || '#f1ecdc'), RIM = c(o.ram || K.C.zlato), HAND = c('#1f1c19');
    for (let i = 0; i < N; i++) {
      const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2;
      K.tri('X', F, P(0, 0, od), P(Math.cos(a0) * r, Math.sin(a0) * r, od), P(Math.cos(a1) * r, Math.sin(a1) * r, od), DIAL, [0.5, 1, 0, 0]);
      K.quad('X', F, P(Math.cos(a0) * r, Math.sin(a0) * r, od + 0.01), P(Math.cos(a1) * r, Math.sin(a1) * r, od + 0.01), P(Math.cos(a1) * r * 1.15, Math.sin(a1) * r * 1.15, od + 0.01), P(Math.cos(a0) * r * 1.15, Math.sin(a0) * r * 1.15, od + 0.01), RIM);
    }
    K.quad('X', F, P(-0.05, 0, od + 0.03), P(0.05, 0, od + 0.03), P(0.05, r * 0.8, od + 0.03), P(-0.05, r * 0.8, od + 0.03), HAND);
    K.quad('X', F, P(0, -0.05, od + 0.03), P(r * 0.55, -0.05, od + 0.03), P(r * 0.55, 0.05, od + 0.03), P(0, 0.05, od + 0.03), HAND);
  };
  // vikýř na střeše: střed (s, t) v rámci F, šířka w, hloubka d, spodek h, výška čela v, natočení a (čelo kolmo k ose +t po natočení)
  K.vikyr = (F, s, t, a, w, d, h, v, zed, strecha, o = {}) => {
    const G = F.sub(s, t, a);
    K.box(G, -w / 2, w / 2, -d, 0, h, h + v, zed);
    K.okna(G, [w / 2, 0], [-w / 2, 0], { pocet: 1, sirka: w * 0.55, rady: [[h + 0.25, h + v - 0.2]], ram: o.ram, parapet: false });
    K.sedlo(G, -w / 2, w / 2, -d - 0.2, 0.25, h + v, Math.min(1.4, w * 0.45), strecha, { osa: 't', presah: 0.15, stit: zed });
  };
  // jednoduchá socha (postava) – stylizovaná, výška v
  K.socha = (F, s, t, h, v, col, o = {}) => {
    const G = F.sub(s, t, o.a || 0), k = v / 1.8;
    K.jehlan(G, 0, 0, 0.28 * k, 0.18 * k, h, h + 0.9 * k, 6, col, { buf: 'X' });          // šat
    K.box(G, -0.17 * k, 0.17 * k, -0.11 * k, 0.11 * k, h + 0.9 * k, h + 1.45 * k, col);     // trup
    K.box(G, -0.1 * k, 0.1 * k, -0.1 * k, 0.1 * k, h + 1.45 * k, h + 1.75 * k, col);        // hlava
    if (o.ruka) K.box(G, 0.15 * k, 0.45 * k, -0.06 * k, 0.06 * k, h + 1.25 * k, h + 1.35 * k, col);
    if (o.svatozar) K.box(G, -0.16 * k, 0.16 * k, -0.02, 0.02, h + 1.55 * k, h + 1.85 * k, o.svatozar);
  };
  // schody: od hrany s0 (dole) k s1 (nahoře) v šířce t0..t1, z h0 do h1, n stupňů
  K.schody = (F, s0, s1, t0, t1, h0, h1, n, col) => {
    for (let i = 0; i < n; i++) { const k0 = i / n, k1 = (i + 1) / n; K.box(F, s0 + (s1 - s0) * k0, s1, t0, t1, h0, h0 + (h1 - h0) * k1, col); }
  };
  // ---------- stromy mapy (pixelové sprity se sezónními barvami a stíny – památné stromy) ----------
  // K.strom(F, s, t, vyska, jehlicnan) přidá strom do stromů mapy (scene.trees: [x, y, z, výška, jehličnan, druh]); sprite má strop ~25 m.
  // K.stromyPryc(F, s, t, r) odebere obecné stromy do r metrů (ať památný strom nestojí v jiném). Funguje jen v render.html.
  K.strom = (F, s, t, vyska, jehlicnan = false) => {
    if (!H.stromy) return; const [x, y] = F.xy(s, t); H.stromy.push([x, y, H.vyska(x, y), Math.min(25, vyska), jehlicnan ? 1 : 0, 0]);
  };
  K.stromyPryc = (F, s, t, r) => {
    if (!H.stromy) return 0; const [x, y] = F.xy(s, t); let n = 0;
    for (let i = H.stromy.length - 1; i >= 0; i--) { const q = H.stromy[i]; if (Math.hypot(q[0] - x, q[1] - y) < r) { H.stromy.splice(i, 1); n++; } }
    return n;
  };
  return K;
}

// Doplněk „Letiště“: ilustrační provoz malých letadel na travnatém letišti (assets/doplnky/letiste.json).
// Letadla stojí na stáních, po řadě pojíždějí na práh aktivní dráhy, vzlétnou, obletí okruh (levý nebo pravý podle
// "aktivni.okruh") a přistanou; An-2 stoupá v kruzích nad místem seskoků ("dz") a vysadí parašutisty. Jen ve dne,
// v zimě (travnaté letiště se obvykle neodklízí) létá nejvýš jedno letadlo. Výška okruhu je kvůli čitelnosti mapy snížená
// (výchozí ~110 m), délky okruhu a rychlosti odpovídají malým letadlům. Kreslí se jako vozidla mapy: kvádry stínované
// sluncem od jihovýchodu, obrys 1 px, cache podle druhu a směru (48 směrů).
(() => {
  const ID = 'letiste';
  const Izomapa = window.Izomapa;
  if (!Izomapa) return;
  let unsub = null;

  const TYPY = {
    c172: { len: 8.2, span: 11.0, V: 33, D: 620, H: 1.0, col: [236, 238, 236], str: [196, 44, 40], high: 1 },
    ul:   { len: 6.4, span: 9.0, V: 27, D: 520, H: 0.86, col: [240, 240, 236], str: [36, 92, 176], high: 0 },
    an2:  { len: 12.7, span: 18.2, V: 40, D: 900, H: 1.36, col: [178, 184, 180], str: [214, 64, 40], high: 2 },
  };
  const CHUTE = ['#d8352a', '#2f6fd1', '#f2c230', '#2aa36b', '#e0629a', '#f07a24', '#7b4fc9'];
  const NDIR = 48;
  const SUNV = (() => { const v = [0.38, -0.68, 0.62], n = Math.hypot(...v); return v.map((q) => q / n); })();
  const lit = (rgb, d) => { const f = (0.62 + 0.42 * Math.max(0, d)) / 0.88; return `rgb(${rgb.map((q) => Math.min(255, Math.round(q * f))).join(',')})`; };
  const rnd = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  Izomapa.registerPlugin(ID, {
    onInit(api) {
      const D = api.getPluginData(ID);
      if (!D) return;
      const W = (q) => api.latLonToWorld(q[0], q[1]);
      const toImg = api.toImg, gz = api.gz;
      const akt = D.aktivni || {};
      const rwd = D.drahy.find((r) => r.ref === akt.draha) || D.drahy[0];
      const A = W(akt.od === 'b' ? rwd.b : rwd.a), B = W(akt.od === 'b' ? rwd.a : rwd.b), RL = Math.hypot(B[0] - A[0], B[1] - A[1]);
      const u = [(B[0] - A[0]) / RL, (B[1] - A[1]) / RL], side = akt.okruh === 'pravy' ? -1 : 1, n = [-u[1] * side, u[0] * side];
      const HK = (D.vyska_okruhu || 110);
      const stani = D.stani.map(W), dz = D.dz ? W(D.dz) : null;
      const P = (s, t, z, v, ev) => [A[0] + u[0] * s + n[0] * t, A[1] + u[1] * s + n[1] * t, z, v, ev || 0];
      const smooth = (pts, it = 3) => {                         // Chaikin: zaoblené zatáčky, po zemi rovně
        for (let k = 0; k < it; k++) {
          const o = [pts[0]];
          for (let i = 0; i < pts.length - 1; i++) {
            const a = pts[i], b = pts[i + 1];
            if (a[2] === 0 && b[2] === 0) { o.push(b); continue; }
            o.push(a.map((q, j) => (j === 4 ? 0 : q * 0.75 + b[j] * 0.25)), b.map((q, j) => (j === 4 ? b[4] : a[j] * 0.25 + q * 0.75)));
          }
          o.push(pts[pts.length - 1]); pts = o;
        }
        return pts;
      };
      function mission(st, ty) {
        const T = TYPY[ty], V = T.V, Dd = T.D, Hc = HK * T.H, td = 90 + rnd(st[0]) * 60;
        const out = [[st[0], st[1], 0, 8], [A[0] - u[0] * 10 + n[0] * 30, A[1] - u[1] * 10 + n[1] * 30, 0, 8], P(0, 0, 0, 3)];
        let air;
        if (ty === 'an2' && dz) {                                // stoupavé kruhy nad místem seskoků, výsadek, sestup na okruh
          air = [P(240, 0, 0, V * 0.8), P(330, 0, 8, V), P(RL + 200, 0, 70, V)];
          const R = 700, a0 = Math.atan2(A[1] + u[1] * (RL + 200) - dz[1], A[0] + u[0] * (RL + 200) - dz[0]);
          for (let k = 1; k <= 16; k++) { const a = a0 - side * k / 8 * Math.PI; air.push([dz[0] + Math.cos(a) * R, dz[1] + Math.sin(a) * R, 70 + 190 * Math.min(1, k / 12), V, 0]); }
          air.push([dz[0] - u[0] * 260, dz[1] - u[1] * 260, 260, V, 0], [dz[0], dz[1], 260, V, 1], [dz[0] + u[0] * 400, dz[1] + u[1] * 400, 255, V, 0]);
          air.push(P(RL + 300, Dd * 0.6, 200, V), P(RL * 0.4, Dd, Hc, V));
        } else air = [P(240, 0, 0, V * 0.8), P(320, 0, 6, V), P(RL + 150, 0, Hc * 0.6, V), P(RL + 380, Dd * 0.3, Hc * 0.85, V), P(RL + 420, Dd, Hc, V), P(RL * 0.5, Dd, Hc, V)];
        air.push(P(-420, Dd, Hc, V), P(-600, Dd * 0.75, Hc * 0.8, V * 0.9), P(-620, Dd * 0.15, Hc * 0.55, V * 0.85), P(-460, 0, Hc * 0.38, V * 0.8),
                 P(0, 0, 9, V * 0.75), P(td, 0, 0, V * 0.62), P(td + 300, 0, 0, 8), P(td + 320, 30, 0, 8));
        const pts = [...out, ...smooth(air), [st[0], st[1], 0, 8], [st[0] + u[0] * 2, st[1] + u[1] * 2, 0, 1]];
        const len = [0]; for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
        return { pts, len, L: len[len.length - 1] };
      }
      const fleet = D.letadla || [{ typ: 'c172', stani: 0 }, { typ: 'ul', stani: 1 }, { typ: 'an2', stani: 2 }, { typ: 'ul', stani: 3, leta: false }];
      const planes = fleet.map((f, i) => ({ ty: TYPY[f.typ] ? f.typ : 'c172', st: stani[(f.stani ?? i) % stani.length], fly: f.leta !== false,
        m: null, s: 0, wait: 15 + i * 40 + rnd(i + 9) * 30, i, hdg: [u[0], u[1]] }));
      let chutes = [], busy = 0;
      const SPR = new Map();
      function sprite(ty, k) {
        const key = ty + k; if (SPR.has(key)) return SPR.get(key);
        const T = TYPY[ty], a = k / NDIR * Math.PI * 2, fx = Math.cos(a), fy = Math.sin(a), sxv = -fy, syv = fx;
        const O = toImg(0, 0, 0), R = (s, t, h) => { const p = toImg(fx * s + sxv * t, fy * s + syv * t, h); return [p[0] - O[0], p[1] - O[1]]; };
        const faces = [], vis = (nx, ny) => nx + ny < 0, sun = (nx, ny, nz) => nx * SUNV[0] + ny * SUNV[1] + nz * SUNV[2];
        const box = (s0, s1, t0, t1, z0, z1, rgb) => {
          for (const [nx, ny, P0, P1] of [[fx, fy, [s1, t0], [s1, t1]], [-fx, -fy, [s0, t1], [s0, t0]], [sxv, syv, [s1, t1], [s0, t1]], [-sxv, -syv, [s0, t0], [s1, t0]]])
            if (vis(nx, ny)) faces.push([[R(P0[0], P0[1], z0), R(P1[0], P1[1], z0), R(P1[0], P1[1], z1), R(P0[0], P0[1], z1)], lit(rgb, sun(nx, ny, 0)), (z0 + z1) / 2]);
          faces.push([[R(s0, t0, z1), R(s1, t0, z1), R(s1, t1, z1), R(s0, t1, z1)], lit(rgb, sun(0, 0, 1)), z1]);
        };
            const l = T.len / 2, w = T.span / 2, C = T.col, S = T.str, GL = [64, 84, 108], DK = [44, 46, 50], PR = [70, 72, 76];
        if (ty === 'an2') {
          // An-2 „Andula“: dvouplošník, horní křídlo 18,2 m, dolní 14,2 m, hvězdicový motor v kulatém krytu, záďové kolo, vysoká kýlovka
          box(l - 2.3, l - 1.9, -1.55, -1.25, 0, 0.75, DK); box(l - 2.3, l - 1.9, 1.25, 1.55, 0, 0.75, DK);   // hlavní podvozek
          box(l - 2.4, l - 1.8, -1.4, -1.0, 0.7, 1.2, DK); box(l - 2.4, l - 1.8, 1.0, 1.4, 0.7, 1.2, DK);
          box(-l + 0.3, -l + 0.6, -0.1, 0.1, 0, 0.5, DK);                                          // záďové kolo
          box(-l + 0.6, -l + 4.5, -0.45, 0.45, 0.9, 2.1, C);                                       // zúžená zadní část trupu
          box(-l + 4.5, l - 1.2, -0.85, 0.85, 0.75, 2.75, C);                                      // trup s kabinou pro parašutisty
          box(-l + 4.5, l - 1.2, -0.87, 0.87, 1.55, 1.75, S);                                      // pruh
          for (const s of [-1.5, -0.4, 0.7, 1.8]) for (const e of [-1, 1]) box(s, s + 0.55, e * 0.87 - 0.02, e * 0.87 + 0.02, 1.95, 2.35, GL);   // okénka
          box(l - 3.2, l - 1.6, -0.75, 0.75, 2.75, 3.15, GL);                                      // kokpit
          box(l - 1.2, l - 0.25, -0.95, 0.95, 0.85, 2.65, PR); box(l - 0.25, l, -0.7, 0.7, 1.05, 2.45, DK);   // kryt motoru + čelo
          box(l, l + 0.05, -1.7, 1.7, 1.7, 1.9, DK); box(l, l + 0.05, -0.1, 0.1, 0.9, 2.7, DK);   // vrtule
          box(l - 3.4, l - 1.0, -w, w, 3.75, 3.95, C);                                             // horní křídlo (18,2 m)
          box(l - 3.4, l - 2.9, -w, -w + 1.8, 3.77, 3.97, S); box(l - 3.4, l - 2.9, w - 1.8, w, 3.77, 3.97, S);
          box(l - 3.2, l - 1.2, -w * 0.78, w * 0.78, 0.8, 0.98, C);                               // dolní křídlo (14,2 m)
          for (const t of [-w * 0.55, w * 0.55]) { box(l - 2.9, l - 2.75, t - 0.05, t + 0.05, 0.98, 3.75, DK); box(l - 1.75, l - 1.6, t - 0.05, t + 0.05, 0.98, 3.75, DK); }   // vzpěry
          box(-l + 0.3, -l + 2.2, -3.6, 3.6, 2.0, 2.15, C);                                       // vodorovné ocasní plochy (7,2 m)
          box(-l + 0.2, -l + 2.0, -0.08, 0.08, 2.1, 4.6, C); box(-l + 0.2, -l + 1.0, -0.09, 0.09, 3.6, 4.6, S);   // vysoká kýlovka
        } else if (ty === 'c172') {
          // Cessna 172: hornoplošník se vzpěrami, příďový podvozek s kryty kol
          box(l - 0.8, l - 0.5, -0.09, 0.09, 0, 0.6, DK);                                          // příďové kolo
          for (const e of [-1, 1]) { box(-0.6, 0.2, e * 1.25 - 0.13, e * 1.25 + 0.13, 0, 0.5, C); box(-0.4, 0.0, e * 0.6, e * 1.2, 0.35, 0.5, DK); }   // kryty kol a podvozková pera
          box(-l, -l + 3.3, -0.35, 0.35, 0.95, 1.6, C);                                           // ocasní část trupu (zúžená)
          box(-l + 3.3, l - 1.0, -0.6, 0.6, 0.55, 1.75, C);                                       // trup a kabina
          box(-l + 3.3, l - 0.6, -0.62, 0.62, 0.95, 1.12, S);                                     // pruh
          for (const e of [-1, 1]) box(-0.6, 1.5, e * 0.62 - 0.02, e * 0.62 + 0.02, 1.2, 1.7, GL);   // boční okna
          box(1.4, 2.2, -0.55, 0.55, 1.4, 1.8, GL);                                               // čelní sklo
          box(l - 1.0, l, -0.45, 0.45, 0.7, 1.4, C); box(l, l + 0.05, -0.9, 0.9, 1.0, 1.1, DK);    // motor a vrtule
          box(-0.4, 1.2, -w, w, 1.8, 1.95, C);                                                     // křídlo nad kabinou (11 m)
          box(-0.4, 0.1, -w, -w + 0.7, 1.81, 1.96, S); box(-0.4, 0.1, w - 0.7, w, 1.81, 1.96, S);
          for (const e of [-1, 1]) box(0.3, 0.45, e * 0.65, e * 2.6, 0.8, 1.8, DK);               // vzpěry křídel
          box(-l, -l + 1.3, -1.7, 1.7, 1.25, 1.36, C);                                            // vodorovná ocasní plocha
          box(-l, -l + 1.4, -0.07, 0.07, 1.36, 2.7, C); box(-l + 0.6, -l + 1.4, -0.08, 0.08, 1.9, 2.1, S);   // šikmá kýlovka
        } else {
          // ultralight (dolnoplošník typu Bristell): bublinová kabina, příďový podvozek
          box(l - 0.7, l - 0.45, -0.08, 0.08, 0, 0.5, DK);
          for (const e of [-1, 1]) box(-0.3, 0.3, e * 1.0 - 0.1, e * 1.0 + 0.1, 0, 0.55, DK);
          box(-l, -l + 2.6, -0.3, 0.3, 0.75, 1.3, C);
          box(-l + 2.6, l - 0.8, -0.55, 0.55, 0.5, 1.3, C);
          box(-l + 2.6, l - 0.6, -0.57, 0.57, 0.75, 0.9, S);
          box(-0.6, 1.4, -0.5, 0.5, 1.3, 1.75, GL);                                              // bublinová kabina
          box(l - 0.8, l, -0.4, 0.4, 0.6, 1.2, C); box(l, l + 0.05, -0.8, 0.8, 0.85, 0.95, DK);
          box(-0.6, 0.9, -w, w, 0.55, 0.68, C);                                                  // dolní křídlo (9 m)
          box(-0.6, -0.2, -w, -w + 0.6, 0.56, 0.69, S); box(-0.6, -0.2, w - 0.6, w, 0.56, 0.69, S);
          box(-l, -l + 1.0, -1.4, 1.4, 1.1, 1.2, C);
          box(-l, -l + 1.1, -0.07, 0.07, 1.2, 2.3, S);
        }
    faces.sort((p, q) => p[2] - q[2]);
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (const [pts] of faces) for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
        x0 = Math.floor(x0) - 1; y0 = Math.floor(y0) - 1;
        const cw = Math.ceil(x1) - x0 + 2, chh = Math.ceil(y1) - y0 + 2, cv = document.createElement('canvas'); cv.width = cw; cv.height = chh;
        const g = cv.getContext('2d');
        for (const [pts, fill] of faces) { g.fillStyle = fill; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x - x0, y - y0) : g.moveTo(x - x0, y - y0))); g.closePath(); g.fill(); }
        const im = g.getImageData(0, 0, cw, chh), d = im.data, solid = new Uint8Array(cw * chh);   // ostré okraje a tmavý obrys jako vozidla
        for (let i = 0; i < cw * chh; i++) { solid[i] = d[i * 4 + 3] >= 110 ? 1 : 0; d[i * 4 + 3] = solid[i] ? 255 : 0; }
        for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) {
          const i = y * cw + x; if (solid[i]) continue;
          if ((x > 0 && solid[i - 1]) || (x < cw - 1 && solid[i + 1]) || (y > 0 && solid[i - cw]) || (y < chh - 1 && solid[i + cw])) d.set([27, 28, 34, 255], i * 4);
        }
        g.putImageData(im, 0, 0);
        const spr = { c: cv, x0, y0 }; SPR.set(key, spr); return spr;
      }
      const pose = (p) => {
        if (!p.m) return { x: p.st[0], y: p.st[1], z: 0, dx: p.hdg[0], dy: p.hdg[1] };
        const m = p.m; let i = 1; while (i < m.len.length - 1 && m.len[i] < p.s) i++;
        const a = m.pts[i - 1], b = m.pts[i], f = Math.max(0, Math.min(1, (p.s - m.len[i - 1]) / ((m.len[i] - m.len[i - 1]) || 1)));
        return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, z: a[2] + (b[2] - a[2]) * f, dx: b[0] - a[0], dy: b[1] - a[1], v: a[3] + (b[3] - a[3]) * f };
      };
      function step(dt, night, snowy, t) {
        for (const p of planes) {
          if (!p.m) {
            if (!p.fly || night > 0.45 || (snowy && p.ty !== 'c172')) continue;
            p.wait -= dt;
            if (p.wait > 0 || t < busy) continue;
            p.m = mission(p.st, p.ty); p.s = 0; busy = t + 45;               // dráhu drží 45 s, ať nestartují dva naráz
          }
          const prev = p.s, o = pose(p); p.s += Math.max(1, o.v) * dt;
          const m = p.m;
          for (let k = 1; k < m.pts.length; k++) if (m.pts[k][4] === 1 && prev < m.len[k] && p.s >= m.len[k]) {
            for (let j = 0; j < 6; j++) chutes.push({ x: m.pts[k][0] - u[0] * j * 25, y: m.pts[k][1] - u[1] * j * 25, z: m.pts[k][2], ff: 2 + j * 0.4 + rnd(t + j) * 2,
              tx: dz[0] + (rnd(j * 3 + t) - 0.5) * 60, ty: dz[1] + (rnd(j * 7 + t) - 0.5) * 60, col: CHUTE[(j + Math.floor(t)) % CHUTE.length], land: 0 });
          }
          if (p.s >= m.L) { p.m = null; p.wait = 60 + rnd(t + p.i) * 150; p.hdg = [u[0], u[1]]; }
        }
        for (const c of chutes) {
          if (c.land) { c.land += dt; continue; }
          c.ff -= dt; const vz = c.ff > 0 ? 45 : 4.5;
          c.z -= vz * dt;
          const d = Math.hypot(c.tx - c.x, c.ty - c.y) || 1, hv = c.ff > 0 ? 0 : Math.min(6, d / Math.max(1, c.z / vz));
          c.x += (c.tx - c.x) / d * hv * dt; c.y += (c.ty - c.y) / d * hv * dt;
          if (c.z <= 0) { c.z = 0; c.land = 0.01; }
        }
        chutes = chutes.filter((c) => c.land < 25);
      }
      unsub = api.onFrame((ctx, view, t) => {
        step(Math.min(0.1, view.dt || 0), view.night, view.snowy, t);
        if (view.sx <= 0.12) return;
        const { sx, ox, oy } = view;
        for (const aloft of [false, true]) for (const p of planes) {
          const o = pose(p); if ((o.z > 0.5) !== aloft) continue;
          const g = gz(o.x, o.y), [ix, iy] = toImg(o.x, o.y, g + o.z);
          if (!view.vis(ix, iy, 200)) continue;
          const k = ((Math.round(Math.atan2(o.dy, o.dx) / (Math.PI * 2) * NDIR) % NDIR) + NDIR) % NDIR, spr = sprite(p.ty, k);
          if (aloft) {                                                                 // stín na zemi (slunce od jihovýchodu), slábne s výškou
            const T = TYPY[p.ty], a = Math.max(0, 0.32 * (1 - o.z / 160));
            if (a > 0.02) {
              const sh = [-SUNV[0] / SUNV[2] * o.z, -SUNV[1] / SUNV[2] * o.z], L = Math.hypot(o.dx, o.dy) || 1, fx = o.dx / L, fy = o.dy / L;
              const Q = (s, tt) => { const x = o.x + sh[0] + fx * s - fy * tt, y = o.y + sh[1] + fy * s + fx * tt, q = toImg(x, y, gz(x, y)); return [ox + q[0] * sx, oy + q[1] * sx]; };
              ctx.fillStyle = `rgba(20,26,30,${a.toFixed(2)})`;
              for (const r of [[-T.len / 2, T.len / 2, -0.6, 0.6], [0, 1.6, -T.span / 2, T.span / 2], [-T.len / 2, -T.len / 2 + 1, -1.9, 1.9]]) {
                ctx.beginPath(); [Q(r[0], r[2]), Q(r[1], r[2]), Q(r[1], r[3]), Q(r[0], r[3])].forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.fill();
              }
            }
          }
          ctx.drawImage(spr.c, Math.round(ox + (ix + spr.x0) * sx), Math.round(oy + (iy + spr.y0) * sx), Math.round(spr.c.width * sx), Math.round(spr.c.height * sx));
        }
        for (const c of chutes) {                                                      // parašutisté: kluzákový padák a postava
          const [ix, iy] = toImg(c.x, c.y, gz(c.x, c.y) + c.z);
          if (!view.vis(ix, iy, 40)) continue;
          const q = Math.max(1, Math.round(sx * 1.6)), X = Math.round(ox + ix * sx), Y = Math.round(oy + iy * sx);
          ctx.fillStyle = '#2a2c31'; ctx.fillRect(X - q / 2, Y - 2 * q, q, 2 * q);
          if (c.ff <= 0 && !c.land) {
            ctx.fillStyle = c.col; ctx.fillRect(X - 4 * q, Y - 7 * q, 8 * q, 2 * q);
            ctx.fillStyle = 'rgba(40,40,44,.6)'; ctx.fillRect(X - 3 * q, Y - 5 * q, q / 2, 3 * q); ctx.fillRect(X + 3 * q, Y - 5 * q, q / 2, 3 * q);
          } else if (c.land) { ctx.fillStyle = c.col; ctx.fillRect(X + q, Y - q, 5 * q, q); }   // složený padák na zemi
        }
      }, { layer: 'world' });
    },
    onDestroy() { if (unsub) unsub(); },
  });
})();

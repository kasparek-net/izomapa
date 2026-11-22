  // ---------- souřadnice ----------
  const cam = OV.cam;
  const X = cam.X, Y = cam.Y, Z = [X[1] * Y[2] - X[2] * Y[1], X[2] * Y[0] - X[0] * Y[2], X[0] * Y[1] - X[1] * Y[0]];
  const toImg = (x, y, h) => [((x * X[0] + h * X[1] - y * X[2]) - cam.x0) / cam.mpp, (cam.y1 - (x * Y[0] + h * Y[1] - y * Y[2])) / cam.mpp];
  const depth = (x, y, h) => -(x * Z[0] + h * Z[1] - y * Z[2]);
  const gz = (x, y) => {
    const G = cam.grounds.find((q) => Math.abs(x - q.cx) <= cam.half && Math.abs(y - q.cy) <= cam.half) || cam.grounds[0];
    const g = G.g, n = g.length - 1; x -= G.cx; y -= G.cy;
    const fx = Math.min(Math.max((x + cam.half) / (2 * cam.half) * n, 0), n - 0.001), fy = Math.min(Math.max((cam.half - y) / (2 * cam.half) * n, 0), n - 0.001);
    const c = Math.floor(fx), r = Math.floor(fy), tx = fx - c, ty = fy - r;
    return g[r][c] * (1 - tx) * (1 - ty) + g[r][c + 1] * tx * (1 - ty) + g[r + 1][c] * (1 - tx) * ty + g[r + 1][c + 1] * tx * ty;
  };
  // výška mostovky pod bodem (jen když vozidlo jede podél mostu, ne pod ním): overlay.json decks
  // Úseky mostovek v mřížce 32 m (jen buňky, kam úsek s tolerancí zasahuje), v původním pořadí: výsledek je stejný
  // jako při průchodu všech úseků, ale vozidlo mimo most projde jen pár kandidátů místo tisíců.
  const DZG = new Map(), DZC = 32, dzk = (i, j) => i * 100003 + j;
  for (const d of OV.decks || []) for (let i = 0; i < d.p.length - 1; i++) {
    const a = d.p[i], b = d.p[i + 1], ex = b[0] - a[0], ey = b[1] - a[1], el = Math.hypot(ex, ey) || 1;
    const pad = d.w / 2 + 1.5 + 0.05 * el + 0.5, sg = { a, b, ex, ey, el, lim: d.w / 2 + 1.5 };
    const i0 = Math.floor((Math.min(a[0], b[0]) - pad) / DZC), i1 = Math.floor((Math.max(a[0], b[0]) + pad) / DZC);
    const j0 = Math.floor((Math.min(a[1], b[1]) - pad) / DZC), j1 = Math.floor((Math.max(a[1], b[1]) + pad) / DZC);
    for (let ci = i0; ci <= i1; ci++) for (let cj = j0; cj <= j1; cj++) { const k = dzk(ci, cj); let l = DZG.get(k); if (!l) DZG.set(k, l = []); l.push(sg); }
  }
  const deckZ = (x, y, dx, dy) => {
    const l = DZG.get(dzk(Math.floor(x / DZC), Math.floor(y / DZC)));
    if (!l) return null;
    const dl = Math.hypot(dx, dy) || 1;
    for (const s of l) {
      const a = s.a, b = s.b, ex = s.ex, ey = s.ey, el = s.el;
      const t = ((x - a[0]) * ex + (y - a[1]) * ey) / (el * el);
      if (t < -0.05 || t > 1.05 || Math.abs((x - a[0]) * ey - (y - a[1]) * ex) / el > s.lim) continue;
      if (Math.abs((dx * ex + dy * ey) / (dl * el)) < 0.85) continue;
      return a[2] + (b[2] - a[2]) * Math.max(0, Math.min(1, t));
    }
    return null;
  };
  function imgToWorld(ix, iy) {
    const vx = cam.x0 + ix * cam.mpp, vy = cam.y1 - iy * cam.mpp;
    let h = 60, x = 0, y = 0;
    for (let i = 0; i < 6; i++) {
      const a = X[0], b = -X[2], c = Y[0], d = -Y[2], r1 = vx - h * X[1], r2 = vy - h * Y[1], det = a * d - b * c;
      x = (r1 * d - b * r2) / det; y = (a * r2 - c * r1) / det; h = gz(x, y);
    }
    return [x, y];
  }
  const lonlat = (x, y) => [x / cam.kx + cam.lon0, y / cam.ky + cam.lat0];


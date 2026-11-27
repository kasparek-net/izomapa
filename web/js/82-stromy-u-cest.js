  // stromy u cest (overlay čtverce): koruny, za kterými se schovají vozidla a lyžaři. Mřížka po 16 m ve světě.
  const TG = new Map(), tgk = (x, y) => Math.floor(x / 16) + ',' + Math.floor(y / 16);
  onChunk.push((k, d) => { for (const t of d.trees || []) { const q = tgk(t[0], t[1]); if (!TG.has(q)) TG.set(q, []); TG.get(q).push(t); } });
  // obrysy korun před bodem (x, y, z) v obrazových pixelech: elipsa listnáče, trojúhelník jehličnanu (jako v renderu)
  // stromy před vozidlem: auto se schová přesně za pixely stromu. Kresby stromů jsou z rendereru (site/stromy/<období>.png,
  // node render.mjs stromy=…); kresbu strom vybírá stejně jako render.html: podle hashe světových souřadnic, velikost podle výšky.
  const STROMY = {};
  const stromy = () => {
    const s = state.season;
    if (!STROMY[s]) {
      STROMY[s] = { ok: false };
      Promise.all([fetch(`stromy/${s}.json`).then((r) => r.json()), new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = `stromy/${s}.png`; })])
        .then(([m, im]) => Object.assign(STROMY[s], m, { im, ok: true })).catch(() => {});
    }
    return STROMY[s].ok ? STROMY[s] : null;
  };
  const tHash = (x, y) => { const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return v - Math.floor(v); };
  function treeSprite(A, t) {                                   // [slot, měřítko] stejně jako render.html
    const [x, y, , h, conif, kind] = t; let list, Hc;
    if (kind === 1) { list = A.slots.bush; Hc = A.BUSH_H; }
    else if (kind === 3) { const si = h < 8 ? 0 : 1; list = A.slots.col[si]; Hc = A.COL_H[si]; }
    else if (conif) { const si = h < 12 ? 0 : h < 18 ? 1 : 2; list = A.slots.con[si]; Hc = A.CON_H[si]; }
    else { const si = h < 10.5 ? 0 : h < 16 ? 1 : 2; list = A.slots.dec[si]; Hc = A.DEC_H[si]; }
    return [list[Math.floor(tHash(Math.round(x * 100) / 100, Math.round(y * 100) / 100) * list.length)], Math.max(0.75, Math.min(1.3, h / Hc))];
  }
  // mostovky jako překážka: auto pod mostem nebo za ním se schová (deska ~1,2 m pod povrchem, zábradlí ~1,1 m nad ním)
  const DG = new Map();
  for (const d of OV.decks || []) for (let i = 0; i < d.p.length - 1; i++) {
    const a = d.p[i], b = d.p[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / L * (d.w / 2 + 0.5), ny = (b[0] - a[0]) / L * (d.w / 2 + 0.5);
    const sg = { a, b, nx, ny, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2] };
    for (let k = 0; k <= Math.ceil(L / 16); k++) { const q = tgk(a[0] + (b[0] - a[0]) * k / Math.ceil(L / 16 || 1), a[1] + (b[1] - a[1]) * k / Math.ceil(L / 16 || 1)); if (!DG.has(q)) DG.set(q, new Set()); DG.get(q).add(sg); }
  }
  function deckShapes(x, y, z, dv, bb, out) {
    const cx = Math.floor(x / 16), cy = Math.floor(y / 16), seen = new Set();
    for (let i = cx - 4; i <= cx + 2; i++) for (let j = cy - 4; j <= cy + 2; j++) for (const s of DG.get(i + ',' + j) || []) {
      if (seen.has(s)) continue; seen.add(s);
      { const ex = s.b[0] - s.a[0], ey = s.b[1] - s.a[1], t = Math.max(0, Math.min(1, ((x - s.a[0]) * ex + (y - s.a[1]) * ey) / ((ex * ex + ey * ey) || 1)));
        const deckZ = s.a[2] + (s.b[2] - s.a[2]) * t;
        if (z > deckZ - 2.5) continue;                                        // porovnání s výškou mostovky u vozidla, ne u vzdáleného nájezdu
        const bx = s.a[0] + ex * t, by = s.a[1] + ey * t;
        // Mostovka má šířku: bližší okraj může zakrývat vozidlo, i když je její osa za ním.
        if (Math.min(depth(bx + s.nx, by + s.ny, deckZ), depth(bx - s.nx, by - s.ny, deckZ)) >= dv) continue; }
      const { a, b, nx, ny } = s, P = (p, sg, dz) => toImg(p[0] + nx * sg, p[1] + ny * sg, p[2] + dz);
      const q = [P(a, 1, 1.1), P(b, 1, 1.1), P(b, 1, -1.2), P(b, -1, -1.2), P(a, -1, -1.2), P(a, -1, 1.1), P(b, -1, 1.1)];
      const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]);
      if (Math.min(...xs) > bb[2] || Math.max(...xs) < bb[0] || Math.min(...ys) > bb[3] || Math.max(...ys) < bb[1]) continue;
      out.push([3, [P(a, 1, 1.1), P(b, 1, 1.1), P(b, -1, 1.1), P(a, -1, 1.1)]], [3, [P(a, 1, 1.1), P(b, 1, 1.1), P(b, 1, -1.2), P(a, 1, -1.2)]], [3, [P(a, -1, 1.1), P(b, -1, 1.1), P(b, -1, -1.2), P(a, -1, -1.2)]]);
    }
  }
  const behindFoot = (ix, iy, fb) => {
    for (const P of fb) for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      const [xi, yi] = P[i], [xj, yj] = P[j];
      if ((xi > ix) !== (xj > ix) && yi + (ix - xi) / (xj - xi) * (yj - yi) > iy) return true;
    }
    return false;
  };
  function buildingShapes(x, y, z, bb, out) {                                  // domy před vozidlem: ořez podle přesného obrysu
    const b0 = toImg(x, y, z), seen = new Set();
    for (let cx = Math.floor(bb[0] / CELL); cx <= Math.floor(bb[2] / CELL); cx++) for (let cy = Math.floor(bb[1] / CELL); cy <= Math.floor(bb[3] / CELL); cy++)
      for (const b of grid.get(cx + ',' + cy) || []) {
        if (seen.has(b) || !shown(b.k)) continue; seen.add(b);
        if (b.bb[0] > bb[2] || b.bb[2] < bb[0] || b.bb[1] > bb[3] || b.bb[3] < bb[1]) continue;
        if (b.fb ? !behindFoot(b0[0], b0[1], b.fb) : !((b.dm ?? b.d) < depth(x, y, z) - 1.5)) continue;
        out.push([3, b.hull]);
      }
  }
  const alfa = (A) => {                                         // pixely kresby stromů (jednou na roční období)
    if (!A.alfa) { try { const c = document.createElement('canvas'); c.width = A.im.width; c.height = A.im.height; const g = c.getContext('2d'); g.drawImage(A.im, 0, 0); A.alfa = g.getImageData(0, 0, c.width, c.height); } catch { A.alfa = { width: 0 }; } }
    return A.alfa;
  };
  // těsný obrys kresby v buňce [u0, v0, u1, v1] (pixely s alfou > 0; prázdná kresba null): buňka je kolem kresby hodně prázdná
  // a test celé buňky posílal přes pomocné plátno i auta, kterých se strom nedotkne (v Liberci 74 % aut, s obrysem 57–62 %)
  function obrys(A, slot) {
    const a = alfa(A), ob = A.ob || (A.ob = []);
    if (!a.width) return [0, 0, A.CW - 1, A.CH - 1];
    if (ob[slot] === undefined) {
      let u0 = A.CW, v0 = A.CH, u1 = -1, v1 = -1; const x0 = (slot % 16) * A.CW, y0 = Math.floor(slot / 16) * A.CH;
      for (let v = 0; v < A.CH; v++) for (let u = 0; u < A.CW; u++) if (a.data[((y0 + v) * a.width + x0 + u) * 4 + 3]) { if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v; }
      ob[slot] = u1 < 0 ? null : [u0, v0, u1, v1];
    }
    return ob[slot];
  }
  // je v bodě obrázku (ix, iy) neprůhledný pixel přesné kresby stromu q = [2, slot, L, T, k]? (kmen i koruna; chodec za ním zmizí)
  function stromPixel(q, ix, iy) {
    const A = STROMY[state.season]; if (!A || !A.ok) return false;
    alfa(A);
    const [, slot, L, T, k] = q, u = Math.floor((ix - L) / k), v = Math.floor((iy - T) / k);
    if (u < 0 || v < 0 || u >= A.CW || v >= A.CH || !A.alfa.width) return false;
    const px = (slot % 16) * A.CW + u, py = Math.floor(slot / 16) * A.CH + v;
    return A.alfa.data[(py * A.alfa.width + px) * 4 + 3] > 100;
  }
  function treeShapes(x, y, z, bb, m = 0) {                     // m = okraj v pixelech obrázku (zaokrouhlení při kreslení)
    const dv = depth(x, y, z), out = [], cx = Math.floor(x / 16), cy = Math.floor(y / 16), A = stromy(), k0 = 0.2 / cam.mpp;
    for (let i = cx - 4; i <= cx + 2; i++) for (let j = cy - 4; j <= cy + 2; j++) for (const t of TG.get(i + ',' + j) || []) {   // stromy před vozidlem (k jihozápadu) až ~60 m
      const [tx, ty, tz, h, con] = t;
      if (depth(tx, ty, tz) >= dv - 0.3) continue;                               // strom je za vozidlem
      if (A) {                                                                    // přesná kresba stromu
        const [slot, s] = treeSprite(A, t), k = k0 * s, b = toImg(tx, ty, tz);
        const L = b[0] - A.CW / 2 * k, T = b[1] - (A.CH - 3) * k;
        if (L > bb[2] || L + A.CW * k < bb[0] || T > bb[3] || T + A.CH * k < bb[1]) continue;
        const o = obrys(A, slot);
        if (!o || L + o[0] * k > bb[2] + m || L + (o[2] + 1) * k < bb[0] - m || T + o[1] * k > bb[3] + m || T + (o[3] + 1) * k < bb[1] - m) continue;
        out.push([2, slot, L, T, k]); continue;
      }
      if (con) {                                                                  // kresby se ještě načítají: odhad tvaru
        const a = toImg(tx, ty, tz + h), b = toImg(tx, ty, tz + h * 0.12), r = h * 0.2 / cam.mpp;
        if (a[0] + r < bb[0] || a[0] - r > bb[2] || a[1] > bb[3] || b[1] < bb[1]) continue;
        out.push([0, a, b, r]);
      } else {
        const ch = h * 0.4, c = toImg(tx, ty, tz + h - ch), rx = h * 0.31 / cam.mpp, ry = Math.abs(toImg(tx, ty, tz + h)[1] - c[1]) + rx * 0.35;
        if (c[0] + rx < bb[0] || c[0] - rx > bb[2] || c[1] + ry < bb[1] || c[1] - ry > bb[3]) continue;
        out.push([1, c, rx, ry]);
      }
    }
    if (DG.size) deckShapes(x, y, z, dv, bb, out);
    buildingShapes(x, y, z, bb, out);
    return out;
  }
  const occC = document.createElement('canvas'), occX = occC.getContext('2d');
  function drawBehindTrees(img, ix, iy, iw, ih, x, y, z, sx, ox, oy) {
    const X0 = Math.round(ox + ix * sx), Y0 = Math.round(oy + iy * sx), w = Math.round(iw * sx), h = Math.round(ih * sx);
    const sh = treeShapes(x, y, z, [ix, iy, ix + iw, iy + ih], 2 / sx);   // pomocné plátno je v pixelech CSS, kraje se zaokrouhlují: 2 px rezerva
    if (!sh.length) { ctx.drawImage(img, X0, Y0, w, h); return; }
    if (occC.width < w || occC.height < h) { occC.width = Math.max(occC.width, w); occC.height = Math.max(occC.height, h); }
    occX.clearRect(0, 0, w, h); occX.imageSmoothingEnabled = false; occX.globalCompositeOperation = 'source-over';
    occX.drawImage(img, 0, 0, w, h);
    occX.globalCompositeOperation = 'destination-out';
    const A = STROMY[state.season], P = (p) => [ox + p[0] * sx - X0, oy + p[1] * sx - Y0];
    for (const q of sh) if (q[0] === 2) {                                         // pixely kresby stromu vyříznou auto
      const [, slot, L, T, k] = q, cw = A.CW, chh = A.CH;
      occX.drawImage(A.im, (slot % 16) * cw, Math.floor(slot / 16) * chh, cw, chh, ox + L * sx - X0, oy + T * sx - Y0, cw * k * sx, chh * k * sx);
    }
    occX.fillStyle = '#000';
    for (const q of sh) {
      if (q[0] === 2) continue;
      occX.beginPath();
      if (q[0] === 0) { const [ax, ay] = P(q[1]), [bx, by] = P(q[2]), r = q[3] * sx; occX.moveTo(ax, ay); occX.lineTo(bx + r, by); occX.lineTo(bx - r, by); occX.closePath(); }
      else if (q[0] === 1) { const [cx, cy] = P(q[1]); occX.ellipse(cx, cy, q[2] * sx, q[3] * sx, 0, 0, Math.PI * 2); }
      else if (q[0] === 3) { q[1].forEach((p, k) => { const [px, py] = P(p); k ? occX.lineTo(px, py) : occX.moveTo(px, py); }); occX.closePath(); }
      else continue;
      // Výplň každého dílu zvlášť: překrývající se plochy s opačným pořadím vrcholů se nesmí vzájemně vyrušit.
      occX.fill();
    }
    occX.globalCompositeOperation = 'source-over';
    ctx.drawImage(occC, 0, 0, w, h, X0, Y0, w, h);
  }
  // vlak po článcích podle koleje, vzdálenější článek první, aby ho bližší zakryl
  function drawTrain(trip, el, line, sx, ox, oy, night) {
    const name = trainOf(line), cars = TRAINS[name].cars, T = cars.reduce((a, c) => a + c.len + 0.4, -0.4);
    let at = T / 2; const parts = cars.map((c, i) => { const o = mhdPos(trip, el, T, at - c.len / 2); at -= c.len + 0.4; o.lane = 0; o.noLights = i > 0; return [o, c, i]; });
    parts.sort((a, b) => (b[0].x + b[0].y) - (a[0].x + a[0].y));
    let any = false;
    for (const [o, c, i] of parts) if (drawVehicle(o, c.len, 2.82, `train|${name}|${i}`, sx, ox, oy, night, 4)) any = true;
    at = T / 2; drawTrain.pts = [];                           // body po celé délce vlaku (po ~5 m): na vlak jde kliknout kdekoli
    for (const c of cars) { for (let s = 0; s <= c.len; s += 5) drawTrain.pts.push(mhdPos(trip, el, T, at - s)); at -= c.len + 0.4; }
    return any;
  }

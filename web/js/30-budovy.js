  // ---------- budovy: index pro klikání ----------
  const CELL = 256, grid = new Map();
  const addBuildings = (list) => list.forEach((b) => {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of b.hull) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    b.bb = [x0, y0, x1, y1];
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) for (let cy = Math.floor(y0 / CELL); cy <= Math.floor(y1 / CELL); cy++) {
      const k = cx + ',' + cy; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(b);
    }
  });
  // data čtverců (budovy, komíny, silnice, voda) se načítají až při přiblížení, viz loadVisible()
  const CH = {}, chimneys = [];
  const onChunk = [];
  function loadChunk(k) {
    if (CH[k]) return CH[k].ready;
    CH[k] = { ready: fetch(`overlay/${k}.json`).then((r) => r.json()).then((d) => {
      Object.assign(CH[k], d);
      for (const b of d.buildings) b.k = k;
      addBuildings(d.buildings);
      for (const [cx, cy, cid] of d.chimneys) { const id = sid(cid); chimneys.push([cx, cy, cid.split(':')[0], id, rnd(id), rnd(id + 0.5)]); }   // klíč čtverce a náhoda jednou, ne každý snímek
      for (const f of onChunk) f(k, d);
      return CH[k];
    }).catch(() => null) };
    return CH[k].ready;
  }
  function loadVisible() {
    const vb = viewer.viewport.getBounds(true);
    if (vb.width > 1.3) return;                         // oddáleno: budovy se neklikají, auta a kouř nejsou vidět
    for (const l of LAYERS) {
      if (CH[l.key] || !shown(l.key)) continue;
      const h = l.w * (l.hrel || 0.56);
      if (l.x < vb.x + vb.width && l.x + l.w > vb.x && l.y < vb.y + vb.height && l.y + h > vb.y) loadChunk(l.key);
    }
  }
  viewer.addHandler('animation-finish', loadVisible);
  viewer.addHandler('open', loadVisible);
  const inPoly = (x, y, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  function hit(ix, iy) {
    let best = null;
    for (const b of grid.get(Math.floor(ix / CELL) + ',' + Math.floor(iy / CELL)) || []) {
      if (ix < b.bb[0] || ix > b.bb[2] || iy < b.bb[1] || iy > b.bb[3]) continue;
      if (shown(b.k) && inPoly(ix, iy, b.hull) && (!best || b.d < best.d)) best = b;
    }
    return best;
  }
  const placeByName = Object.fromEntries(OV.places.map((p) => [p.name, p]));
  const myPlaces = OV.places.filter((p) => !OBEC || !p.obec || p.obec === OBEC);
  if (!myPlaces.length) $('placesBox').hidden = true;      // bez mista.json


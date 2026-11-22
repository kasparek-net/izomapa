  // vodní třpytky: body na potocích a uvnitř rybníků
  const sparkles = [];
  onChunk.push((wk, d) => {
  const WT = d.water;
  {
  for (const l of WT.streams) for (let i = 1; i < l.length; i++) { const [x0, y0] = l[i - 1], [x1, y1] = l[i]; const n = Math.floor(Math.hypot(x1 - x0, y1 - y0) / 14); for (let k = 0; k < n; k++) sparkles.push([x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n, rnd(sparkles.length), wk]); }
  for (const p of WT.ponds) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of p) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const n = Math.min(400, Math.floor((x1 - x0) * (y1 - y0) / 140));
    for (let k = 0; k < n; k++) { const x = x0 + rnd(k * 3 + x0) * (x1 - x0), y = y0 + rnd(k * 5 + y0) * (y1 - y0); if (inPoly(x, y, p)) sparkles.push([x, y, rnd(k + x), wk]); }
  }
  }
  });
  // mraky
  // mraky: 30 náhodně nad celou mapou (souřadnice obrázku čtverce 0,0, mapa sahá i do záporných)
  const MX0 = Math.min(...LAYERS.map((l) => l.x)) * W, MX1 = Math.max(...LAYERS.map((l) => l.x + l.w)) * W;
  const MY0 = Math.min(...LAYERS.map((l) => l.y)) * W, MY1 = Math.max(...LAYERS.map((l) => l.y + l.w * 0.56)) * W;
  const clouds = Array.from({ length: 30 }, (_, i) => {
    const blocks = []; const n = 5 + Math.floor(rnd(i + 40) * 5);
    for (let k = 0; k < n; k++) { const cx = (rnd(i * 13 + k) - 0.5) * 40, cy = (rnd(i * 17 + k) - 0.5) * 12, rr = 5 + rnd(i * 7 + k) * 7;
      for (let y = -rr; y <= rr; y++) for (let x = -rr * 1.6; x <= rr * 1.6; x++) if ((x / 1.6) ** 2 + y ** 2 <= rr * rr) blocks.push([Math.round(cx + x), Math.round(cy + y)]); }
    const key = new Set(blocks.map((b) => b.join(','))); const uniq = [...key].map((s) => s.split(',').map(Number));
    return { x: MX0 - 1500 + rnd(i + 1) * (MX1 - MX0 + 3000), y: MY0 + 600 + rnd(i + 2) * (MY1 - MY0 - 1200), blocks: uniq, bottom: new Set(uniq.filter(([x, y]) => !key.has(x + ',' + (y + 1))).map((b) => b.join(','))) };
  });
  const BS = 22;
  for (const c of clouds) { c.minx = Math.min(...c.blocks.map((b) => b[0])); c.miny = Math.min(...c.blocks.map((b) => b[1])); c.bmp = {}; }
  function cloudBitmap(c, key, dark) {
    if (c.bmp[key]) return c.bmp[key];
    const w = Math.max(...c.blocks.map((b) => b[0])) - c.minx + 1, h = Math.max(...c.blocks.map((b) => b[1])) - c.miny + 1;
    const mk = () => { const k = document.createElement('canvas'); k.width = w; k.height = h; return k; };
    const sh = mk(), bo = mk(), a = sh.getContext('2d'), b = bo.getContext('2d');
    a.fillStyle = 'rgba(10,16,40,0.10)';
    for (const [x, y] of c.blocks) {
      a.fillRect(x - c.minx, y - c.miny, 1, 1);
      const bottom = c.bottom.has(x + ',' + y);
      b.fillStyle = dark === 2 ? (bottom ? 'rgba(90,96,118,.6)' : 'rgba(120,128,150,.6)') : dark === 1 ? (bottom ? 'rgba(120,124,136,.62)' : 'rgba(168,172,184,.62)') : (bottom ? 'rgba(214,222,236,.62)' : 'rgba(250,251,255,.62)');
      b.fillRect(x - c.minx, y - c.miny, 1, 1);
    }
    return (c.bmp[key] = [sh, bo]);
  }


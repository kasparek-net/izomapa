  // ---------- karta ----------
  const ROOF = { flat: 'plochá', gabled: 'sedlová', hipped: 'valbová', pyramidal: 'stanová' };
  function showCard({ title, text, rows, lon, lat, k, link, linkText, target }) {
    $('cardTitle').textContent = title;
    if (k && !(LAYERS.find((l) => l.key === k) || {}).status?.startsWith('hotovo')) { const t = document.createElement('span'); t.className = 'wip-tag'; t.textContent = 'Rozpracováno'; $('cardTitle').append(' ', t); }
    $('cardText').hidden = !text; $('cardText').textContent = text || '';
    const dl = $('cardDl'); dl.replaceChildren();
    for (const [k, v] of rows) { if (v === undefined || v === null || v === '') continue; const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; dl.append(dt, dd); }
    const links = $('cardLinks'); links.replaceChildren();
    if (link) {
      const btn = document.createElement('a'); btn.href = link; btn.className = 'card-neighbor-btn';
      if (target) btn.target = target;
      if (btn.target === '_blank') btn.rel = 'noopener';
      btn.textContent = linkText || `Přejít na mapu ${title} ↗`;
      links.append(btn);
    }
    const a = document.createElement('a'); a.target = '_blank'; a.rel = 'noopener';
    a.href = `https://mapy.cz/zakladni?x=${lon.toFixed(6)}&y=${lat.toFixed(6)}&z=19&source=coor&id=${lon.toFixed(6)}%2C${lat.toFixed(6)}`;
    a.textContent = 'Ukázat ve skutečnosti (Mapy.cz)';
    const s = document.createElement('a'); s.target = '_blank'; s.rel = 'noopener';
    s.href = `https://mapy.cz/letecka?x=${lon.toFixed(6)}&y=${lat.toFixed(6)}&z=19`; s.textContent = 'Letecký snímek';
    links.append(a, s);
    $('card').style.transform = '';
    $('card').hidden = false;
    setReport(`pt:${lat.toFixed(5)},${lon.toFixed(5)}`, title, lon, lat);     // výchozí cíl hlášení = místo, budova ho přepíše
  }
  // hlášení nepřesností: jen když je zapnuté v mesto.json ("hlaseni": true) a běží server z hlaseni/
  const HLASENI = {{HLASENI}};
  $('report').hidden = !HLASENI;
  let repTarget = null;
  const repMsg = (t, cls) => { $('repMsg').textContent = t; $('repMsg').className = cls ? 'rep-' + cls : ''; };
  function setReport(target, title, lon, lat) {
    repTarget = { target, title, lon, lat };
    $('report').open = false; repMsg('', ''); $('repNote').value = '';
  }
  $('reportForm').addEventListener('submit', async (e) => {
    e.preventDefault(); if (!repTarget) return;
    if ($('repNote').value.trim().length < 3) { repMsg('Napište prosím, co tu nesedí (aspoň pár slov).', 'err'); return; }
    $('reportForm').querySelector('button').disabled = true;
    repMsg('Odesílám…', '');
    try {
      const r = await fetch('api/report', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...repTarget, note: $('repNote').value.trim() }) });
      const d = await r.json().catch(() => ({}));
      if (d.ok) { $('repNote').value = ''; repMsg('Díky! Hlášení je odeslané.', 'ok'); }
      else repMsg(d.msg || 'Hlášení se nepovedlo odeslat. Zkuste to prosím za chvíli.', 'err');
    } catch { repMsg('Hlášení teď nejde odeslat (bez připojení?). Zkuste to prosím později.', 'err'); }
    $('reportForm').querySelector('button').disabled = false;
  });
  // speciální místo k budově: špendlík místa leží v obrysu budovy a budova je do 35 m (OSM má jiné názvy, „sv. Jan Křtitel“)
  const geoM = (lat, lon, p) => Math.hypot(lat - p.lat, (lon - p.lon) * Math.cos(p.lat * Math.PI / 180)) * 111320;
  function placeOf(b) {
    let best = null, bd = 35;
    for (const p of OV.places) { const d = geoM(b.lat, b.lon, p); if (d < bd && inPoly(p.xy[0], p.xy[1], b.hull)) { best = p; bd = d; } }
    return best;
  }
  function showBuilding(b) {
    state.sel = b;
    const pl = placeOf(b);
    const nm = pl ? pl.name : b.name;
    const story = (pl && pl.text) || b.text || (nm && placeByName[nm] ? placeByName[nm].text : null);
    const title = nm || b.cls[0].toUpperCase() + b.cls.slice(1);
    showCard({ title, text: story, lon: b.lon, lat: b.lat, k: b.k, rows: [
      ['Adresa', (b.addr || []).join(', ')], ['Typ', nm ? b.cls : null],
    ] });
    setReport(b.oid ? 'b:' + b.oid : b.id, [title, (b.addr || [])[0]].filter(Boolean).join(', '), b.lon, b.lat);
  }
  function showPoint(ix, iy) {
    state.sel = null;
    const [x, y] = imgToWorld(ix, iy); const [lon, lat] = lonlat(x, y);
    // sousední mapa: klik do 40 m od špendlíku (1 px = 0,2 m)
    let nb = null, nd = 200;
    for (const n of OV.neighbors || []) {
      if (!shown(n.k) || (OBEC && n.obec && n.obec !== OBEC)) continue;
      const d = Math.hypot(ix - n.xy[0], iy - n.xy[1]);
      if (d < nd) { nb = n; nd = d; }
    }
    if (nb) {
      showCard({ title: nb.name, text: nb.text || 'Sousední izometrická mapa.', lon: nb.lon, lat: nb.lat, k: nb.k, link: neighborHref(nb), linkText: `Přejít na mapu ${nb.name} ↗`, target: nb.target, rows: [['Sousední mapa', nb.name]] });
      return;
    }
    // místo bez budovy (náměstí, hřbitov, přehrada): klik do 40 m od jeho špendlíku (1 px = 0,2 m)
    let pl = null, bd = 200;
    for (const p of OV.places) { if (!shown(p.k)) continue; const d = Math.hypot(ix - p.xy[0], iy - p.xy[1]); if (d < bd) { pl = p; bd = d; } }
    if (pl) { showCard({ title: pl.name, text: pl.text, lon: pl.lon, lat: pl.lat, k: pl.k, rows: [] }); return; }
    showCard({ title: 'Vybrané místo', rows: [], lon, lat });
  }
  const closeCard = () => { $('card').hidden = true; state.sel = null; };
  $('cardClose').addEventListener('click', closeCard);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('card').hidden && !document.querySelector('dialog[open]') && !e.target.matches('input, textarea')) closeCard(); });
  // mobil: kartu jde stáhnout prstem dolů
  { let y0 = null;
    const card = $('card');
    card.addEventListener('pointerdown', (e) => { if (isMobile() && (e.target === $('grab') || card.scrollTop === 0)) { y0 = e.clientY; } });
    card.addEventListener('pointermove', (e) => { if (y0 !== null) { const d = Math.max(0, e.clientY - y0); card.style.transform = `translateY(${d}px)`; } });
    const end = (e) => { if (y0 === null) return; const d = e.clientY - y0; y0 = null; if (d > 70) closeCard(); else card.style.transform = ''; };
    card.addEventListener('pointerup', end); card.addEventListener('pointercancel', end);
  }

  const vpToImg = (pos) => { const p = viewer.viewport.viewerElementToViewportCoordinates(pos); return [p.x * W, p.y * W]; };

  // ---------- OpenSeadragon: vrstvy po čtvercích (den podle ročního období × teplý tón × tma + světla) ----------
  // souřadnice: pixely čtverce (0, 0), šířka W = 1 v souřadnicích pohledu; ostatní čtverce jsou posunuté
  // UM = metry na pixel souřadnic prohlížeče (obrysy, animace: vždy 0,2); base.mpp = rozlišení dlaždic (0,2, u detailního 0,1)
  const base = TILES.base || { x0: OV.cam.x0, y1: OV.cam.y1, mpp: OV.cam.mpp, status: 'hotovo' }, UM = OV.cam.mpp;
  const LAYERS = [{ key: 'c0_0', status: base.status, src: (v) => TILES[v], x: 0, y: 0, w: 1 }];
  for (const [key, ch] of Object.entries(TILES.chunks || {})) {
    const any = ch.autumn || ch.lights; if (!any) continue;
    const dx = (any.x0 - base.x0) / UM, dy = (base.y1 - any.y1) / UM;
    LAYERS.push({ key, status: ch.status, src: (v) => ch[v], x: dx / W, y: dy / W, w: +any.Image.Size.Width * base.mpp / UM / W });
  }
  // pořadí vrstev podle hloubky: pohled od JZ, takže čtverce dál na S a V (větší i + j) se kreslí dřív (níž)
  const far = (k) => { const [i, j] = k.slice(1).split('_').map(Number); return i + j; };
  LAYERS.sort((a, b) => far(b.key) - far(a.key));
  if (!WIP) { $('wipSel').parentElement.hidden = true; state.wip = true; }   // vše hotové: bez přepínače, celá mapa   // bez rozpracovaných čtverců (např. náhled v artefaktu)
  const shown = (k) => state.wip || (LAYERS.find((l) => l.key === k) || {}).status === 'hotovo';
  const SLOW = matchMedia('(max-width: 640px)').matches || !!(navigator.connection && (navigator.connection.saveData || /2g|3g/.test(navigator.connection.effectiveType || '')));
  const viewer = OpenSeadragon({
    element: $('osd'), tileSources: [],
    showNavigationControl: false, imageSmoothingEnabled: false,
    // největší přiblížení stejné v metrech (detailní dlaždice mají 2× víc pixelů, proto u nich poloviční poměr)
    maxZoomPixelRatio: 6 * base.mpp / UM, minZoomImageRatio: 0.6, visibilityRatio: 0.4, animationTime: 0.6,
    // mobil a pomalé připojení: hrubší dlaždice, aby se mapa ukázala hned (při přiblížení se doostří)
    ...(SLOW ? { minPixelRatio: 1.2, immediateRender: true, imageLoaderLimit: 4 } : { minPixelRatio: 0.6 }),
    gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: true }, gestureSettingsTouch: { pinchRotate: false }, gestureSettingsPen: { clickToZoom: false, dblClickToZoom: true },
  });
  // verze dlaždic v adrese: dlaždice se cachují na rok, nový render změní verzi svého čtverce (tiles.json se ověřuje vždy).
  // Každý čtverec a období má vlastní verzi (d.ver, zapisuje dzi.py): po přerenderu jednoho čtverce si lidé stáhnou znovu jen ten.
  // VER = společná verze (náhled celé mapy, jízdní řády, starší tiles.json bez verzí po čtvercích)
  const VER = TILES.ver ? `?v=${TILES.ver}` : '';
  const verDl = new Map();                               // adresa vrstvy (Image.Url) -> verze
  for (const d of [TILES, ...Object.values(TILES.chunks || {})].flatMap((c) => Object.values(c))) if (d && d.Image && d.ver) verDl.set(d.Image.Url, `?v=${d.ver}`);
  const verOf = (url) => verDl.get(url) || VER;
  viewer.world.addHandler('add-item', (e) => { const s = e.item.source; if (s && s.tilesUrl !== undefined) s.queryParams = verOf(s.tilesUrl); });
  const solid = (r, g, b) => { const c = document.createElement('canvas'); c.width = c.height = 2; const x = c.getContext('2d'); x.fillStyle = `rgb(${r},${g},${b})`; x.fillRect(0, 0, 2, 2); return c.toDataURL(); };
  let warmItem = null, darkItem = null, ready = false;
  const add = (opts) => new Promise((res) => viewer.addTiledImage({ ...opts, success: (e) => res(e.item), error: () => res(null) }));
  const layerOpacity = (l) => (shown(l.key) ? 1 : 0);
  // náhled celé mapy (jeden obrázek ~0,5 MB): ukáže se hned, detailní dlaždice čtverců se doplní pod ním souběžně
  let previewItem = null, previewGen = 0;
  async function addPreview(season) {
    const gen = ++previewGen;
    try {
      const pv = await fetch(`preview/${season}.json${VER}`).then((r) => r.json());
      const it = await add({ tileSource: { type: 'image', url: `preview/${season}.webp${VER}`, buildPyramid: false },
        x: (pv.x0 - base.x0) / UM / W, y: (base.y1 - pv.y1) / UM / W, width: pv.w * pv.mpp / UM / W, index: 0 });
      if (it && gen !== previewGen) { viewer.world.removeItem(it); return; }   // mezitím jiné období
      if (it) { if (previewItem) viewer.world.removeItem(previewItem); previewItem = it; viewer.world.setItemIndex(it, 0); }
    } catch {}
  }
  // pořadí kreslení: náhled, pak čtverce odzadu dopředu (bližší zakryje řez zeminou vzdálenějšího);
  // při změně období leží stará vrstva čtverce hned pod novou, dokud se nová nenačte
  const reorder = () => {
    let k = 0;
    if (previewItem) viewer.world.setItemIndex(previewItem, k++);
    for (const l of LAYERS) {
      if (l.base && l.base !== l.day && viewer.world.getIndexOfItem(l.base) >= 0) viewer.world.setItemIndex(l.base, k++);
      if (l.day) viewer.world.setItemIndex(l.day, k++);
      for (const e of Object.values(l.extra || {})) if (e.it && viewer.world.getIndexOfItem(e.it) >= 0) viewer.world.setItemIndex(e.it, k++);   // výzdoba hned nad svým čtvercem
    }
  };
  // ---------- přídavná vrstva čtverců: vánoční výzdoba (assets/vanoce.json), zapnutá podle data od/do ----------
  // varianta v zimě se sněhem, jinak bez (listopad bývá podzimní)
  const VANOCE = {{VANOCE}};
  const inXmasDates = (d = new Date()) => {
    if (!VANOCE) return false;
    const md = (d.getMonth() + 1) * 100 + d.getDate(), p = (v) => { const [m, dd] = v.split('-').map(Number); return m * 100 + dd; };
    const a = p(VANOCE.od), b = p(VANOCE.do);
    return a <= b ? md >= a && md <= b : md >= a || md <= b;       // přes Nový rok
  };
  let xmasUser = null;                                         // ruční přepnutí v menu (jen v tomto prohlížeči)
  const xmasOn = () => !!VANOCE && (xmasUser ?? inXmasDates());
  const xmasShow = () => xmasOn() && (state.season === 'winter' || state.season === 'autumn');   // ručně zvolené jaro nebo léto výzdobu nemá
  function applyExtras() {
    if (!ready && !LAYERS.some((l) => l.day)) return;
    $('l-xmas').checked = xmasOn();
    $('l-xmas').closest('label').hidden = !VANOCE;
    const want = (l) => {
      const w = {};
      if (xmasShow()) { const v = state.season === 'winter' ? 'xmas_winter' : 'xmas_autumn'; if (l.src(v)) w.xmas = v; }
      return w;
    };
    for (const l of LAYERS) {
      l.extra = l.extra || {};
      const w = want(l);
      for (const [k, e] of Object.entries(l.extra)) if (w[k] !== e.v) { if (e.it) viewer.world.removeItem(e.it); e.dead = true; delete l.extra[k]; }
      for (const [k, v] of Object.entries(w)) if (!l.extra[k]) {
        const e = l.extra[k] = { v };
        viewer.addTiledImage({ tileSource: l.src(v), x: l.x, y: l.y, width: l.w, opacity: layerOpacity(l), success: (ev) => {
          if (e.dead) { viewer.world.removeItem(ev.item); return; }
          e.it = ev.item; reorder();
        } });
      }
    }
  }
  $('l-xmas').addEventListener('change', (e) => { xmasUser = e.target.checked; applyExtras(); });
  const S_REV = { spring: 'jaro', summer: 'leto', autumn: 'podzim', winter: 'zima' };
  const neighborHref = (n) => {
    let u = n.url || '';
    try { if (!/^https?:$/.test(new URL(u, location.href).protocol)) u = ''; } catch { u = ''; }   // jen http(s), ne javascript: apod.
    if (u.includes('@')) return u;
    const lat = n.target_lat ?? (n.cil ? n.cil[0] : n.lat);
    const lon = n.target_lon ?? (n.cil ? n.cil[1] : n.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return u;
    let km = 1.4;
    try {
      if (viewer && viewer.viewport && cam) {
        const w = viewer.viewport.getBounds(true).width * W * cam.mpp / 1000;
        if (w > 0 && Number.isFinite(w)) km = Math.min(Math.max(Number(w.toFixed(2)), 0.05), 10);
      }
    } catch {}
    const sTok = S_REV[state.season] || 'leto';
    const nTok = state.night > 0.65 ? '-noc' : state.night > 0.25 ? '-soumrak' : '';
    const hash = `#${sTok}${nTok}@${Number(lat).toFixed(5)},${Number(lon).toFixed(5)},${km}`;
    return u.split('#')[0] + hash;
  };

  async function initLayers() {
    await addPreview(state.season);
    $('loading').hidden = true;
    await Promise.all(LAYERS.map(async (l) => { l.day = l.base = await add({ tileSource: l.src(state.season), x: l.x, y: l.y, width: l.w, opacity: layerOpacity(l) }); }));
    reorder();
    // tónování soumraku a noci jen přes pixely mapy (source-atop), jinak byl v noci vidět obdélník kolem mapy
    warmItem = await add({ tileSource: { type: 'image', url: solid(255, 160, 90) }, x: -60, y: -60, width: 200, opacity: 0, compositeOperation: 'source-atop' });
    darkItem = await add({ tileSource: { type: 'image', url: solid(14, 20, 52) }, x: -60, y: -60, width: 200, opacity: 0, compositeOperation: 'source-atop' });
    for (const l of LAYERS) if (l.src('lights')) l.light = await add({ tileSource: l.src(lightNow = wantStage()) || l.src('lights'), x: l.x, y: l.y, width: l.w, opacity: 0, compositeOperation: 'lighter', preload: false });
    // Levnější noc se stejným obrazem. OpenSeadragon (4.1.0) kreslí každou vrstvu s prolnutím přes pomocné plátno:
    // smazat, nakreslit, přenést = tři průchody přes celou obrazovku na tón a na každou vrstvu světel.
    // Tón je jednobarevný, stačí jeden obdélník přímo do hlavního plátna; pořadí vrstev zůstává.
    // (Světla zůstávají původní cestou: přímé přičítání dělalo na švech dlaždic světlé linky.)
    try {
      const mainCtx = () => viewer.drawer && viewer.drawer.context;
      if (!mainCtx() || !darkItem._drawTiles || !viewer.drawer.drawTile) throw new Error('jiná verze OpenSeadragonu');
      for (const [it, col] of [[warmItem, 'rgb(255,160,90)'], [darkItem, 'rgb(14,20,52)']]) it.draw = function () {
        this._needsDraw = false;
        if (!this.opacity) return;
        const c = mainCtx(); c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
        c.globalCompositeOperation = 'source-atop'; c.globalAlpha = this.opacity; c.fillStyle = col; c.fillRect(0, 0, c.canvas.width, c.canvas.height);
        c.restore();
      };
    } catch (e) { console.warn('noc: zůstává původní skládání', e.message); }
    applyExtras();
    for (const n of OV.needs || []) {
      const el = document.createElement('div'); el.className = 'pin need'; el.textContent = '📷 ' + n.name; el.title = n.text; n.el = el;
      viewer.addOverlay({ element: el, location: new OpenSeadragon.Point(n.xy[0] / W, n.xy[1] / W), placement: OpenSeadragon.Placement.CENTER, checkResize: false });
    }
    for (const p of OV.places) {
      const el = document.createElement('div'); el.className = 'pin'; el.textContent = p.name; p.el = el;
      viewer.addOverlay({ element: el, location: new OpenSeadragon.Point(p.xy[0] / W, p.xy[1] / W), placement: OpenSeadragon.Placement.CENTER, checkResize: false });
    }
    for (const n of OV.neighbors || []) {
      if (OBEC && n.obec && n.obec !== OBEC) continue;
      const el = document.createElement('a'); el.className = 'pin neighbor'; el.href = neighborHref(n);
      if (n.target) el.target = n.target;
      if (el.target === '_blank') el.rel = 'noopener';
      el.title = n.text || `Přejít na mapu: ${n.name}`;
      const ico = document.createElement('span'); ico.className = 'pin-ico'; ico.textContent = '↗'; el.append(ico, ' ' + n.name);
      const upd = () => { el.href = neighborHref(n); };
      el.addEventListener('pointerenter', upd);
      el.addEventListener('pointerdown', (e) => { e.stopPropagation(); upd(); });
      el.addEventListener('click', (e) => { e.stopPropagation(); upd(); });
      n.el = el;
      // cedule na nejbližší vnější hraně mapy, natočená podél ní a vysunutá ven do prázdné plochy (nezakryje názvy obcí při žádném přiblížení)
      let [ix, iy] = n.xy;
      if (Number.isFinite(n.lat) && Number.isFinite(n.lon) && cam.grounds.length) {
        const G = cam.grounds, H_ = cam.half, cl = (v, a, b) => Math.min(b, Math.max(a, v));
        let x = (n.lon - cam.lon0) * cam.kx, y = (n.lat - cam.lat0) * cam.ky;
        const g = G.reduce((a, q) => (Math.hypot(x - q.cx, y - q.cy) < Math.hypot(x - a.cx, y - a.cy) ? q : a));   // čtverec nejblíž bodu
        const has = (dx, dy) => G.some((q) => Math.abs(q.cx - g.cx - dx * 2 * H_) < 1 && Math.abs(q.cy - g.cy - dy * 2 * H_) < 1);
        x = cl(x, g.cx - H_, g.cx + H_); y = cl(y, g.cy - H_, g.cy + H_);
        const hrany = [[g.cy + H_ - y, 'n', has(0, 1)], [y - g.cy + H_, 's', has(0, -1)], [x - g.cx + H_, 'w', has(-1, 0)], [g.cx + H_ - x, 'e', has(1, 0)]]
          .filter((h) => !h[2]).sort((a, b) => a[0] - b[0]);   // jen hrany, za kterými už mapa není
        if (hrany.length) {
          const hr = hrany[0][1]; if (hr === 'n') y = g.cy + H_; else if (hr === 's') y = g.cy - H_; else if (hr === 'w') x = g.cx - H_; else x = g.cx + H_;
          const z = gz(x, y), dirx = hr === 'n' || hr === 's', [jx, jy] = toImg(x + (dirx ? 50 : 0), y + (dirx ? 0 : 50), z);
          [ix, iy] = toImg(x, y, z);
          let rot = Math.atan2(jy - iy, jx - ix) * 180 / Math.PI; if (rot > 90) rot -= 180; if (rot < -90) rot += 180;   // text vždy zleva doprava
          const ven = toImg(x + (hr === 'e' ? 50 : hr === 'w' ? -50 : 0), y + (hr === 'n' ? 50 : hr === 's' ? -50 : 0), z);
          const nahoru = ((ven[0] - ix) * Math.sin(rot * Math.PI / 180) - (ven[1] - iy) * Math.cos(rot * Math.PI / 180)) > 0;   // je „ven“ nad textem?
          el.classList.add('edge'); el.style.setProperty('--rot', rot.toFixed(1) + 'deg'); el.style.setProperty('--ven', nahoru ? '-62%' : '62%');
        }
      }
      viewer.addOverlay({ element: el, location: new OpenSeadragon.Point(ix / W, iy / W), placement: OpenSeadragon.Placement.CENTER, checkResize: false });
    }
    ready = true; applyVisibility(); applyTime(); loadMini(); tickReal();
    viewer.viewport.fitBounds(homeBounds(), true);
    { const b = homeBounds(), side = Math.max(b.width, b.height) * 1.04, tx = b.x - (side - b.width) / 2, ty = b.y - (side - b.height) / 2;   // čtverec kolem mapy místo 200 × 200: omezení oddálení a posunu platí k mapě
      for (const it of [warmItem, darkItem]) if (it) { it.setPosition(new OpenSeadragon.Point(tx, ty), true); it.setWidth(side, true); } }
    // odkaz na místo: #zima-noc@50.76984,15.05836,2 (zeměpisná šířka, délka, přiblížení = šířka výřezu v km)
    // ...,1 = značka přesně na místě (odkaz z administrace hlášení); jen jedna značka a jeden čekající výběr, i po dalších odkazech
    let herePin = null, hereAt = null;
    onChunk.push(() => { if (!hereAt) return; const bb = hit(...hereAt); if (bb) { state.sel = bb; hereAt = null; } });   // budovu zvýraznit, jakmile se načtou data
    const goToLink = (imm, home) => {
      const at = (location.hash.split('@')[1] || '').split(',').map(Number);
      const hasAt = at.length >= 2 && at.every(Number.isFinite);
      if (!hasAt && !home) return;
      if (herePin) { viewer.removeOverlay(herePin); herePin = null; }
      hereAt = null;
      const pos = goView(hasAt ? at : HOME_VIEW, imm);
      if (pos && hasAt && at[3] === 1) {
        herePin = document.createElement('div'); herePin.className = 'here-pin';
        viewer.addOverlay({ element: herePin, location: new OpenSeadragon.Point(pos[0] / W, pos[1] / W), placement: OpenSeadragon.Placement.CENTER, checkResize: false });
        const bb = hit(...pos);
        if (bb) state.sel = bb; else hereAt = pos;
      }
    };
    goToLink(true, true);
    // odkaz vložený do už otevřené mapy: stránka se nenačte znovu, takže je potřeba přejít sem (replaceState níže tuto událost nespouští)
    addEventListener('hashchange', () => {
      if (Date.now() - uiBackAt < 1500) return;                  // návrat po zavření okna (Zpět) mapu nepřesouvá
      const tok = location.hash.slice(1).split('@')[0].split('-');
      for (const q of tok) if (SEASON_TOKEN[q]) setSeason(SEASON_TOKEN[q]);
      // sdílený odkaz má vždy roční období, noc nebo soumrak jen když platí; odkaz jen s polohou denní dobu nemění
      const denni = tok.includes('noc') ? 1 : tok.includes('soumrak') ? 0.42 : tok.some((q) => SEASON_TOKEN[q]) ? 0 : null;
      if (denni !== null) { $('realTime').checked = false; state.night = denni; $('night').value = Math.round(denni * 100); applyTime(); setLightStage('lights'); }
      goToLink(false, false);
    });
    let hashT = null;
    viewer.addHandler('animation-finish', () => { clearTimeout(hashT); hashT = setTimeout(() => {
      const c = viewer.viewport.getCenter(true), [x, y] = imgToWorld(c.x * W, c.y * W), [lon, lat] = lonlat(x, y);
      const km = viewer.viewport.getBounds(true).width * W * cam.mpp / 1000;
      const base = location.hash.slice(1).split('@')[0];
      history.replaceState(null, '', `#${base}@${lat.toFixed(5)},${lon.toFixed(5)},${km.toFixed(2)}`);
    }, 400); });
    loadVisible();
  }
  const HOME_VIEW = {{POHLED}}, HOME_ALL = {{DOMU_CELEK}}, OBEC = {{OBEC}};
  function homeBounds() {
    const vis = LAYERS.filter((l) => shown(l.key));
    const x0 = Math.min(...vis.map((l) => l.x)), y0 = Math.min(...vis.map((l) => l.y));
    const x1 = Math.max(...vis.map((l) => l.x + l.w)), y1 = Math.max(...vis.map((l) => l.y + (l.day ? l.day.getBounds().height : 0.56)));
    return new OpenSeadragon.Rect(x0, y0, x1 - x0, y1 - y0);
  }
  function goView(v, imm = false) {
    const b = homeBounds();
    if (!v || v.length < 2 || !v.every(Number.isFinite)) { viewer.viewport.fitBounds(b, imm); return null; }
    const [lat, lon, km] = v, x = (lon - cam.lon0) * cam.kx, y = (lat - cam.lat0) * cam.ky;
    const [ix, iy] = toImg(x, y, gz(x, y));
    if (ix / W < b.x || ix / W > b.x + b.width || iy / W < b.y || iy / W > b.y + b.height) { viewer.viewport.fitBounds(b, imm); return null; }
    viewer.viewport.panTo(new OpenSeadragon.Point(ix / W, iy / W), imm);
    viewer.viewport.zoomTo(W * cam.mpp / (Math.min(Math.max(km > 0 ? km : 1, 0.05), W * cam.mpp / 1000) * 1000), null, imm);
    return [ix, iy];
  }
  const goHome = (imm = false) => goView(HOME_VIEW && !HOME_ALL ? HOME_VIEW : null, imm);
  viewer.addOnceHandler('open', () => {});
  viewer.addHandler('canvas-scroll', (e) => {
    const o = e.originalEvent;
    if (!o || o.deltaMode !== 0 || (!o.ctrlKey && Math.abs(o.deltaY) >= 50)) return;      // zub kolečka myši (velký skok): výchozí chování
    e.preventDefaultAction = true;                         // trackpad: OpenSeadragon bere jen směr a jeden švih proletěl celý rozsah
    viewer.viewport.zoomBy(Math.exp(-o.deltaY * (o.ctrlKey ? 0.01 : 0.004)), viewer.viewport.pointFromPixel(e.position, true));
    viewer.viewport.applyConstraints();
  });
  if ('ongesturestart' in window && !('ontouchstart' in window)) {   // Safari na Macu neposílá štípnutí jako kolečko
    let gs = 1;
    $('osd').addEventListener('gesturestart', (e) => { e.preventDefault(); gs = 1; });
    $('osd').addEventListener('gesturechange', (e) => { e.preventDefault(); viewer.viewport.zoomBy(e.scale / gs); viewer.viewport.applyConstraints(); gs = e.scale; });
  }
  const layersReady = initLayers();
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  // stupně nočních světel: vždy se kreslí jen jedna vrstva, výměna je párkrát za noc (noční režim je nejnáročnější)
  // časy jsou odhad tvaru dne, ne měření; mapa bez stupňů má jen 'lights'
  const lightStage = (wd, s) => { const h = s / 3600; return h < 5 || h >= 23 ? 'lights_noc' : wd < 5 && h < 17 ? 'lights_prace' : h < 7 ? 'lights_noc' : 'lights'; };
  const wantStage = () => { if (!$('realTime').checked) return 'lights'; const n = pragueNow(); return lightStage(n.wd, n.s); };
  const lightLevel = (l) => (shown(l.key) ? smooth(0.5, 0.95, state.night) : 0);
  let lightNow = 'lights';
  function setLightStage(v) {
    if (!ready || v === lightNow) return;
    lightNow = v;
    for (const l of LAYERS) if (l.light && l.src(v)) swapLight(l, v);
  }
  async function swapLight(l, v) {
    const tok = l.lightTok = {}, vis = lightLevel(l) > 0;
    const next = await add({ tileSource: l.src(v), x: l.x, y: l.y, width: l.w, opacity: 0, compositeOperation: 'lighter', preload: vis });
    if (!next) { lightNow = null; return; }                                 // příští minutu znovu
    if (l.lightTok !== tok) { viewer.world.removeItem(next); return; }
    if (vis) {
      if (!next.getFullyLoaded()) await new Promise((res) => { next.addOnceHandler('fully-loaded-change', res); setTimeout(res, 5000); });
      if (l.lightTok !== tok) { viewer.world.removeItem(next); return; }
      l.lightFade = true;
      for (let a = 0.25; a <= 1 && !(eco || SLOW); a += 0.25) {                // krátké prolnutí, šetřící režim rovnou vymění
        const q = lightLevel(l); next.setOpacity(q * a); l.light.setOpacity(q * (1 - a));
        await new Promise((res) => setTimeout(res, 200));
      }
      l.lightFade = false;
    }
    next.setOpacity(lightLevel(l)); viewer.world.removeItem(l.light); l.light = next;
  }
  function applyTime() {
    const t = state.night;
    const warm = Math.max(0, 1 - Math.abs(t - 0.42) / 0.32) * 0.8;
    if (warmItem) warmItem.setOpacity(warm * 0.32);
    if (darkItem) darkItem.setOpacity(smooth(0.35, 0.95, t) * 0.78);
    for (const l of LAYERS) if (l.light && !l.lightFade) l.light.setOpacity(lightLevel(l));
    const d = smooth(0.35, 0.95, t);
    const mix = (a, b) => Math.round(a + (b - a) * d);
    $('map').style.background = $('osd').style.background = `rgb(${mix(27 + warm * 30, 9)},${mix(35 + warm * 12, 12)},${mix(51, 24)})`;
    $('mTime').textContent = t < 0.25 ? 'Den' : t < 0.7 ? 'Soumrak' : 'Noc';
  }
  function applyVisibility() {
    for (const l of LAYERS) if (l.day) l.day.setOpacity(layerOpacity(l));
    for (const l of LAYERS) for (const e of Object.values(l.extra || {})) if (e.it) e.it.setOpacity(layerOpacity(l));
    for (const p of OV.places) if (p.el) p.el.hidden = !shown(p.k);
    for (const n of OV.neighbors || []) if (n.el) n.el.hidden = !shown(n.k);
    for (const n of OV.needs || []) if (n.el) n.el.hidden = !state.wip;
    document.querySelectorAll('[data-wip]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.wip === '1') === state.wip)));
    if (typeof renderPlaces === 'function') renderPlaces();
    applyTime();
    if (typeof loadVisible === 'function' && ready) loadVisible();
  }
  function setSeason(s) {
    document.querySelectorAll('[data-s]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.s === s)));
    if (s === state.season && ready) return;
    const wasWinter = state.season === 'winter';
    state.season = s;
    if (s === 'winter' && state.weather === 'clear') setWeather('snow');
    if (wasWinter && s !== 'winter' && state.weather === 'snow') setWeather('clear');
    setWeather(state.weather);
    if (!ready) return;
    addPreview(s).then(reorder);
    // každý čtverec drží jako podklad poslední úplně načtenou vrstvu (l.base) a nad ní novou (l.day);
    // podklad se smaže až po úplném načtení nové, i kdyby to bylo až po posunu mapy. Jinak by v bližším čtverci
    // zůstala díra a byl by vidět řez zeminou vzdálenějšího. Nejvýš dvě vrstvy na čtverec.
    LAYERS.forEach((l) => {
      const gen = l.gen = (l.gen || 0) + 1;
      viewer.addTiledImage({ tileSource: l.src(s), x: l.x, y: l.y, width: l.w, opacity: layerOpacity(l), success: (e) => {
        if (gen !== l.gen) { viewer.world.removeItem(e.item); return; }        // mezitím přepnuto jinam: pozdní vrstva pryč
        if (l.day && l.day !== l.base) viewer.world.removeItem(l.day);        // nedonačtená mezivrstva (podklad zůstává)
        l.day = e.item; reorder();                                           // hned na správné místo, ne navrch všeho
        const settle = () => {
          if (l.day !== e.item || !e.item.getFullyLoaded()) return;
          if (l.base && l.base !== e.item) viewer.world.removeItem(l.base);
          l.base = e.item; reorder();
        };
        if (e.item.getFullyLoaded()) settle(); else e.item.addHandler('fully-loaded-change', settle);
      } });
    });
    loadMini();
    applyExtras();
  }
  const snowAllowed = () => state.season === 'autumn' || state.season === 'winter';
  function setWeather(w) {
    if (w === 'snow' && !snowAllowed()) w = 'clear';
    state.weather = w;
    const sb = document.querySelector('[data-w="snow"]');
    sb.disabled = !snowAllowed(); sb.title = snowAllowed() ? '' : 'Sníh jen na podzim a v zimě';
    document.querySelectorAll('[data-w]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.w === w)));
  }
  document.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', () => { if (b.dataset.s !== state.season) $('realWeather').checked = false; setSeason(b.dataset.s); }));
  const saveRW = (v) => { try { localStorage.setItem('izo-realweather', v ? '1' : '0'); } catch {} };
  document.querySelectorAll('[data-w]').forEach((b) => b.addEventListener('click', () => { $('realWeather').checked = false; saveRW(false); setWeather(b.dataset.w); }));
  // sníh na zemi rozhoduje o vzhledu: od 2 cm zimní dlaždice, v zimě bez sněhu podzimní (jiné bez sněhu nejsou)
  applyRealWeather = () => {
    const on = $('realWeather').checked;
    if (on && realSnow !== null) setSeason(realSnow ? 'winter' : calSeason === 'winter' ? 'autumn' : calSeason);
    if (on && realWeather) setWeather(realWeather);
    $('airRow').hidden = !(on && realPm !== null);
    if (realPm !== null) $('airRow').textContent = `Ovzduší: PM2,5 ${Math.round(realPm)} µg/m³ (model CAMS)`;
  };
  $('realWeather').addEventListener('change', (e) => { saveRW(e.target.checked); applyRealWeather(); });
  if ({{POCASI}}) {
    $('realWeatherRow').hidden = false;
    let rwOff = false; try { rwOff = localStorage.getItem('izo-realweather') === '0'; } catch {}
    $('realWeather').checked = !pinnedView && !rwOff;
  }
  document.querySelectorAll('[data-wip]').forEach((b) => b.addEventListener('click', () => { state.wip = b.dataset.wip === '1'; applyVisibility(); viewer.viewport.fitBounds(homeBounds()); }));
  document.querySelectorAll('[data-wip]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.wip === '1') === state.wip)));
  setSeason(state.season); setWeather(state.weather); applyRealWeather();
  $('night').value = Math.round(state.night * 100);
  $('night').addEventListener('input', (e) => { state.night = e.target.value / 100; $('realTime').checked = false; saveRT(false); applyTime(); setLightStage('lights'); });
  // denní doba podle skutečné výšky slunce nad městem (vypnutí si pamatuje prohlížeč)
  function sunAlt(d) {
    const rad = Math.PI / 180, lat = OV.cam.lat0, lon = OV.cam.lon0;
    const day = (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5;
    const dec = -23.44 * Math.cos(2 * Math.PI / 365 * (day + 10)) * rad;
    const hour = d.getUTCHours() + d.getUTCMinutes() / 60 + lon / 15 - 12;          // sluneční čas
    const ha = hour * 15 * rad;
    return Math.asin(Math.sin(lat * rad) * Math.sin(dec) + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(ha)) / rad;
  }
  const nightFromSun = (a) => (a > 8 ? 0 : a > 0 ? 0.42 * (1 - a / 8) + 0.0 : a > -7 ? 0.42 + 0.58 * (-a / 7) : 1);
  const saveRT = (v) => { try { localStorage.setItem('izo-realtime', v ? '1' : '0'); } catch {} };
  function tickReal() {
    if (!$('realTime').checked) return;
    state.night = Math.round(nightFromSun(sunAlt(new Date())) * 100) / 100; $('night').value = Math.round(state.night * 100); applyTime(); if (ready) setLightStage(wantStage());
  }
  $('realTime').addEventListener('change', (e) => { saveRT(e.target.checked); tickReal(); setLightStage(wantStage()); });
  // výchozí stav: období a denní doba podle skutečnosti; odkaz s obdobím nebo denní dobou a vlastní vypnutí mají přednost
  let realOff = false;
  try { realOff = localStorage.getItem('izo-realtime') === '0'; } catch {}
  if (!pinnedView && !realOff) { $('realTime').checked = true; tickReal(); }
  setInterval(tickReal, 60000);
  $('mTime').addEventListener('click', () => { $('realTime').checked = false; saveRT(false); state.night = state.night < 0.25 ? 0.42 : state.night < 0.7 ? 1 : 0; $('night').value = Math.round(state.night * 100); applyTime(); setLightStage('lights'); });


  // ---------- navigace, hledání ----------
  function goTo(ix, iy, zoomImg = 1.6) {
    viewer.viewport.panTo(new OpenSeadragon.Point(ix / W, iy / W));
    viewer.viewport.zoomTo(zoomImg * W / viewer.viewport.getContainerSize().x);
    if (isMobile()) setMenu(false);
  }
  const placesUl = $('places');
  const placesAbc = [...myPlaces].sort((a, b) => a.name.localeCompare(b.name, 'cs'));
  var renderPlaces = () => {
    placesUl.replaceChildren();
    for (const p of placesAbc) {
      if (!shown(p.k)) continue;
      const li = document.createElement('li'); const b = document.createElement('button'); b.type = 'button'; b.textContent = p.name;
      b.addEventListener('click', () => { goTo(p.xy[0], p.xy[1], 1.4); showCard({ title: p.name, text: p.text, lon: p.lon, lat: p.lat, k: p.k, rows: [] }); });
      li.appendChild(b); placesUl.appendChild(li);
    }
  };
  renderPlaces();
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const index = [];
  for (const n of OV.neighbors || []) {
    if (OBEC && n.obec && n.obec !== OBEC) continue;
    index.push({ label: n.name, kind: 'soused', k: n.k, n: norm(n.name), go: () => { goTo(n.xy[0], n.xy[1], 1.4); showCard({ title: n.name, text: n.text || 'Sousední izometrická mapa.', lon: n.lon, lat: n.lat, k: n.k, link: neighborHref(n), linkText: `Přejít na mapu ${n.name} ↗`, target: n.target, rows: [['Sousední mapa', n.name]] }); } });
  }
  for (const p of OV.places) index.push({ label: p.name, kind: 'místo', k: p.k, n: norm(p.name), go: () => { goTo(p.xy[0], p.xy[1], 1.4); showCard({ title: p.name, text: p.text, lon: p.lon, lat: p.lat, k: p.k, rows: [] }); } });
  for (const s of OV.streets) index.push({ label: s.name, kind: 'ulice', k: s.k, n: norm(s.name), go: () => goTo(s.xy[0], s.xy[1], 0.9) });
  // adresy celé mapy jsou ve zvláštním souboru, načtou se při prvním psaní do hledání
  let addrLoad = null;
  const loadAddr = () => addrLoad || (addrLoad = fetch('search.json').then((r) => r.json()).then((A) => {
    for (const [a, k, cx, cy, i, kind] of A) index.push({ label: a, kind: kind || 'adresa', k, n: norm(a), go: () => { goTo(cx, cy, 2); loadChunk(k).then((c) => c && showBuilding(c.buildings[i])); } });
  }).catch(() => {}));
  $('q').addEventListener('focus', loadAddr);
  let res = [], cur = -1;
  function renderResults() {
    const ul = $('results'); ul.replaceChildren();
    res.forEach((r, i) => {
      const li = document.createElement('li'); const b = document.createElement('button'); b.type = 'button';
      if (i === cur) b.className = 'on';
      const s1 = document.createElement('span'); s1.textContent = r.label; const s2 = document.createElement('small'); s2.textContent = r.kind;
      b.append(s1, s2); b.addEventListener('click', () => pick(r)); li.appendChild(b); ul.appendChild(li);
    });
  }
  function pick(r) { r.go(); $('q').value = r.label; res = []; cur = -1; renderResults(); }
  $('q').addEventListener('input', (e) => {
    const q = norm(e.target.value.trim());
    cur = -1;
    if (q.length < 2) { res = []; renderResults(); return; }
    if (!addrLoad) { loadAddr().then(() => e.target.dispatchEvent(new Event('input'))); }
    const pool = index.filter((r) => shown(r.k)), seenL = new Set();
    const starts = pool.filter((r) => r.n.startsWith(q)), inside = pool.filter((r) => !r.n.startsWith(q) && r.n.includes(q));
    const order = { 'místo': 0, 'zastávka': 0.5, budova: 1, ulice: 2, adresa: 3 };
    res = [...starts, ...inside].filter((r) => !seenL.has(r.kind + r.label) && seenL.add(r.kind + r.label)).sort((a, b) => (a.n.startsWith(q) === b.n.startsWith(q) ? order[a.kind] - order[b.kind] : 0)).slice(0, 8);
    renderResults();
  });
  $('q').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { cur = Math.min(res.length - 1, cur + 1); renderResults(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { cur = Math.max(0, cur - 1); renderResults(); e.preventDefault(); }
    if (e.key === 'Enter' && res.length) pick(res[Math.max(cur, 0)]);
    if (e.key === 'Escape') { res = []; renderResults(); }
  });

  const zbtn = (id, f) => $(id).addEventListener('click', f);
  zbtn('zin', () => viewer.viewport.zoomBy(1.6));
  zbtn('zout', () => viewer.viewport.zoomBy(1 / 1.6));
  if (HOME_VIEW && !HOME_ALL) $('home').title = 'Výchozí pohled';
  zbtn('home', () => goHome());
  // Tlačítko Zpět (a gesto zpět na Androidu) zavře otevřené okno místo odchodu z webu: otevření okna přidá záznam do historie
  for (const d of document.querySelectorAll('dialog')) {
    const sm = d.showModal.bind(d);
    d.showModal = () => { if (d.open) return; sm(); uiDepth++; try { history.pushState({ ui: uiDepth }, ''); } catch {} };
    d.addEventListener('close', () => { if (uiPop || !uiDepth) return; uiDepth--; uiBackAt = Date.now(); uiSelf++; history.back(); });
  }
  addEventListener('popstate', () => {
    if (uiSelf) { uiSelf--; return; }                     // krok zpět po zavření okna tlačítkem: nezavírat další (vnořené) okno
    if (!uiDepth) return;
    uiDepth--; uiBackAt = Date.now(); uiPop = true;
    const ds = [...document.querySelectorAll('dialog[open]')]; if (ds.length) ds[ds.length - 1].close();
    uiPop = false;
  });
  $('help').addEventListener('click', (e) => { e.stopPropagation(); $('helpDlg').showModal(); });
  $('helpClose').addEventListener('click', () => $('helpDlg').close());
  $('helpDlg').addEventListener('click', (e) => { if (e.target === $('helpDlg')) $('helpDlg').close(); });
  // přidání na plochu: návod podle zařízení; Chrome na Androidu a počítači nabídne rovnou svoje okno instalace
  {
    const ua = navigator.userAgent, os = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'ios' : /Android/.test(ua) ? 'android' : 'pc';
    let prompt = null;
    if (matchMedia('(display-mode: standalone)').matches || navigator.standalone) $('plochaBtn').hidden = true;   // už běží jako aplikace
    addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); prompt = e; });
    addEventListener('appinstalled', () => { prompt = null; $('plochaBtn').hidden = true; $('plochaDlg').close(); });
    $('plochaBtn').addEventListener('click', () => {
      $('plInstall').hidden = !prompt;
      document.querySelectorAll('#plochaDlg [data-os]').forEach((el) => { el.hidden = el.dataset.os !== os; });
      $('plochaDlg').showModal();                       // nad nápovědou; po zavření se vrátí do ní
    });
    $('plochaGo').addEventListener('click', async () => { if (!prompt) return; prompt.prompt(); await prompt.userChoice.catch(() => {}); prompt = null; $('plInstall').hidden = true; });
    $('plochaClose').addEventListener('click', () => $('plochaDlg').close());
    $('plochaDlg').addEventListener('click', (e) => { if (e.target === $('plochaDlg')) $('plochaDlg').close(); });
  }
  // sdílení: odkaz obsahuje polohu, přiblížení, roční období a denní dobu (#zima-noc@50.77,15.06,0.8)
  async function share() {
    const tok = [{ spring: 'jaro', summer: 'leto', autumn: 'podzim', winter: 'zima' }[state.season]];
    if (state.night > 0.7) tok.push('noc'); else if (state.night > 0.25) tok.push('soumrak');
    const url = `${location.origin}${location.pathname}#${tok.join('-')}@${(location.hash.split('@')[1] || '')}`;
    const toast = (t) => { $('toast').textContent = t; $('toast').hidden = false; clearTimeout(share.t); share.t = setTimeout(() => { $('toast').hidden = true; }, 2200); };
    try {
      if (navigator.share && isMobile()) { await navigator.share({ title: document.title, url }); return; }
      await navigator.clipboard.writeText(url); toast('Odkaz na tento pohled je zkopírovaný');
    } catch (e) {
      if (e && e.name === 'AbortError') return;                  // člověk sdílení zavřel: nic nehlásit
      try {                                                      // vestavěné prohlížeče bez schránky: starý způsob kopírování
        const ta = document.createElement('textarea'); ta.value = url; ta.style.cssText = 'position:fixed;opacity:0'; document.body.append(ta); ta.select();
        const ok = document.execCommand('copy'); ta.remove();
        toast(ok ? 'Odkaz na tento pohled je zkopírovaný' : url);
      } catch { toast(url); }
    }
  }
  zbtn('share', share); zbtn('mShare', share);
  function setMenu(open) { $('panel').classList.toggle('closed', !open); $('menu').setAttribute('aria-expanded', String(open)); $('menu').textContent = open ? 'Skrýt' : 'Menu'; }
  $('menu').addEventListener('click', () => setMenu($('panel').classList.contains('closed')));
  // desktop: panel jde zasunout ouškem vpravo od něj, stav si pamatuje prohlížeč
  function setFold(f) {
    document.body.classList.toggle('folded', f);
    const t = f ? 'Vysunout panel' : 'Zasunout panel';
    $('fold').textContent = f ? '›' : '‹'; $('fold').title = t; $('fold').setAttribute('aria-label', t); $('fold').setAttribute('aria-expanded', String(!f));
    $('panel').inert = f && !isMobile();
    try { localStorage.setItem('izo-fold', f ? '1' : '0'); } catch {}
  }
  $('fold').addEventListener('click', () => setFold(!document.body.classList.contains('folded')));
  new ResizeObserver(() => document.documentElement.style.setProperty('--pw', $('panel').offsetWidth + 'px')).observe($('panel'));
  try { if (localStorage.getItem('izo-fold') === '1' && !isMobile()) setFold(true); } catch {}
  if (isMobile()) { setMenu(false); $('placesBox').open = false; }
  $('l-labels').addEventListener('change', (e) => $('map').classList.toggle('nolabels', !e.target.checked));


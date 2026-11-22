  // počasí: částice v souřadnicích obrazovky
  const drops = Array.from({ length: 420 }, (_, i) => ({ x: rnd(i * 2.1), y: rnd(i * 3.7), v: 0.6 + rnd(i * 5.3) * 0.5, s: rnd(i * 7.1) }));
  const fogTex = (() => { const c = document.createElement('canvas'); c.width = 48; c.height = 28; const g = c.getContext('2d');
    for (let y = 0; y < 28; y++) for (let x = 0; x < 48; x++) { const v = (Math.sin(x * 0.35) + Math.sin(y * 0.6 + x * 0.12) + Math.sin((x + y) * 0.21)) / 3; g.fillStyle = `rgba(226,232,240,${(0.18 + 0.2 * Math.max(0, v)).toFixed(3)})`; g.fillRect(x, y, 1, 1); }
    return c; })();

  let last = performance.now(), skip = false, miniKey = '', scaleTxt = '';
  // úsporný režim: když prohlížeč pár sekund nestíhá (víc než čtvrtina snímků přes 34 ms), přepne na hrubší dlaždice,
  // méně souběžných stahování a animace na 30 fps. Platí do zavření karty.
  let eco = false, perfN = 0, perfSlow = 0, perfW = 0, perfT0 = performance.now() + 8000;   // prvních 8 s se načítá, neměřit
  try { eco = sessionStorage.getItem('izo-eco') === '1'; } catch {}
  function setEco() {
    eco = true;
    try { sessionStorage.setItem('izo-eco', '1'); } catch {}
    viewer.minPixelRatio = Math.max(viewer.minPixelRatio || 0, 1.2);
    for (let i = 0; i < viewer.world.getItemCount(); i++) viewer.world.getItemAt(i).minPixelRatio = viewer.minPixelRatio;
    if (viewer.imageLoader) viewer.imageLoader.jobLimit = 4;
    viewer.forceRedraw();
  }
  if (eco) setEco();
  function perf(ms) {
    if (eco || document.hidden || ms > 250 || performance.now() < perfT0) return;   // dlouhá pauza = skrytá karta, ne pomalost
    const now = performance.now(); if (!perfN) perfW = now;
    perfN++; if (ms > 34) perfSlow++;
    if (now - perfW > 3000) { if (perfN > 20 && perfSlow / perfN > 0.25) setEco(); perfN = perfSlow = 0; }   // okno 3 s
  }

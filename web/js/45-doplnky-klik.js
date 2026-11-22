  const pluginRegistry = {}, pluginLibs = {}, pluginClicks = [], pluginFrames = [];
  let pluginCapture = false, pluginCursor = '';
  const runFrameLayer = (layerName, view, t) => {
    if (!view) return;
    for (const h of [...pluginFrames]) {
      if (h.layer !== layerName) continue;
      ctx.save();
      try { h.fn(ctx, view, t); } catch (err) { console.error(err); } finally { ctx.restore(); }
    }
  };
  viewer.addHandler('canvas-click', (e) => {
    if (!e.quick) return;
    if (pluginClicks.length || pluginCapture) {
      const [ix, iy] = vpToImg(e.position);
      const evt = { x: ix, y: iy, screenX: e.position.x, screenY: e.position.y, originalEvent: e };
      let handled = false;
      for (const h of pluginClicks) if (h.fn(evt) === true) { handled = true; break; }
      if (handled || pluginCapture) return;
    }
    if (typeof PLANES !== 'undefined') {
      const pl = PLANES.drawn.find((q) => Math.hypot(q[0] - e.position.x, q[1] - e.position.y) < 26);
      if (pl) { planeFollow(pl[2]); return; }
    }
    const v = MHD.drawn.find((q) => Math.hypot(q[0] - e.position.x, q[1] - e.position.y) < 18);
    if (v) { mhdFollow(v[2]); return; }
    const [ix, iy] = vpToImg(e.position);
    const st = stopAt(ix, iy);
    if (st) { showStop(st); return; }
    const b = hit(ix, iy);
    if (b) showBuilding(b); else showPoint(ix, iy);
  });
  $('osd').addEventListener('pointermove', (e) => {
    if (pluginCursor || pluginCapture) { state.hover = null; $('osd').style.cursor = pluginCursor; return; }
    const r = $('osd').getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    if (typeof PLANES !== 'undefined') {
      PLANES.hover = PLANES.drawn.find((q) => Math.hypot(q[0] - mx, q[1] - my) < 26)?.[2] || null;
      if (PLANES.hover) { $('osd').style.cursor = 'pointer'; return; }
    }
    if (!$('l-hover').checked || e.pointerType === 'touch') { state.hover = null; $('osd').style.cursor = ''; return; }
    const [ix, iy] = vpToImg(new OpenSeadragon.Point(mx, my));
    state.hover = hit(ix, iy);
    $('osd').style.cursor = state.hover || stopAt(ix, iy) ? 'pointer' : '';
  });



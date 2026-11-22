  window.Izomapa = {
    libs: pluginLibs,
    registerLib(id, api) { if (id) pluginLibs[id] = api; },
    getLib: (id) => pluginLibs[id] ?? null,
    getPluginData: (id) => OV.doplnky?.[id]?.data ?? null,
    getPluginConfig: (id) => OV.doplnky?.[id]?.config ?? {},
    registerPlugin(id, inst) {
      if (pluginRegistry[id]?.onDestroy) try { pluginRegistry[id].onDestroy(); } catch {}
      pluginRegistry[id] = inst || {};
      if (inst?.onInit) { if (ready) inst.onInit(window.Izomapa); else layersReady.then(() => inst.onInit(window.Izomapa)); }
    },
    onMapClick(fn, options = { priority: 0 }) {
      const entry = { fn, priority: options?.priority ?? 0 };
      pluginClicks.push(entry); pluginClicks.sort((a, b) => b.priority - a.priority);
      return () => { const i = pluginClicks.indexOf(entry); if (i >= 0) pluginClicks.splice(i, 1); };
    },
    onFrame(fn, options = {}) {
      if (typeof fn !== 'function') return () => {};
      const layer = options?.layer === 'world' || options?.layer === 'top' ? options.layer : 'sky';
      const entry = { fn, layer, priority: options?.priority ?? 0 };
      pluginFrames.push(entry); pluginFrames.sort((a, b) => b.priority - a.priority);
      return () => { const i = pluginFrames.indexOf(entry); if (i >= 0) pluginFrames.splice(i, 1); };
    },
    setClickCapture(en) { pluginCapture = Boolean(en); },
    setCursor(cur) { pluginCursor = cur || ''; $('osd').style.cursor = pluginCursor; },
    setPinsVisible(vis) { document.body.classList.toggle('plugins-hide-pins', !vis); },
    getPluginLayer(id) {
      let el = $('pluginLayers').querySelector(`[data-plugin="${id}"]`);
      if (!el) { el = document.createElement('div'); el.dataset.plugin = id; el.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;'; $('pluginLayers').appendChild(el); }
      return el;
    },
    getView() { const c = viewer.viewport.getCenter(true); return { x: c.x * W, y: c.y * W, zoom: viewer.viewport.getZoom(true) }; },
    getCam: () => ({ ...cam, w: W, h: Hh }),
    toImg: (x, y, h = 0) => toImg(x, y, h),
    imgToWorld: (ix, iy) => imgToWorld(ix, iy),
    gz: (x, y) => gz(x, y),
    latLonToWorld: (lat, lon) => [(lon - cam.lon0) * cam.kx, (lat - cam.lat0) * cam.ky],
    worldToLatLon: (x, y) => { const [lon, lat] = lonlat(x, y); return [lat, lon]; },
    latLonToImg: (lat, lon, hOffset = 0) => { const x = (lon - cam.lon0) * cam.kx, y = (lat - cam.lat0) * cam.ky; return toImg(x, y, gz(x, y) + hOffset); },
    panTo(x, y, zoom, animated = true) {
      if (Number.isFinite(x) && Number.isFinite(y)) viewer.viewport.panTo(new OpenSeadragon.Point(x / W, y / W), !animated);
      if (Number.isFinite(zoom)) viewer.viewport.zoomTo(zoom, null, !animated);
    },
    getEnvironment: () => ({ night: state.night, rain: state.weather === 'rain', weather: state.weather, season: state.season, realTime: $('realTime').checked, realWeather: $('realWeather').checked }),
    setEnvironment(env = {}) {
      if (env.season) setSeason(env.season);
      if (env.realWeather !== undefined) { $('realWeather').checked = Boolean(env.realWeather); if (env.realWeather) applyRealWeather(); }
      else if (env.weather !== undefined || env.rain !== undefined) $('realWeather').checked = false;
      const w = env.weather !== undefined ? env.weather : (env.rain !== undefined ? (env.rain ? 'rain' : 'clear') : undefined);
      if (w !== undefined) setWeather(w);
      if (env.realTime !== undefined) { $('realTime').checked = Boolean(env.realTime); if (env.realTime) tickReal(); }
      else if (typeof env.night === 'number') $('realTime').checked = false;
      if (typeof env.night === 'number') { state.night = Math.max(0, Math.min(1, env.night)); $('night').value = Math.round(state.night * 100); applyTime(); }
    },
    getUiSlot(slotName = 'sidebar-tabs') { return slotName === 'sidebar-tabs' ? $('pluginTabsSlot') : null; },
  };
  if (OV.doplnky && Object.keys(OV.doplnky).length) {
    const loadedStyles = new Set(), loadedScripts = new Map();
    const loadStyle = (href) => {
      if (!href || loadedStyles.has(href)) return;
      loadedStyles.add(href);
      const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l);
    };
    const loadScript = (src) => {
      if (!src) return Promise.resolve();
      if (loadedScripts.has(src)) return loadedScripts.get(src);
      const p = new Promise((resolve) => {
        const s = document.createElement('script'); s.src = src; s.async = false;
        s.onload = () => resolve(true);
        s.onerror = () => { console.warn('Nepodařilo se načíst skript doplňku:', src); resolve(false); };
        document.body.appendChild(s);
      });
      loadedScripts.set(src, p);
      return p;
    };
    layersReady.then(async () => {
      const list = Object.values(OV.doplnky);
      const libUrls = [];
      for (const p of list) {
        for (const href of p.lib_styles || []) loadStyle(href);
        for (const src of p.lib_scripts || []) if (!libUrls.includes(src)) libUrls.push(src);
      }
      if (libUrls.length) await Promise.all(libUrls.map(loadScript));
      for (const p of list) {
        for (const href of p.styles || []) loadStyle(href);
        for (const src of p.scripts || []) loadScript(src);
      }
    });
  }
})();

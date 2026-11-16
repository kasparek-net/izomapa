(() => {
  const PLUGIN_ID = 'vzor_doplnku';
  const Izomapa = window.Izomapa;
  if (!Izomapa) return;

  let unsubFrame = null, unsubClick = null, tabBtn = null, panel = null;

  Izomapa.registerPlugin(PLUGIN_ID, {
    onInit(api) {
      const data = api.getPluginData(PLUGIN_ID);
      const cfg = api.getPluginConfig(PLUGIN_ID);
      if (!data) return;

      const profanity = api.getLib('profanity');
      const serverClient = api.getLib('server_client');
      const remote = cfg.server_url && serverClient ? serverClient.createClient(cfg.server_url) : null;
      const points = [...(data.points || [])];

      tabBtn = document.createElement('button');
      tabBtn.type = 'button';
      tabBtn.className = 'vzor-tab';
      tabBtn.textContent = '★';
      tabBtn.title = data.title || PLUGIN_ID;
      api.getUiSlot('sidebar-tabs')?.appendChild(tabBtn);

      panel = document.createElement('aside');
      panel.className = 'vzor-panel';
      panel.hidden = true;
      panel.innerHTML = `
        <strong data-role="title"></strong>
        <input class="vzor-input" type="text" maxlength="40" placeholder="Popisek nového bodu…" data-role="note">
        <button type="button" class="px-btn" data-role="toggle">Přidat bod kliknutím</button>
        <p class="vzor-status" data-role="status">Klikni na mapu nebo bod.</p>
      `;
      panel.querySelector('[data-role="title"]').textContent = data.title || PLUGIN_ID;
      document.body.appendChild(panel);

      const noteEl = panel.querySelector('[data-role="note"]');
      const statusEl = panel.querySelector('[data-role="status"]');
      const toggleBtn = panel.querySelector('[data-role="toggle"]');
      let adding = false;

      // Vykreslení pulzujících bodů přímo do animačního canvasu jádra
      unsubFrame = api.onFrame((ctx, view, t) => {
        if (!points.length || view.sx < 0.15) return;
        const pulse = 1 + 0.2 * Math.sin(t * 4);
        for (const pt of points) {
          const [ix, iy] = pt.xy;
          if (!view.vis(ix, iy, 40)) continue;
          const [sx, sy] = view.toScreen(ix, iy);
          const r = Math.max(4, Math.round(7 * Math.min(1.5, view.sx) * pulse));
          ctx.fillStyle = 'rgba(242, 198, 109, 0.3)';
          ctx.beginPath(); ctx.arc(sx, sy, r + 4, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#f2c66d';
          ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
        }
      }, { layer: 'world' });

      const setAdding = (on) => {
        adding = on;
        api.setClickCapture(on);
        api.setCursor(on ? 'crosshair' : '');
        toggleBtn.textContent = on ? 'Zrušit přidávání' : 'Přidat bod kliknutím';
      };

      tabBtn.addEventListener('click', () => {
        panel.hidden = !panel.hidden;
        if (panel.hidden) setAdding(false);
        else if (points[0]?.xy) api.panTo(points[0].xy[0], points[0].xy[1]);
      });

      toggleBtn.addEventListener('click', () => setAdding(!adding));

      unsubClick = api.onMapClick(async (e) => {
        if (!adding) return false;
        const label = noteEl.value.trim() || `Bod ${points.length + 1}`;
        if (profanity && !profanity.isValid(label)) {
          statusEl.textContent = 'Popisek obsahuje nevhodný výraz.';
          return true;
        }
        const item = { id: `p${points.length + 1}`, label, xy: [Math.round(e.x), Math.round(e.y)] };
        points.push(item);
        if (remote) {
          const res = await remote.call('add_point', item);
          statusEl.textContent = res.ok ? `Odesláno na server: ${label}` : `Chyba serveru: ${res.message}`;
        } else {
          statusEl.textContent = `Přidán bod: ${label}`;
        }
        noteEl.value = '';
        setAdding(false);
        return true;
      }, { priority: 10 });
    },
    onDestroy() {
      if (unsubFrame) unsubFrame();
      if (unsubClick) unsubClick();
      tabBtn?.remove();
      panel?.remove();
    },
  });
})();

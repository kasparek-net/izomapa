  // ---------- letadla (ADS-B z adsb.lol přes api/flights, v úrovni mraků a nad nimi) ----------
  const PLANESPR = new Map(), PLANESH = new Map();
  function planeSprite(cat, k) {
    const key = `${cat}|${k}`;
    if (PLANESPR.has(key)) return PLANESPR.get(key);
    const a = k / NDIR * Math.PI * 2, fx_ = Math.cos(a), fy_ = Math.sin(a), sxv = -fy_, syv = fx_;
    const O = toImg(0, 0, 0), R = (s, t, h) => { const p = toImg(fx_ * s + sxv * t, fy_ * s + syv * t, h); return [p[0] - O[0], p[1] - O[1]]; };
    const vis = (nx, ny) => nx + ny < 0;
    const sun = (nx, ny, nz) => nx * SUNV[0] + ny * SUNV[1] + nz * SUNV[2];
    const faces = [];
    const Q = (pts, rgb, normal) => {
      const d = normal ? sun(normal[0], normal[1], normal[2]) : 0;
      faces.push({ pts: pts.map((p) => R(p[0], p[1], p[2])), col: lit(rgb, d), depth: pts.reduce((acc, p) => acc + (fx_ * p[0] + sxv * p[1]) + (fy_ * p[0] + syv * p[1]) - p[2] * 1.5, 0) / pts.length });
    };

    if (cat === 'jet') {
      const WH = [246, 248, 252], BELLY = [208, 214, 224], WING = [224, 228, 234], FIN = [26, 78, 146], GL = [40, 52, 70], ENG = [170, 175, 184];
      const l = 14, w = 13, r = 1.25, h0 = 0;
      const ring = (s, scale = 1, zOff = 0) => [
        [s, 0, h0 + zOff + r * scale * 1.1],
        [s, -r * scale * 0.9, h0 + zOff + r * scale * 0.5],
        [s, -r * scale * 0.9, h0 + zOff - r * scale * 0.5],
        [s, 0, h0 + zOff - r * scale * 0.9],
        [s, r * scale * 0.9, h0 + zOff - r * scale * 0.5],
        [s, r * scale * 0.9, h0 + zOff + r * scale * 0.5],
      ];
      const sections = [
        [l, 0.05, 0], [l - 2, 0.55, 0.05], [l - 4.5, 0.9, 0], [7, 1, 0],
        [-6, 1, 0], [-10, 0.85, 0.15], [-14, 0.15, 0.35]
      ];
      const rings = sections.map(([s, sc, zOff]) => ring(s, sc, zOff));
      for (let i = 0; i < rings.length - 1; i++) {
        const A = rings[i], B = rings[i + 1];
        for (let j = 0; j < 6; j++) {
          const j2 = (j + 1) % 6;
          const p1 = A[j], p2 = A[j2], p3 = B[j2], p4 = B[j];
          const mx = (p1[1] + p2[1]) / 2, mz = (p1[2] + p2[2]) / 2;
          const isBottom = j === 2 || j === 3;
          const isCockpit = i === 1 && (j === 0 || j === 1 || j === 5);
          const col = isCockpit ? GL : isBottom ? BELLY : WH;
          const normLocal = [i === 0 ? 0.6 : i === rings.length - 2 ? -0.4 : 0, mx < 0 ? -0.8 : mx > 0 ? 0.8 : 0, mz < h0 ? -0.7 : 0.7];
          const nx = fx_ * normLocal[0] + sxv * normLocal[1], ny = fy_ * normLocal[0] + syv * normLocal[1];
          if (vis(nx, ny) || normLocal[2] > 0.4) Q([p1, p2, p3, p4], col, [nx, ny, normLocal[2]]);
        }
      }
      const wRootF = 2.5, wRootB = -3.2, wTipF = -4.5, wTipB = -6.2;
      for (const side of [-1, 1]) {
        const rw = side * 1.1, tw = side * w;
        const W1 = [wRootF, rw, 0], W2 = [wTipF, tw, 0.25], W3 = [wTipB, tw, 0.25], W4 = [wRootB, rw, 0];
        Q([W1, W2, W3, W4], WING, [0, 0, 1]);
        Q([W4, W3, W2, W1], BELLY, [0, 0, -1]);
        Q([W2, [wTipF + 0.3, tw + side * 0.1, 1.2], [wTipB, tw + side * 0.1, 1.2], W3], FIN, [0, side * 0.8, 0.6]);
      }
      for (const side of [-1, 1]) {
        const ew = side * 4.6, ez = -0.9, elen = 3.2, er = 0.75;
        const M1 = [1.2, ew - er, ez - er], M2 = [1.2, ew + er, ez - er], M3 = [1.2, ew + er, ez + er], M4 = [1.2, ew - er, ez + er];
        const B1 = [1.2 - elen, ew - er, ez - er], B2 = [1.2 - elen, ew + er, ez - er], B3 = [1.2 - elen, ew + er, ez + er], B4 = [1.2 - elen, ew - er, ez + er];
        Q([M1, M2, M3, M4], GL, [fx_, fy_, 0]);
        Q([M2, B2, B3, M3], WH, [sxv * side, syv * side, 0]);
        Q([M4, B4, B1, M1], WH, [-sxv * side, -syv * side, 0]);
        Q([M3, B3, B4, M4], WH, [0, 0, 1]);
        Q([M1, B1, B2, M2], ENG, [0, 0, -1]);
      }
      const finF = -9.2, finB = -13.5, finTop = 4.8;
      Q([[finF, -0.12, 0.8], [finB + 1.2, -0.08, finTop], [finB, -0.08, finTop], [finB, -0.12, 0.6]], FIN, [-sxv, -syv, 0.2]);
      Q([[finB, 0.12, 0.6], [finB, 0.08, finTop], [finB + 1.2, 0.08, finTop], [finF, 0.12, 0.8]], FIN, [sxv, syv, 0.2]);
      for (const side of [-1, 1]) {
        const hw = side * 4.8, hRootF = -10.5, hRootB = -13.2, hTipF = -12.4, hTipB = -13.8;
        Q([[hRootF, side * 0.4, 0.7], [hTipF, hw, 0.8], [hTipB, hw, 0.8], [hRootB, side * 0.4, 0.7]], WING, [0, 0, 1]);
        Q([[hRootB, side * 0.4, 0.7], [hTipB, hw, 0.8], [hTipF, hw, 0.8], [hRootF, side * 0.4, 0.7]], BELLY, [0, 0, -1]);
      }
    } else {
      const WH = [250, 250, 252], RED = [224, 44, 34], GL = [42, 54, 72];
      const l = 4.4, w = 5.6, r = 0.72;
      const P1 = [l, 0, 0], P2 = [l - 1.2, -r, -r * 0.6], P3 = [l - 1.2, r, -r * 0.6], P4 = [l - 1.2, r, r * 0.8], P5 = [l - 1.2, -r, r * 0.8];
      const T2 = [-l, -r * 0.3, 0.2], T3 = [-l, r * 0.3, 0.2], T4 = [-l, r * 0.3, 0.6], T5 = [-l, -r * 0.3, 0.6];
      Q([P1, P3, P4], RED, [fx_, fy_, 0.5]);
      Q([P1, P5, P2], RED, [fx_, fy_, -0.5]);
      Q([[l - 1.2, -r * 0.9, r * 0.8], [l - 1.2, r * 0.9, r * 0.8], [0.6, r * 0.85, 1.05], [0.6, -r * 0.85, 1.05]], GL, [fx_ * 0.7, fy_ * 0.7, 0.7]);
      Q([P3, T3, T4, P4], WH, [sxv, syv, 0]);
      Q([P5, T5, T2, P2], WH, [-sxv, -syv, 0]);
      Q([P2, T2, T3, P3], RED, [0, 0, -1]);
      const wF = 0.8, wB = -0.6;
      for (const side of [-1, 1]) {
        const sw = side * w;
        Q([[wF, 0, 1.05], [wF, sw, 1.08], [wB, sw, 1.08], [wB, 0, 1.05]], WH, [0, 0, 1]);
        Q([[wB, 0, 1.05], [wB, sw, 1.08], [wF, sw, 1.08], [wF, 0, 1.05]], RED, [0, 0, -1]);
        Q([[wF, sw, 1.08], [wF, sw - side * 0.8, 1.08], [wB, sw - side * 0.8, 1.08], [wB, sw, 1.08]], RED, [0, 0, 1]);
      }
      Q([[-l + 1.2, -0.05, 0.5], [-l, -0.05, 2.1], [-l - 0.4, -0.05, 2.1], [-l - 0.3, -0.05, 0.4]], RED, [-sxv, -syv, 0.2]);
      Q([[-l - 0.3, 0.05, 0.4], [-l - 0.4, 0.05, 2.1], [-l, 0.05, 2.1], [-l + 1.2, 0.05, 0.5]], RED, [sxv, syv, 0.2]);
      for (const side of [-1, 1]) {
        const hw = side * 1.8;
        Q([[-l + 0.3, 0, 0.45], [-l, hw, 0.45], [-l - 0.4, hw, 0.45], [-l - 0.2, 0, 0.45]], WH, [0, 0, 1]);
      }
    }

    faces.sort((a, b) => b.depth - a.depth);
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (const f of faces) {
      for (const [px, py] of f.pts) {
        if (px < minX) minX = px; if (px > maxX) maxX = px;
        if (py < minY) minY = py; if (py > maxY) maxY = py;
      }
    }
    const pad = 4;
    const wPx = Math.ceil(maxX - minX + pad * 2), hPx = Math.ceil(maxY - minY + pad * 2);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, wPx); canvas.height = Math.max(1, hPx);
    const g = canvas.getContext('2d');
    g.imageSmoothingEnabled = false;
    const offX = -minX + pad, offY = -minY + pad;
    for (const f of faces) {
      g.beginPath();
      f.pts.forEach(([px, py], idx) => { const x = px + offX, y = py + offY; idx === 0 ? g.moveTo(x, y) : g.lineTo(x, y); });
      g.closePath();
      g.fillStyle = f.col;
      g.fill();
    }
    const shCanvas = document.createElement('canvas');
    shCanvas.width = canvas.width; shCanvas.height = canvas.height;
    const sg = shCanvas.getContext('2d');
    sg.imageSmoothingEnabled = false;
    for (const f of faces) {
      sg.beginPath();
      f.pts.forEach(([px, py], idx) => { const x = px + offX, y = py + offY; idx === 0 ? sg.moveTo(x, y) : sg.lineTo(x, y); });
      sg.closePath();
      sg.fillStyle = 'rgba(15, 22, 35, 0.22)';
      sg.fill();
    }
    const res = { c: canvas, x0: minX - pad, y0: minY - pad };
    PLANESH.set(key, { c: shCanvas, x0: minX - pad, y0: minY - pad });
    PLANESPR.set(key, res);
    return res;
  }

  const PLANES = {
    list: new Map(),
    drawn: [],
    hover: null,
    follow: null,
    lastFetch: 0,
    off: false
  };

  function planeVisualH(p) {
    // V úrovni mraků (~150-220 m) nebo nad nimi (~340-480 m)
    return p.cat === 'light' ? 160 + (p.alt / 2500) * 60 : 340 + (p.alt / 12000) * 140;
  }

  function planeFollow(p) {
    PLANES.follow = (PLANES.follow === p.id ? null : p.id);
    if (PLANES.follow) {
      if (MHD.follow !== null) MHD.follow = null;
      $('follow').hidden = false;
      const b = document.createElement('b'); b.textContent = `✈️ Let ${p.callsign}`;
      $('followTxt').replaceChildren(b, ` · ${p.model || (p.cat === 'jet' ? 'Dopravní letadlo' : 'Sportovní letadlo')} · Výška: ${Math.round(p.alt)}\u00a0m (${Math.round(p.alt * 3.2808)}\u00a0ft) · Rychlost: ${Math.round(p.speed * 3.6)}\u00a0km/h`);
      closeCard();
    } else {
      $('follow').hidden = true;
    }
  }

  function parseFlightData(d) {
    if (d && Array.isArray(d.states)) {
      return d.states.filter((r) => !r[8] && r[5] != null && r[6] != null).map((r) => {
        const alt = r[7] ?? r[13] ?? 8000, speed = r[9] || 200;
        const isLight = alt < 3000 && speed < 110;
        return {
          id: r[0],
          callsign: (r[1] || '').trim() || r[0].toUpperCase(),
          country: r[2] || '',
          lon: r[5], lat: r[6], alt, speed, track: r[10] || 0,
          cat: isLight ? 'light' : 'jet',
          model: ''
        };
      });
    }
    const ac = d?.ac || d?.aircraft;
    if (Array.isArray(ac)) {
      return ac.filter((a) => a.lat != null && a.lon != null && a.alt_baro !== 'ground').map((a) => {
        const alt = (a.alt_geom ?? a.alt_baro ?? 25000) * 0.3048;
        const speed = (a.gs || 400) * 0.5144;
        const isLight = alt < 3000 && speed < 110;
        return {
          id: a.hex || a.flight,
          callsign: (a.flight || '').trim() || (a.r || a.hex || '').trim(),
          country: '',
          lon: a.lon, lat: a.lat, alt, speed, track: a.track || a.mag_heading || 0,
          cat: isLight ? 'light' : 'jet',
          model: a.t || ''
        };
      });
    }
    return null;
  }

  function applyIncomingFlights(incoming) {
    const seen = new Set();
    const now = performance.now();
    for (const f of incoming) {
      seen.add(f.id);
      const tx = (f.lon - cam.lon0) * cam.kx, ty = (f.lat - cam.lat0) * cam.ky;
      let existing = PLANES.list.get(f.id);
      if (existing) {
        existing.x += (tx - existing.x) * 0.35;
        existing.y += (ty - existing.y) * 0.35;
        existing.speed = f.speed;
        existing.track = f.track;
        existing.alt = f.alt;
        existing.lastSeen = now;
      } else {
        PLANES.list.set(f.id, {
          id: f.id, callsign: f.callsign, country: f.country,
          cat: f.cat, model: f.model,
          lon: f.lon, lat: f.lat, alt: f.alt, speed: f.speed, track: f.track,
          x: tx, y: ty, trail: [], lastSeen: now
        });
      }
    }
    for (const [id, p] of PLANES.list) {
      if (!seen.has(id) && (now - p.lastSeen > 45000)) {
        if (PLANES.follow === id) { PLANES.follow = null; $('follow').hidden = true; }
        PLANES.list.delete(id);
      }
    }
  }

  async function fetchFlights() {
    const pad = 0.35;
    const lamin = (cam.lat0 - pad).toFixed(4), lamax = (cam.lat0 + pad).toFixed(4);
    const lomin = (cam.lon0 - pad * 1.5).toFixed(4), lomax = (cam.lon0 + pad * 1.5).toFixed(4);
    try {
      const r = await fetch(`api/flights?lamin=${lamin}&lamax=${lamax}&lomin=${lomin}&lomax=${lomax}`, { signal: AbortSignal.timeout(4500) });
      if (r.status === 404) { PLANES.off = true; return; }
      if (!r.ok) return;
      const incoming = parseFlightData(await r.json());
      if (incoming && incoming.length) applyIncomingFlights(incoming);
    } catch {}
  }

  function stepPlanes(dt, now) {
    if (!PLANES.off && now - PLANES.lastFetch > 20000) {
      PLANES.lastFetch = now;
      fetchFlights();
    }
    for (const [id, p] of PLANES.list) {
      const rad = p.track * Math.PI / 180;
      p.x += Math.sin(rad) * p.speed * dt;
      p.y += Math.cos(rad) * p.speed * dt;
      p.lon = cam.lon0 + p.x / cam.kx;
      p.lat = cam.lat0 + p.y / cam.ky;

      if (p.cat === 'jet' && p.alt > 6500) {
        if (!p.trailT || now - p.trailT > 220) {
          p.trailT = now;
          const k = ((Math.round(Math.atan2(Math.cos(rad), Math.sin(rad)) / (Math.PI * 2) * NDIR) % NDIR) + NDIR) % NDIR;
          const a = k / NDIR * Math.PI * 2, fx_ = Math.cos(a), fy_ = Math.sin(a), sxv = -fy_, syv = fx_;
          const vH = planeVisualH(p);
          const gz0 = gz(p.x, p.y);
          const eL = toImg(p.x + fx_ * 0.5 + sxv * (-4.6), p.y + fy_ * 0.5 + syv * (-4.6), gz0 + vH - 1.0);
          const eR = toImg(p.x + fx_ * 0.5 + sxv * (4.6), p.y + fy_ * 0.5 + syv * (4.6), gz0 + vH - 1.0);
          if (!p.trail) p.trail = [];
          p.trail.push({ l: eL, r: eR, t: now });
        }
      }
      if (p.trail && p.trail.length) {
        const driftX = realWind ? realWind.dx * 6 * dt : 0;
        const driftY = realWind ? realWind.dy * 6 * dt : 0;
        for (const pt of p.trail) {
          pt.l[0] += driftX; pt.l[1] += driftY;
          pt.r[0] += driftX; pt.r[1] += driftY;
        }
        while (p.trail.length && now - p.trail[0].t > 15000) p.trail.shift();
      }

      if (Math.hypot(p.x, p.y) > 55000) {
        if (PLANES.follow === id) { PLANES.follow = null; $('follow').hidden = true; }
        PLANES.list.delete(id);
      }
    }
  }

  function drawPlanes(sx, ox, oy, night, now, cw, ch) {
    PLANES.drawn = [];
    const NL_planes = [];
    const visScreen = (x, y, m = 140) => x > -m && y > -m && x < cw + m && y < ch + m;

    // 1. Kondenzační čáry (contrails)
    for (const [, p] of PLANES.list) {
      if (!p.trail || !p.trail.length) continue;
      for (const side of ['l', 'r']) {
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < p.trail.length; i++) {
          const pt = p.trail[i];
          const age = (now - pt.t) / 1000;
          if (age > 15) continue;
          const X = Math.round(ox + pt[side][0] * sx), Y = Math.round(oy + pt[side][1] * sx);
          if (!started) { ctx.moveTo(X, Y); started = true; } else { ctx.lineTo(X, Y); }
        }
        if (started) {
          ctx.strokeStyle = night > 0.5 ? 'rgba(180, 195, 220, 0.35)' : 'rgba(245, 248, 255, 0.45)';
          ctx.lineWidth = Math.max(1, Math.round(2.5 * sx));
          ctx.stroke();
        }
      }
    }

    // 2. Stíny na terénu
    for (const [, p] of PLANES.list) {
      const vH = planeVisualH(p);
      const shX = p.x - 0.45 * vH, shY = p.y + 0.35 * vH;
      const [six, siy] = toImg(shX, shY, gz(shX, shY));
      const X_sh = Math.round(ox + six * sx), Y_sh = Math.round(oy + siy * sx);
      if (!visScreen(X_sh, Y_sh, 200)) continue;
      const rad = p.track * Math.PI / 180;
      const k = ((Math.round(Math.atan2(Math.cos(rad), Math.sin(rad)) / (Math.PI * 2) * NDIR) % NDIR) + NDIR) % NDIR;
      planeSprite(p.cat, k);
      const shSpr = PLANESH.get(`${p.cat}|${k}`);
      if (shSpr) {
        ctx.globalAlpha = p.cat === 'light' ? 0.16 : 0.08;
        const sW = Math.max(12, Math.round(shSpr.c.width * sx)), sH = Math.max(12, Math.round(shSpr.c.height * sx));
        const scR = sW / shSpr.c.width;
        ctx.drawImage(shSpr.c, Math.round(X_sh + shSpr.x0 * scR), Math.round(Y_sh + shSpr.y0 * scR), sW, sH);
        ctx.globalAlpha = 1.0;
      }
    }

    // 3. Těla letadel
    for (const [id, p] of PLANES.list) {
      const vH = planeVisualH(p);
      const gz0 = gz(p.x, p.y);
      const [pix, piy] = toImg(p.x, p.y, gz0 + vH);
      const X_pl = Math.round(ox + pix * sx), Y_pl = Math.round(oy + piy * sx);
      if (!visScreen(X_pl, Y_pl, 220)) continue;

      const rad = p.track * Math.PI / 180;
      const k = ((Math.round(Math.atan2(Math.cos(rad), Math.sin(rad)) / (Math.PI * 2) * NDIR) % NDIR) + NDIR) % NDIR;
      const spr = planeSprite(p.cat, k);

      const sW = Math.max(16, Math.round(spr.c.width * sx)), sH = Math.max(16, Math.round(spr.c.height * sx));
      const scR = sW / spr.c.width;
      const imgX = Math.round(X_pl + spr.x0 * scR), imgY = Math.round(Y_pl + spr.y0 * scR);
      ctx.drawImage(spr.c, imgX, imgY, sW, sH);

      PLANES.drawn.push([X_pl, Y_pl, p]);

      // Noční poziční světla
      if (night > 0.25) {
        const a = k / NDIR * Math.PI * 2, fx_ = Math.cos(a), fy_ = Math.sin(a), sxv = -fy_, syv = fx_;
        const tipW = p.cat === 'jet' ? 13.0 : 5.6, tipS = p.cat === 'jet' ? -4.5 : 0.2, tipZ = p.cat === 'jet' ? 0.2 : 1.08;
        const P_light = (s, t, h) => {
          const pt = toImg(p.x + fx_ * s + sxv * t, p.y + fy_ * s + syv * t, gz0 + vH + h);
          return [Math.round(ox + pt[0] * sx), Math.round(oy + pt[1] * sx)];
        };
        NL_planes.push({ p: P_light(tipS, -tipW, tipZ), col: '#ff2828', size: Math.max(2, Math.round(3 * sx)) });
        NL_planes.push({ p: P_light(tipS, tipW, tipZ), col: '#22ff44', size: Math.max(2, Math.round(3 * sx)) });
        const strobeOn = (Math.floor(now / 400) % 3 === 0);
        if (strobeOn) {
          const finS = p.cat === 'jet' ? -13.8 : -4.2, finZ = p.cat === 'jet' ? 4.8 : 2.1;
          NL_planes.push({ p: P_light(finS, 0, finZ), col: '#ffffff', size: Math.max(3, Math.round(4 * sx)), glow: true });
        }
        const beaconOn = (Math.floor(now / 500) % 2 === 0);
        if (beaconOn) {
          NL_planes.push({ p: P_light(0, 0, -1.1), col: '#ff2222', size: Math.max(2, Math.round(3.5 * sx)), glow: true });
        }
      }

      // 4. Štítek letu na hover / follow
      const isHovered = PLANES.hover && PLANES.hover.id === id;
      const isFollowed = PLANES.follow === id;
      if (isHovered || isFollowed || sx > 0.42) {
        ctx.font = '700 12px "Atkinson Hyperlegible", system-ui, sans-serif';
        const txt = `✈️ ${p.callsign}${p.model ? ' · ' + p.model : ''} · ${Math.round(p.alt)}\u00a0m`;
        const tw = Math.ceil(ctx.measureText(txt).width) + 12;
        const tagX = X_pl, tagY = Y_pl - Math.round(sH / 2) - 14;
        ctx.fillStyle = 'rgba(22, 25, 31, 0.88)';
        ctx.fillRect(tagX - tw / 2, tagY - 9, tw, 20);
        if (isFollowed) {
          ctx.strokeStyle = '#f2c66d'; ctx.lineWidth = 1.5;
          ctx.strokeRect(tagX - tw / 2, tagY - 9, tw, 20);
        }
        ctx.fillStyle = isFollowed ? '#f2c66d' : '#f3efe2';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(txt, tagX, tagY + 1);
        ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
      }

      if (isFollowed) {
        viewer.viewport.panTo(new OpenSeadragon.Point(pix / W, piy / W), true);
      }
    }

    if (NL_planes.length) {
      for (const l of NL_planes) {
        const [lx, ly] = l.p;
        if (l.glow) {
          ctx.fillStyle = l.col === '#ffffff' ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 40, 40, 0.4)';
          ctx.fillRect(lx - l.size * 1.5, ly - l.size * 1.5, l.size * 3, l.size * 3);
        }
        ctx.fillStyle = l.col;
        ctx.fillRect(lx - l.size / 2, ly - l.size / 2, l.size, l.size);
      }
    }
  }


  // vrstva s vozidly se kreslí ve stejné chvíli jako dlaždice (událost update-viewport), jinak by při posouvání mapy
  // o snímek zaostávala; když se mapa nehýbe, kreslí ji vlastní smyčka
  let osdT = -1e9, rafLast = performance.now();
  function frame(now) {
    perf(now - rafLast); rafLast = now;
    if (performance.now() - osdT > 24) draw(now, false);
    requestAnimationFrame(frame);
  }
  viewer.addHandler('update-viewport', () => { osdT = performance.now(); draw(osdT, true); });
  function draw(now, moving) {
    if (!moving && eco && (skip = !skip)) return;      // úsporně: každý druhý snímek (při posunu mapy každý)
    const dt = Math.min(0.1, Math.max(0, now - last) / 1000); last = now;
    const dpr = SLOW ? Math.min(1.5, window.devicePixelRatio || 1) : (window.devicePixelRatio || 1);   // mobil: efekty v 1,5× místo 3×, 4× méně pixelů (pixel art, plátno se zvětší bez rozmazání)
    const cw = fx.clientWidth, ch = fx.clientHeight;
    if (fx.width !== Math.round(cw * dpr) || fx.height !== Math.round(ch * dpr)) { fx.width = Math.round(cw * dpr); fx.height = Math.round(ch * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, cw, ch); ctx.imageSmoothingEnabled = false; VOZ_OCC.length = 0;
    const vp = viewer.viewport;
    const p0 = vp.pixelFromPoint(new OpenSeadragon.Point(0, 0), true), p1 = vp.pixelFromPoint(new OpenSeadragon.Point(1, 0), true);
    const sx = (p1.x - p0.x) / W, ox = p0.x, oy = p0.y;
    if ($('pluginLayers').childElementCount) $('pluginLayers').style.transform = `translate(${ox}px,${oy}px) scale(${sx})`;
    const vis = (ix, iy, m = 40) => { const x = ox + ix * sx, y = oy + iy * sx; return x > -m && y > -m && x < cw + m && y < ch + m; };
    const night = state.night, t = now / 1000, snowy = state.season === 'winter';
    const frameView = pluginFrames.length ? {
      sx, ox, oy, cw, ch, dpr, dt, now, moving,
      night, season: state.season, weather: state.weather, snowy, wind: realWind, eco: eco || SLOW,
      toScreen: (ix, iy) => [ox + ix * sx, oy + iy * sx],
      vis,
    } : null;
    $('map').classList.toggle('far', sx < 0.3);

    // třpyt vody (ve dne)
    if (sx > 0.25 && night < 0.6 && !snowy) {
      const q = Math.max(1, Math.round(sx * 1.5));
      for (const [x, y, ph, wk] of sparkles) {
        if (!shown(wk)) continue;
        const a = Math.sin(t * 2.2 + ph * 40);
        if (a < 0.7 || !vis(x, y)) continue;
        ctx.fillStyle = `rgba(235,248,255,${((a - 0.7) * 2.6).toFixed(2)})`;
        ctx.fillRect(Math.round(ox + x * sx), Math.round(oy + y * sx), q, q);
      }
    }
    // vybraná / zvýrazněná budova
    for (const [b, c, lw] of [[state.hover, 'rgba(242,198,109,.9)', 1.5], [state.sel, '#f2c66d', 2.5]]) {
      if (!b) continue;
      ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.beginPath();
      b.hull.forEach(([x, y], i) => (i ? ctx.lineTo(ox + x * sx, oy + y * sx) : ctx.moveTo(ox + x * sx, oy + y * sx)));
      ctx.closePath(); ctx.stroke();
    }
    drawUlice(sx, ox, oy, cw, ch, dpr);                   // názvy ulic (87-nazvy-ulic.js), pod vozidly a čísly linek
    // doprava
    if ($('l-traffic').checked) {
      if (now - tShareT > 5000 || tShareCount !== cars.length || tShareSlow !== (eco || SLOW)) {
        tShareT = now; tShareCount = cars.length; tShareSlow = eco || SLOW;
        const selection = limitCars(cars, trafficShare(), tShareSlow); tShare = selection.threshold; tAllowed = selection.allowed;
      }
      if (SIG.size) updateSignals();
      for (const c of cars) if (carActive(c) || c.hold) stepCar(c, dt);
      const xFront = [];                                  // výstražníky před kolejí (blíž k divákovi) až po vlaku, ať je vlak nepřekryje
      if (sx > 0.25) for (const [r, z] of xings) {        // výstražník před přejezdem: zavřeno střídavě červená, otevřeno bílá přerušovaná
        if (!shown(r.k)) continue;
        const dc = depth(z[1], z[2], gz(z[1], z[2]));
        for (const d of [-6, 6]) {                         // výstražník z obou stran kolejí (když kus silnice pokračuje)
          const sp = d < 0 ? z.s0 + d : z.s1 + d;
          if (sp < 0 || sp > r.L) continue;
          const o = curbPt(along(r, sp), d < 0 ? 1 : -1, 4), dp = o.d;   // vpravo u okraje vozovky pro auta, která k přejezdu jedou
          if (!vis(o.ix, o.iy) || occluded(o.ix, o.iy, dp) || occluded(o.ix, o.iy - 30, dp)) continue;   // za budovou (pata nebo výstražník) se nekreslí
          if (dp < dc) xFront.push([o, z]); else drawXPost(o, z, sx, ox, oy, now, night);
        }
      }
      if (sx > 0.25) for (const [r, z] of sigPosts) {     // semafor vpravo u stop čáry pro auta, která ke křižovatce jedou
        if (!shown(r.k) || !z.xc) continue;
        const dc = depth(z.J.cx, z.J.cy, gz(z.J.cx, z.J.cy));
        for (const dir of z.t ? [z.t] : [1, -1]) {
          const s = z[0] - dir * z.d; if (s < 0 || s > r.L) continue;
          const o = curbPt(along(r, s), dir, 4), dp = o.d;
          if (!vis(o.ix, o.iy) || occluded(o.ix, o.iy, dp) || occluded(o.ix, o.iy - 30, dp)) continue;
          if (dp < dc) xFront.push([o, z, 1]); else drawSigPost(o, z, sx, ox, oy, night);
        }
      }
      if (sx > 0.12) for (const c of cars) {
        if (!carActive(c) || !shown(roads[c.r].k)) continue;
        const o = along(roads[c.r], c.s); o.dirSign = c.dir; o.lane = roads[c.r].o ? 0 : 1.6;
        if (!vis(o.ix, o.iy)) continue;
        if (c.t !== 'semi') { drawVehicle(o, c.T.len, c.T.wid, c.col, sx, ox, oy, night, c.T.code); continue; }
        const q = trailerPos(c), nav = () => drawVehicle(q, TRAILER, 2.55, c.col2, sx, ox, oy, night, 8, 2);   // kamion: vzdálenější díl dřív
        if (q.d > o.d) nav();
        drawVehicle(o, c.T.len, c.T.wid, c.col, sx, ox, oy, night, 7, 1);
        if (q.d <= o.d) nav();
      }
      if (MHD.on) {
        const ns = Math.floor(now / 1000);
        if (ns !== MHD.t) { MHD.t = ns; MHD.act = mhdActive(); updateXings(); if (MHD.follow !== null) mhdFollowText(); }
        MHD.drawn = [];
        if (MHD.follow !== null) {
          const a = MHD.act.find((q) => q[0] === MHD.follow);
          if (a) { const o = mhdPos(MHD.trips[a[0]], a[2] ? 0 : a[1] + (now / 1000 - ns) - (busWait.get(a[0]) || 0)); viewer.viewport.panTo(new OpenSeadragon.Point(o.ix / W, o.iy / W), true); }
        }
        if (sx > 0.12) for (const [i, el, ceka, poradi] of MHD.act) {
          const trip = MHD.trips[i], [line, typ] = MHD.routes[trip[0]];
          let o = mhdPos(trip, ceka ? 0 : el + (now / 1000 - ns) - (typ === 2 ? 0 : busDelay(i, trip, el + (now / 1000 - ns), dt)));   // na konečné stojí
          const ods = ceka && typ === 0 ? odstavPos(trip, ceka, poradi) : null;
          if (ods) o = ods;
          else if (poradi) {                                     // další vůz ve frontě na konečné: o délku vozu (s mezerou) za předchozím, po silnici, kudy linka přijíždí
            const d_ = poradi * (typ === 0 ? 36 : 16), pr = prijezdSh(trip);
            if (pr && pr.L > d_ + 5) o = shapePos(pr, pr.L - d_);
            else { const L_ = Math.hypot(o.dx, o.dy) || 1, x_ = o.x - o.dx / L_ * d_, y_ = o.y - o.dy / L_ * d_, z_ = gz(x_, y_), [ix_, iy_] = toImg(x_, y_, z_); o = { ...o, x: x_, y: y_, z: z_, ix: ix_, iy: iy_ }; }
          }
          if (!vis(o.ix, o.iy, 120) || !cam.grounds.some((q) => Math.abs(o.x - q.cx) <= cam.half && Math.abs(o.y - q.cy) <= cam.half)) continue;   // mimo čtverce mapy
          const shown_ = typ === 0 ? drawVehicle(o, 15, 2.5, 't3', sx, ox, oy, night, 2) : typ === 2 ? drawTrain(trip, el + (now / 1000 - ns), line, sx, ox, oy, night) : drawVehicle(o, 12, 2.5, '#e9e6dc', sx, ox, oy, night, true);
          if (shown_) for (const q of typ === 2 ? drawTrain.pts : [o]) MHD.drawn.push([Math.round(ox + q.ix * sx), Math.round(oy + q.iy * sx) - Math.round(8 * sx), i]);
          if (shown_ && (sx > 0.55 || i === MHD.follow)) {     // číslo linky nad vozidlem
            const h = gz(o.x, o.y), [tx, ty] = toImg(o.x, o.y, h + 6);
            cisloLinky(Math.round(ox + tx * sx), Math.round(oy + ty * sx), line, typ, i === MHD.follow);
          }
        }
      }
      if (bus && !MHD.on) {
        stepShuttle(bus, dt, 4, 6);
        const o = along(bus.r, bus.s); o.dirSign = bus.dir;
        if (sx > 0.12 && vis(o.ix, o.iy, 80)) drawVehicle(o, 12, 2.5, '#e9e6dc', sx, ox, oy, night, true);
      }
      for (const tr of MHD.on ? [] : trams) {
        stepShuttle(tr, dt, 5, 12);
        if (sx <= 0.12) continue;
        const o = along(tr.r, tr.s); o.dirSign = tr.dir;
        if (vis(o.ix, o.iy, 120)) drawVehicle(o, 15, 2.5, 't3', sx, ox, oy, night, 2);
      }
      flushLights(night, sx);
      for (const [o, z, sg] of xFront) if (sg) drawSigPost(o, z, sx, ox, oy, night); else drawXPost(o, z, sx, ox, oy, now, night);   // až po světlech aut, ať je kužel nepřekryje
    }
    // chodci (jen zblízka, krok a pohyb jen u těch na obrazovce)
    if ($('l-people').checked && PEOPLE.length) {
      const hpx = Math.abs(toImg(0, 0, 1)[1] - toImg(0, 0, 0)[1]), u = hpx * 0.1 * sx;   // velikost bodu postavy na obrazovce
      if (u >= 0.3) {
        if (now - (window.__pHT || 0) > 30000) { window.__pHT = now; window.__pH = +new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Prague', hour: 'numeric', hourCycle: 'h23' }).format(new Date()); }
        let share = $('realTime').checked ? PEOPLE_SHARE[window.__pH] : 1 - 0.85 * night;
        if (state.weather === 'rain') share *= 0.45; else if (state.weather === 'snow') share *= 0.75;
        if (eco || SLOW) share *= 0.5;
        const nb = Math.min(4, Math.round(night * 5)), list = [], rain = state.weather === 'rain';
        const bikeF = (BIKE_SEASON[state.season] ?? 0.5) * (state.weather === 'rain' ? 0.3 : state.weather === 'snow' ? 0.15 : 1);
        for (const p of PEOPLE) {
          if (p.q > (p.bike ? share * bikeF : share) || !shown(p.k)) continue;
          const P = pPos(p), ip = toImg(P[0], P[1], P[2]);
          if (!vis(ip[0], ip[1], 30)) continue;
          stepPerson(p, dt); list.push([p, P, ip]);
        }
        if (PLAT.on) for (const q of platformPeople(share, now / 1000 - MHD.t)) if (vis(q[2][0], q[2][1], 30)) list.push(q);
        list.sort((a, b) => a[2][1] - b[2][1]);
        const hidden = (x, y, h, ip) => {
          const dp = depth(x, y, h);
          if (occluded(ip[0], ip[1], dp) || occluded(ip[0], ip[1] - hpx * 1.2, dp)) return true;
          if (VOZ_OCC.length && (vozZakryje(ip[0], ip[1], dp) || vozZakryje(ip[0], ip[1] - hpx * 1.2, dp))) return true;   // za autobusem, tramvají, kamionem
          for (const q of treeShapes(x, y, h, [ip[0] - 1, ip[1] - 9, ip[0] + 1, ip[1]]))
            if (q[0] === 2 ? stromPixel(q, ip[0], ip[1] - 4) || stromPixel(q, ip[0], ip[1] - 1) : q[0] === 1 ? ((ip[0] - q[1][0]) / q[2]) ** 2 + ((ip[1] - 4 - q[1][1]) / q[3]) ** 2 < 1 : ip[1] - 4 > q[1][1] && ip[1] - 4 < q[2][1] && Math.abs(ip[0] - q[1][0]) < q[3] * (ip[1] - 4 - q[1][1]) / (q[2][1] - q[1][1])) return true;
          return false;
        };
        const put = (o, key, ip, back, mir, fr) => {
          const X = ox + ip[0] * sx, Y = oy + ip[1] * sx;
          ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(X - 2.5 * u, Y - 0.6 * u, 5 * u, Math.max(1, u));
          ctx.drawImage(personSprite(o, key, back, mir, fr, nb, rain && o.umb), X - (PCX + 1.5) * u, Y - (PBASE + 2) * u, (PGW + 2) * u, (PGH + 2) * u);
        };
        for (const [p, P, ip] of list) {
          if (hidden(P[0], P[1], P[2], ip)) continue;
          const s1 = toImg(P[0] + P[3] * 0.05, P[1] + P[4] * 0.05, P[2]), back = s1[1] - ip[1] < 0, mir = s1[0] - ip[0] < 0, fr = p.moving ? Math.floor(p.ph) % 4 : 0;
          if (p.bike) {                                      // cyklista: z boku, nebo zepředu / zezadu, když jede po obrazovce svisle
            const sdx = s1[0] - ip[0], sdy = s1[1] - ip[1], view = Math.abs(sdx) > Math.abs(sdy) * 0.5 ? 's' : back ? 'b' : 'f';
            const o = outfitOf(state.season, p.oi, false), X = ox + ip[0] * sx, Y = oy + ip[1] * sx, w = view === 's' ? 7 : 2;
            ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(X - w * u, Y - 0.6 * u, 2 * w * u, Math.max(1, u));
            ctx.drawImage(bikeSprite(o, state.season + p.oi, p.bike, view, sdx < 0, p.moving ? Math.floor(p.ph) % 4 : 0, nb), X - (BCX + 1) * u, Y - (BBASE + 2) * u, (BGW + 2) * u, (BGH + 2) * u);
            continue;
          }
          const L = Math.hypot(P[3], P[4]) || 1, nx = -P[4] / L, ny = P[3] / L;   // kolmo ke směru chůze
          const near = (off, fwd) => { const x = P[0] + nx * off + P[3] / L * fwd, y = P[1] + ny * off + P[4] / L * fwd, h = gz(x, y); return [x, y, h, toImg(x, y, h)]; };
          const comp = [];
          if (p.pair) comp.push(['a', near(0.65, 0.1), (p.oi + 53) % 160]);
          if (p.kid) comp.push(['k', near(-0.6, -0.2), p.oi]);
          const all = [['m', [P[0], P[1], P[2], ip], p.oi], ...comp].sort((a, b) => a[1][3][1] - b[1][3][1]);
          for (const [t, q, oi] of all) {
            if (t !== 'm' && hidden(q[0], q[1], q[2], q[3])) continue;
            const kid = t === 'k', o = outfitOf(state.season, oi, kid);
            put(o, state.season + (kid ? 'k' : '') + oi, q[3], back, mir, fr);
          }
          if (p.dog) { const q = near(-0.9, 0.9); if (!hidden(q[0], q[1], q[2], q[3])) drawDogAt(ox + q[3][0] * sx, oy + q[3][1] * sx, u, mir, fr, p.dog); }
        }
      }
    }
    // lyžaři (jen v zimě)
    if (snowy && skiers.length) {
      for (const q of skiers) { q.s += q.v * dt; if (q.s > q.r.L) q.s = rnd(q.s) * 20; }
      if (sx > 0.2) for (const q of skiers) {
        if (!shown(q.r.k)) continue;
        const a = q.r.w[0]; if (!vis(...toImg(a[0], a[1], a[2]), 4000)) continue;
        drawSkier(q, sx, ox, oy);
      }
    }
    // kluziště: led s mantinelem je ve vrstvě výzdoby, tady jen bruslaři krouží po elipsách
    const xm = xmasShow();
    if (xm && sx > 0.25) for (const R of rinks) {
      const c0 = toImg(...R.at(0, 0), R.h); if (!vis(c0[0], c0[1], 60 * sx + 300)) continue;
      for (const q of R.sk.map((q) => [q, q.ph + t * q.v]).sort((m, n) => Math.sin(n[1]) - Math.sin(m[1]))) {
        const [k, ang] = q, [x, y] = R.at(Math.cos(ang) * (R.L / 2 - 2.5) * k.r, Math.sin(ang) * (R.W / 2 - 2.5) * k.r);
        const p = toImg(x, y, R.h), top = toImg(x, y, R.h + 1.7), u = Math.max(1, Math.round((p[1] - top[1]) * sx / 8));
        const X = Math.round(ox + p[0] * sx), Y = Math.round(oy + p[1] * sx);
        const B = (bx, by, w, hh, c) => { ctx.fillStyle = c; ctx.fillRect(X + bx * u, Y - by * u, w * u, hh * u); };
        B(-1, 1, 3, 1, '#9aa0a8'); B(-1, 4, 2, 3, '#2a2c31'); B(-1, 7, 2, 3, k.col); B(-1, 8, 2, 1, '#e8c6a4'); B(-1, 9, 2, 1, k.hat);
      }
    }
    // vánoční stánky večer: teplá záře před pultem, rozsvícené okénko, blikající žárovky pod okapem
    if (xm && night > 0.25 && sx > 0.15) {
      const a = Math.min(1, (night - 0.25) / 0.35), k = Math.max(1, Math.round(sx * 1.2));
      const poly = (pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(ox + x * sx, oy + y * sx) : ctx.moveTo(ox + x * sx, oy + y * sx))); ctx.closePath(); ctx.fill(); };
      for (const S of stalls) {
        if (!vis(S.c[0], S.c[1], 60)) continue;
        ctx.globalAlpha = a * 0.28; ctx.fillStyle = '#ffc870'; poly(S.pool);
        ctx.globalAlpha = a * 0.9; ctx.fillStyle = '#ffd98a'; poly(S.win);
        S.bulbs.forEach(([bx, by], i) => {
          ctx.globalAlpha = a * ((Math.floor(t * 1.5) + i) % 3 ? 1 : 0.45);
          ctx.fillStyle = i % 2 ? '#fff0b0' : '#ff5a40';
          ctx.fillRect(Math.round(ox + bx * sx - k / 2), Math.round(oy + by * sx - k / 2), k, k);
        });
      }
      ctx.globalAlpha = 1;
    }
    // vánoční strom: blikající světýlka (strom je ve vrstvě výzdoby)
    if (xm && sx > 0.15) for (const T of xmasTrees) if (vis(T.c[0], T.c[1], 100)) {
      const k = Math.max(1, Math.round(sx * 1.4)), on = night > 0.3 ? 1 : 0.55;
      ctx.globalAlpha = on;
      T.lights.forEach(([lx, ly], i) => {
        ctx.fillStyle = ['#ff4a3a', '#ffd23a', '#4ab0ff', '#ffffff'][(Math.floor(t * 2) + i) % 4];
        ctx.fillRect(Math.round(ox + lx * sx - k / 2), Math.round(oy + ly * sx - k / 2), k, k);
      });
      ctx.globalAlpha = 1;
    }
    // vánoční strom bez assets/vanoce.json (jen "vanocni_strom" v mesto.json): plochý obrázek v zimě
    if (!VANOCE && snowy && sx > 0.15) for (const pt of xmasPts) if (vis(pt[0], pt[1], 100)) {
      const k = Math.max(1, Math.round(sx * 1.2)), X0 = Math.round(ox + (pt[0] + 30) * sx - 15 * k), Y0 = Math.round(oy + (pt[1] - 4) * sx - 48 * k);
      ctx.drawImage(xmas.c, X0, Y0, 30 * k, 48 * k);
      const on = night > 0.3 ? 1 : 0.55;
      xmas.lights.forEach(([lx, ly], i) => {
        const ph = (Math.floor(t * 2) + i) % 4;
        ctx.fillStyle = ['#ff4a3a', '#ffd23a', '#4ab0ff', '#ffffff'][ph];
        ctx.globalAlpha = on; ctx.fillRect(X0 + Math.round(lx * k), Y0 + Math.round(ly * k), k, k); ctx.globalAlpha = 1;
      });
    }
    // sypače a pluhy ŘSD (živě, jen s "pluhy": true v mesto.json)
    if (PLOW.on && $('l-pluhy').checked) stepDrawPlows(dt, sx, ox, oy, vis, t, now);
    runFrameLayer('world', frameView, t);
    // svíčky na hřbitovech: večer; kolem Dušiček (30. 10.–10. 11.) skoro na každém hrobě, na Štědrý den na většině, jinak jen tu a tam.
    // Hřbitovní lampy jsou červené, žluté a bílé; plamen se mihotá, při přiblížení kolem něj malá záře
    if (night > 0.3 && sx > 0.1 && svicky.length) {
      const dn = new Date(), md = (dn.getMonth() + 1) * 100 + dn.getDate();
      const podil = md >= 1030 && md <= 1110 ? 0.85 : md >= 1224 && md <= 1226 ? 0.6 : 0.1, on = Math.min(1, (night - 0.3) * 2.5);
      const q = Math.max(1, Math.round(sx * 0.8)), zare = sx > 0.45 && !SLOW;
      const lod = sx < 0.3 ? 3 : sx < 0.5 ? 2 : 1;               // zdálky stačí každá druhá až třetí (hustota vypadá stejně)
      const gx0 = Math.floor(-ox / sx / SVB), gy0 = Math.floor(-oy / sx / SVB), gx1 = Math.floor((cw - ox) / sx / SVB), gy1 = Math.floor((ch - oy) / sx / SVB);
      for (let gx = gx0; gx <= gx1; gx++) for (let gy = gy0; gy <= gy1; gy++) for (const [cx, cy, u, ck] of svGrid.get(gx + ',' + gy) || []) {
        if (u > podil || (lod > 1 && Math.floor(u * 997) % lod) || !shown(ck)) continue;
        const fl = 0.72 + 0.28 * Math.sin(t * (6 + u * 9) + u * 50) * Math.sin(t * 2.7 + u * 31);
        ctx.fillStyle = u < podil * 0.5 ? '#ff4b2e' : u < podil * 0.8 ? '#ffc04a' : '#fff0c8';
        const X = Math.round(ox + cx * sx), Y = Math.round(oy + cy * sx);
        if (zare) { ctx.globalAlpha = 0.22 * fl * on; ctx.fillRect(X - q * 2, Y - q * 2, q * 4, q * 4); }
        ctx.globalAlpha = fl * on; ctx.fillRect(X - (q >> 1), Y - (q >> 1), q, q);
      }
      ctx.globalAlpha = 1;
    }
    // kouř z komínů
    if ($('l-smoke').checked && sx > 0.3) {
      // kouř: v létě vůbec, na jaře jen ojediněle, na podzim a v zimě víc (ale ne z každého domu)
      const prob = { spring: 0.04, summer: 0, autumn: 0.14, winter: 0.24 }[state.season] * (1 + night * 0.4);
      const q = Math.max(1, Math.round(sx * 2));
      const wind = realWind ? realWind.strength : state.weather === 'rain' ? 1.8 : 1;
      const driftX = realWind ? realWind.dx : 1, driftY = realWind ? realWind.dy : 0;
      if (prob > 0) for (const [cx, cy, ck, id, r0, r1] of chimneys) {
        if (r0 > prob || !vis(cx, cy, 200) || !shown(ck)) continue;
        for (let k = 0; k < 9; k++) {
          const a = (t * 0.18 + k / 9 + r1) % 1;
          const drift = a * a * 40 * wind;
          const px = cx + drift * driftX + Math.sin(a * 5 + id) * 2.5, py = cy + drift * driftY - a * 75 / Math.max(1, wind) - 3;
          const size = Math.max(q, Math.round((3 + a * 8) * sx));
          const g = Math.round(night > 0.5 ? 120 : 236 - a * 26);
          ctx.fillStyle = `rgba(${g},${g},${g + 6},${(0.6 * Math.pow(1 - a, 1.3)).toFixed(3)})`;
          ctx.fillRect(Math.round(ox + px * sx - size / 2), Math.round(oy + py * sx - size / 2), size, size);
        }
      }
    }
    // mraky (jen při oddálení); při dešti a sněžení tmavší a víc
    {
      const fade = Math.max(0, Math.min(1, (0.45 - sx) / 0.25));
      const dark = night > 0.5 ? 2 : (state.weather === 'rain' || state.weather === 'snow') ? 1 : 0;
      clouds.forEach((c, i) => {
        c.x += dt * (state.weather === 'rain' ? 30 : 14); if (c.x > MX1 + 1800) c.x = MX0 - 1800;
        if (fade <= 0 || (state.weather === 'clear' && i > 20)) return;
        const [shadowC, bodyC] = cloudBitmap(c, dark, dark);
        ctx.globalAlpha = fade;
        ctx.drawImage(shadowC, Math.round(ox + (c.x + c.minx * BS) * sx), Math.round(oy + (c.y + c.miny * BS) * sx), Math.round(shadowC.width * BS * sx), Math.round(shadowC.height * BS * sx));
        ctx.drawImage(bodyC, Math.round(ox + (c.x - 260 + c.minx * BS) * sx), Math.round(oy + (c.y - 620 + c.miny * BS) * sx), Math.round(bodyC.width * BS * sx), Math.round(bodyC.height * BS * sx));
        ctx.globalAlpha = 1;
      });
    }
    // letadla (v úrovni mraků a nad nimi)
    if ({{LETADLA}}) {
      stepPlanes(dt, now);
      drawPlanes(sx, ox, oy, night, now, cw, ch);
    }
    runFrameLayer('sky', frameView, t);
    // názvy čtvrtí: jako mraky – vidět při oddálení, s přiblížením plynule mizí
    {
      const fadeD = Math.max(0, Math.min(1, (0.22 - sx) / 0.14));
      if (fadeD > 0 && $('l-labels').checked) {
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = fadeD * 0.9;   // hotové obrázky názvů (nazev v 84-kresleni-vozidel.js) na celé pixely
        const boxes = [];
        for (const d of DISTRICTS) {                      // od největší čtvrti; překrývající se menší popisek vynechat
          const x = ox + d.xy[0] * sx, y = oy + d.xy[1] * sx;
          if (x < -200 || y < -60 || x > cw + 200 || y > ch + 60) continue;
          const big = d.k === 'obec' ? 1.15 : d.k === 'cast' ? 0.72 : d.a > 3 ? 1 : 0.82;   // obec větší, místní část menší
          const n = nazev(d.name.toUpperCase(), `${d.k === 'obec' ? 700 : 500} ${Math.round(15 * big)}px ${DISPLAY_FONT}`, dpr), tw = n.tw, th = 11 * big;
          if (boxes.some(([bx, by, bw]) => Math.abs(bx - x) < bw + tw && Math.abs(by - y) < th * 2)) continue;
          boxes.push([x, y, tw]);
          const X = Math.round(x * dpr), Y = Math.round(y * dpr);
          for (const q of [n.s, n.f]) if (q) ctx.drawImage(q[0], X + q[1], Y + q[2]);
        }
        ctx.restore(); ctx.globalAlpha = 1;
      }
    }
    // počasí
    if (state.weather === 'rain') {
      ctx.fillStyle = 'rgba(20,28,44,0.16)'; ctx.fillRect(0, 0, cw, ch);
      ctx.fillStyle = night > 0.5 ? 'rgba(150,170,200,0.45)' : 'rgba(210,225,245,0.55)';
      for (const d of drops) {
        d.y += d.v * dt * 1.6; if (d.y > 1) { d.y -= 1; d.x = Math.random(); }
        const x = Math.round(d.x * cw + d.y * 60), y = Math.round(d.y * ch);
        for (let k = 0; k < 4; k++) ctx.fillRect(x - k, y - k * 3, 1, 3);
      }
    } else if (state.weather === 'snow') {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (const d of drops) {
        d.y += d.v * dt * 0.12; if (d.y > 1) { d.y -= 1; d.x = Math.random(); }
        const x = Math.round(((d.x + Math.sin(t * 0.8 + d.s * 9) * 0.01) % 1) * cw), y = Math.round(d.y * ch), q = d.s > 0.7 ? 3 : 2;
        ctx.fillRect(x, y, q, q);
      }
    } else if (state.weather === 'fog') {
      const off = (t * 6) % (cw / 2);
      ctx.globalAlpha = night > 0.5 ? 0.5 : 0.85;
      ctx.drawImage(fogTex, -off, 0, cw * 1.5, ch); ctx.drawImage(fogTex, cw * 1.5 - off, 0, cw * 1.5, ch);
      ctx.globalAlpha = 1;
    }
    // opar podle PM2,5: od 25 µg/m³ (špatné ovzduší podle evropského indexu), nejsilnější od 75
    if (realPm > 25 && $('realWeather').checked) {
      ctx.fillStyle = `rgba(176,170,152,${Math.min(1, (realPm - 25) / 50) * (night > 0.5 ? 0.12 : 0.24)})`;
      ctx.fillRect(0, 0, cw, ch);
    }
    runFrameLayer('top', frameView, t);
    if (mini.offsetParent) {                               // na mobilu je minimapa skrytá; jinak kreslit jen při změně
      const b = viewer.viewport.getBounds(true), mk = [b.x.toFixed(4), b.y.toFixed(4), b.width.toFixed(4), state.season, state.night > 0.35 ? state.night.toFixed(2) : 0, state.wip, Object.keys(miniImgs).length, cw].join('|');
      if (mk !== miniKey) { miniKey = mk; drawMini(); }
      const m = cam.mpp / sx, st = m < 1 ? `1\u00a0px = ${Math.round(m * 100)}\u00a0cm` : `1\u00a0px = ${Math.round(m)}\u00a0m`;
      if (st !== scaleTxt) { scaleTxt = st; $('scale').textContent = st; }
    }
  }
  requestAnimationFrame(frame);


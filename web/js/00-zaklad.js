(async () => {
  // zelený rámeček fokusu jen při ovládání klávesnicí (iPhone ho jinak ukazuje na × každého otevřeného okna)
  document.documentElement.classList.add('ukazatel');
  addEventListener('pointerdown', () => document.documentElement.classList.add('ukazatel'), { capture: true, passive: true });
  addEventListener('keydown', (e) => { if (e.key === 'Tab') document.documentElement.classList.remove('ukazatel'); }, { capture: true });

  const [TILES, OV] = await Promise.all([fetch('tiles.json').then((r) => r.json()), fetch('overlay.json').then((r) => r.json())]);
  // real wind for chimney smoke; the map camera looks from the south-west, so east is right and up, north is left and up
  let realWind = null, realWeather = null, realSnow = null, realPm = null, applyRealWeather = () => {};
  // model hlásí kód srážek i při 0 mm: padat smí jen to, co opravdu padá
  const wmoWeather = (c, mm) => mm === 0 && ((c >= 51 && c <= 67) || (c >= 71 && c <= 77) || (c >= 80 && c <= 86) || c >= 95) ? 'clear' : (c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95 ? 'rain' : (c >= 71 && c <= 77) || c === 85 || c === 86 ? 'snow' : c === 45 || c === 48 ? 'fog' : 'clear';
  const loadWind = () => fetch(`https://api.open-meteo.com/v1/forecast?latitude=${OV.cam.lat0}&longitude=${OV.cam.lon0}&current=precipitation,wind_speed_10m,wind_direction_10m,weather_code,snow_depth&wind_speed_unit=ms`)
    .then((r) => r.json()).then(({ current: c }) => {
      if ({{POCASI}}) { realWeather = wmoWeather(c.weather_code, c.precipitation); realSnow = Number.isFinite(c.snow_depth) ? c.snow_depth >= 0.02 : null; applyRealWeather(); }
      if (!{{VITR}}) return;
      const from = c.wind_direction_10m * Math.PI / 180, e = -Math.sin(from), n = -Math.cos(from);
      realWind = { dx: 0.7071 * (e - n), dy: -0.3536 * (e + n), strength: Math.min(2.2, Math.max(0.15, c.wind_speed_10m / 3)) };
    }).catch(() => {});
  if ({{VITR}} || {{POCASI}}) { loadWind(); setInterval(loadWind, 30 * 60 * 1000); }
  // kvalita ovzduší je z modelu CAMS, ne z měřicí stanice ve městě
  const loadAir = () => fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${OV.cam.lat0}&longitude=${OV.cam.lon0}&current=pm2_5`)
    .then((r) => r.json()).then(({ current: c }) => { realPm = Number.isFinite(c.pm2_5) ? c.pm2_5 : null; applyRealWeather(); }).catch(() => {});
  if ({{POCASI}}) { loadAir(); setInterval(loadAir, 30 * 60 * 1000); }
  const W = OV.w, Hh = OV.h;
  const $ = (id) => document.getElementById(id);
  const isMobile = () => matchMedia('(max-width: 640px)').matches;
  let uiDepth = 0, uiPop = false, uiBackAt = 0, uiSelf = 0;
  const state = { season: 'summer', night: 0, weather: 'clear', sel: null, hover: null, wip: false };
  const hashTokens = (location.hash || '').slice(1).split('@')[0].split('-');
  const SEASON_TOKEN = { jaro: 'spring', leto: 'summer', podzim: 'autumn', zima: 'winter' };
  const pragueMonth = +new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Prague', month: 'numeric' }).format(new Date());
  const calSeason = pragueMonth < 3 || pragueMonth === 12 ? 'winter' : pragueMonth < 6 ? 'spring' : pragueMonth < 9 ? 'summer' : 'autumn';
  state.season = calSeason;
  const pinnedView = hashTokens.some((t) => SEASON_TOKEN[t] || t === 'noc' || t === 'soumrak');   // sdílený odkaz si drží svůj vzhled
  for (const t of hashTokens) { if (SEASON_TOKEN[t]) state.season = SEASON_TOKEN[t]; if (t === 'noc') state.night = 1; if (t === 'soumrak') state.night = 0.42; if (t === 'vse') state.wip = true; }
  if (state.season === 'winter') state.weather = 'snow';
  const WIP = Object.values(TILES.chunks || {}).some((c) => c.status !== 'hotovo');



import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// celá stránka jako web/sestav.py: šablona web/app.html, za <!-- @css --> a <!-- @js --> soubory z web/css a web/js podle abecedy
function appCela() {
  let t = fs.readFileSync(path.join(ROOT, 'web/app.html'), 'utf8');
  for (const [z, d, p] of [['<!-- @css -->\n', 'css', '.css'], ['<!-- @js -->\n', 'js', '.js']]) {
    const f = fs.readdirSync(path.join(ROOT, 'web', d)).filter((x) => x.endsWith(p)).sort();
    t = t.replace(z, () => f.map((x) => fs.readFileSync(path.join(ROOT, 'web', d, x), 'utf8')).join(''));
  }
  return t;
}

function runScriptInContext(relPath, ctx) {
  const code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  vm.runInContext(code, ctx, { filename: relPath });
}

function makeMockElement(tag) {
  const listeners = new Map();
  const children = [];
  const el = {
    tagName: tag.toUpperCase(),
    dataset: {},
    style: {},
    className: '',
    hidden: false,
    textContent: '',
    value: '',
    title: '',
    type: '',
    children,
    _html: '',
    set innerHTML(v) { this._html = v; },
    get innerHTML() { return this._html; },
    appendChild(child) { children.push(child); return child; },
    remove() { this._removed = true; },
    addEventListener(ev, fn) {
      if (!listeners.has(ev)) listeners.set(ev, []);
      listeners.get(ev).push(fn);
    },
    dispatchEvent(ev) {
      for (const fn of listeners.get(ev.type) || []) fn(ev);
    },
    click() { this.dispatchEvent({ type: 'click', preventDefault() {} }); },
    querySelector(sel) {
      const m = sel.match(/\[data-role="([^"]+)"\]/);
      if (!m) return null;
      if (!this._roles) this._roles = new Map();
      if (!this._roles.has(m[1])) this._roles.set(m[1], makeMockElement(m[1] === 'note' ? 'input' : 'div'));
      return this._roles.get(m[1]);
    },
  };
  return el;
}

// 1. Kontrola syntaxe celého <script> v web/app.html (po dosazení {{...}} zástupných hodnot)
{
  const html = appCela();
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>\s*$/);
  assert.ok(scriptMatch, 'web/app.html musí obsahovat hlavní <script>');
  const filled = scriptMatch[1].replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (key === 'VLAK') return JSON.stringify({ vychozi: 'regionova', linky: {} });
    if (['HLASENI', 'VITR', 'POCASI', 'LETADLA', 'PLUHY', 'NASTUPISTE', 'DOMU_CELEK', 'MHD', 'VANOCE'].includes(key)) return 'false';
    return 'null';
  });
  new vm.Script(filled, { filename: 'web/app.html' });
}

// 2. Test knihovny profanity (validace, diakritika, leetspeak, mezery, výjimky, idempotence)
{
  const libs = {};
  const ctx = vm.createContext({
    window: {
      Izomapa: {
        registerLib(id, api) { libs[id] = api; },
        getLib(id) { return libs[id] ?? null; },
      },
    },
  });
  runScriptInContext('knihovny/profanity/profanity.js', ctx);
  // Opakované načtení nesmí rozbít už zaregistrovanou knihovnu
  const firstRef = libs.profanity;
  runScriptInContext('knihovny/profanity/profanity.js', ctx);
  assert.equal(libs.profanity, firstRef);

  const prof = libs.profanity;
  assert.equal(prof.contains('Kurva123'), true);
  assert.equal(prof.contains('p.i.č.a'), true);
  assert.equal(prof.contains('p1c4'), true);
  assert.equal(prof.contains('kokotina'), true);
  assert.equal(prof.isValid('K.u.r.v.a'), false);

  assert.equal(prof.isValid('Sekunda'), true);
  assert.equal(prof.isValid('Srnka z Teplic'), true);
  assert.equal(prof.isValid('Anonymní hledač'), true);
  assert.equal(prof.isValid(''), true);

  assert.equal(prof.contains('tajneslovo', { extraWords: ['tajneslovo'] }), true);
  assert.equal(prof.contains('debil', { allowWords: ['debil'] }), false);
  assert.equal(prof.contains('Kurva123', { enabled: false }), false);
  assert.equal(prof.censor('p1c4'), '***');
  assert.equal(prof.censor('Petr'), 'Petr');
}

// 3. Test knihovny server_client (normalizované požadavky a chyby)
{
  const libs = {};
  const fetchCalls = [];
  let nextFetchImpl = async () => new Response(JSON.stringify({ saved: true, id: 7 }), { status: 200 });

  const ctx = vm.createContext({
    window: {
      Izomapa: {
        registerLib(id, api) { libs[id] = api; },
        getLib(id) { return libs[id] ?? null; },
      },
    },
    fetch: (url, init) => {
      fetchCalls.push({ url, init });
      return nextFetchImpl(url, init);
    },
    AbortController,
    AbortSignal,
    setTimeout,
    clearTimeout,
  });
  runScriptInContext('knihovny/server_client/server_client.js', ctx);
  const api = libs.server_client.createClient('/api/plugin.php');

  const okRes = await api.call('ping', { x: 10 });
  assert.equal(okRes.ok, true);
  assert.equal(okRes.status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(okRes.data)), { saved: true, id: 7 });
  assert.equal(okRes.error, null);
  assert.equal(fetchCalls[0].url, '/api/plugin.php');
  assert.deepEqual(JSON.parse(fetchCalls[0].init.body), { action: 'ping', x: 10 });

  nextFetchImpl = async () => new Response(JSON.stringify({ error: 'bad_input', message: 'Chybný vstup' }), { status: 400 });
  const errRes = await api.call('ping', {});
  assert.equal(errRes.ok, false);
  assert.equal(errRes.status, 400);
  assert.equal(errRes.error, 'bad_input');
  assert.equal(errRes.message, 'Chybný vstup');

  nextFetchImpl = async () => new Response('Internal Server Error', { status: 500 });
  const nonJson = await api.call('ping', {});
  assert.equal(nonJson.ok, false);
  assert.equal(nonJson.status, 500);
  assert.equal(nonJson.error, 'http_500');

  nextFetchImpl = async () => { throw new Error('offline'); };
  const netErr = await api.call('ping', {});
  assert.equal(netErr.ok, false);
  assert.equal(netErr.error, 'network_error');

  const missingUrl = await libs.server_client.request('', 'ping');
  assert.equal(missingUrl.ok, false);
  assert.equal(missingUrl.error, 'missing_url');
}

// 4. Test vzorového klientského doplňku (onFrame, onMapClick, getLib('profanity'), getLib('server_client'))
{
  const libs = {};
  const plugins = {};
  const frameHandlers = [];
  const clickHandlers = [];
  const slot = makeMockElement('div');
  const body = makeMockElement('body');
  const sentRequests = [];

  const apiMock = {
    libs,
    registerLib(id, api) { libs[id] = api; },
    getLib: (id) => libs[id] ?? null,
    getPluginData: (id) => (id === 'vzor_doplnku' ? { title: 'Vzor', points: [{ id: 'a', label: 'A', xy: [100, 200] }] } : null),
    getPluginConfig: () => ({ server_url: '/api/vzor' }),
    registerPlugin(id, inst) {
      plugins[id] = inst;
      if (inst?.onInit) inst.onInit(apiMock);
    },
    getUiSlot: (name) => (name === 'sidebar-tabs' ? slot : null),
    onFrame(fn, options = {}) {
      const e = { fn, layer: options.layer || 'sky' };
      frameHandlers.push(e);
      return () => { const i = frameHandlers.indexOf(e); if (i >= 0) frameHandlers.splice(i, 1); };
    },
    onMapClick(fn) {
      clickHandlers.push(fn);
      return () => { const i = clickHandlers.indexOf(fn); if (i >= 0) clickHandlers.splice(i, 1); };
    },
    setClickCapture() {},
    setCursor() {},
    panTo() {},
  };

  const ctx = vm.createContext({
    window: { Izomapa: apiMock },
    document: {
      createElement: (tag) => makeMockElement(tag),
      body,
    },
    fetch: async (url, init) => {
      sentRequests.push({ url, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
    AbortController,
    AbortSignal,
    setTimeout,
    clearTimeout,
  });

  runScriptInContext('knihovny/profanity/profanity.js', ctx);
  runScriptInContext('knihovny/server_client/server_client.js', ctx);
  runScriptInContext('priklady/doplnek_vzor/vzor.js', ctx);

  assert.equal(frameHandlers.length, 1);
  assert.equal(frameHandlers[0].layer, 'world');

  // Simulace jednoho snímku onFrame
  let arcCalls = 0;
  const mockCanvasCtx = { fillStyle: '', beginPath() {}, arc() { arcCalls++; }, fill() {} };
  const mockView = { sx: 1, ox: 0, oy: 0, vis: () => true, toScreen: (x, y) => [x, y] };
  frameHandlers[0].fn(mockCanvasCtx, mockView, 1.5);
  assert.ok(arcCalls >= 2, 'onFrame musí vykreslit bod na canvas');

  // Kliknutí na mapu se sprostým textem nesmí projít na server
  const panel = body.children[0];
  panel.querySelector('[data-role="toggle"]').click();
  panel.querySelector('[data-role="note"]').value = 'k.u.r.v.a';
  await clickHandlers[0]({ x: 150, y: 250 });
  assert.equal(sentRequests.length, 0);
  assert.match(panel.querySelector('[data-role="status"]').textContent, /nevhodný výraz/i);

  // Platný text se pošle přes server_client na nastavené URL
  panel.querySelector('[data-role="note"]').value = 'Rozhledna';
  await clickHandlers[0]({ x: 150, y: 250 });
  assert.equal(sentRequests.length, 1);
  assert.equal(sentRequests[0].url, '/api/vzor');
  assert.equal(sentRequests[0].body.action, 'add_point');
  assert.equal(sentRequests[0].body.label, 'Rozhledna');

  // Úklid v onDestroy odhlásí onFrame i onMapClick
  plugins.vzor_doplnku.onDestroy();
  assert.equal(frameHandlers.length, 0);
  assert.equal(clickHandlers.length, 0);
}

// 5. Test skutečného zavaděče z web/app.html: knihovny se načtou jen 1× a před skripty pluginů
{
  const html = appCela();
  const startIdx = html.indexOf('if (OV.doplnky && Object.keys(OV.doplnky).length)');
  const endIdx = html.indexOf('})();', startIdx);
  assert.ok(startIdx > 0 && endIdx > startIdx);
  const loaderSnippet = html.slice(startIdx, endIdx);

  const appendedOrder = [];
  const headLinks = [];
  const ctx = vm.createContext({
    OV: {
      doplnky: {
        a: {
          lib_styles: ['doplnky/_libs/x/x.css'],
          lib_scripts: ['doplnky/_libs/profanity/profanity.js', 'doplnky/_libs/server_client/server_client.js'],
          styles: ['doplnky/a/a.css'],
          scripts: ['doplnky/a/a.js'],
        },
        b: {
          lib_styles: ['doplnky/_libs/x/x.css'],
          lib_scripts: ['doplnky/_libs/profanity/profanity.js'],
          styles: ['doplnky/b/b.css'],
          scripts: ['doplnky/b/b.js'],
        },
      },
    },
    layersReady: Promise.resolve(),
    console,
    Promise,
    Set,
    Map,
    document: {
      head: { appendChild: (el) => headLinks.push(el.href) },
      body: {
        appendChild: (el) => {
          appendedOrder.push(el.src);
          // Simulace asynchronního načtení skriptu v prohlížeči
          queueMicrotask(() => el.onload && el.onload());
        },
      },
      createElement: (tag) => ({ tagName: tag }),
    },
  });

  vm.runInContext(loaderSnippet, ctx);
  await new Promise((r) => setTimeout(r, 20));

  assert.deepEqual(JSON.parse(JSON.stringify(headLinks)), ['doplnky/_libs/x/x.css', 'doplnky/a/a.css', 'doplnky/b/b.css']);
  assert.deepEqual(JSON.parse(JSON.stringify(appendedOrder)), [
    'doplnky/_libs/profanity/profanity.js',
    'doplnky/_libs/server_client/server_client.js',
    'doplnky/a/a.js',
    'doplnky/b/b.js',
  ]);
}

// 6. Test Izomapa.onFrame, vrstev (world/sky/top), izolace ctx.save/restore a souřadných metod
{
  const html = appCela();
  const winStart = html.indexOf('window.Izomapa = {');
  const winEnd = html.indexOf('if (OV.doplnky && Object.keys(OV.doplnky).length)');
  assert.ok(winStart > 0 && winEnd > winStart);
  const izoSnippet = html.slice(winStart, winEnd);

  const calls = [];
  const ctxMock = {
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
  };
  const cam = { lat0: 50.77, lon0: 15.05, kx: 70000, ky: 111000, mpp: 0.2, x0: -100, y1: 100 };
  const pluginFrames = [];
  const runFrameLayer = (layerName, view, t) => {
    if (!view) return;
    for (const h of [...pluginFrames]) {
      if (h.layer !== layerName) continue;
      ctxMock.save();
      try { h.fn(ctxMock, view, t); } catch {} finally { ctxMock.restore(); }
    }
  };

  const sandbox = {
    window: {},
    OV: { doplnky: {} },
    pluginLibs: {},
    pluginRegistry: {},
    pluginClicks: [],
    pluginFrames,
    pluginCapture: false,
    pluginCursor: '',
    ready: true,
    layersReady: Promise.resolve(),
    viewer: { viewport: { getCenter: () => ({ x: 0.5, y: 0.5 }), getZoom: () => 1 } },
    W: 1000,
    Hh: 1000,
    cam,
    toImg: (x, y, h = 0) => [x + h, y - h],
    imgToWorld: (ix, iy) => [ix, iy],
    gz: () => 12,
    lonlat: (x, y) => [x / cam.kx + cam.lon0, y / cam.ky + cam.lat0],
    state: { night: 0, weather: 'clear', season: 'summer' },
    $: () => ({ checked: false, style: {}, querySelector: () => null, appendChild() {}, value: '' }),
    document: { body: { classList: { toggle() {} } } },
  };
  vm.createContext(sandbox);
  vm.runInContext(izoSnippet, sandbox);
  const api = sandbox.window.Izomapa;

  const order = [];
  const uWorld = api.onFrame((_, view, t) => order.push(['world', t, view.toScreen(10, 20)]), { layer: 'world' });
  const uSky = api.onFrame(() => { order.push(['sky-err']); throw new Error('boom'); }, { layer: 'sky', priority: 5 });
  const uSky2 = api.onFrame((_, view) => order.push(['sky-ok', view.night]), { layer: 'sky', priority: 1 });
  const uTop = api.onFrame(() => order.push(['top']), { layer: 'top' });

  const view = { sx: 2, ox: 5, oy: 10, night: 0.5, toScreen: (ix, iy) => [5 + ix * 2, 10 + iy * 2] };
  runFrameLayer('world', view, 12.5);
  runFrameLayer('sky', view, 12.5);
  runFrameLayer('top', view, 12.5);

  assert.deepEqual(JSON.parse(JSON.stringify(order)), [
    ['world', 12.5, [25, 50]],
    ['sky-err'],
    ['sky-ok', 0.5],
    ['top'],
  ]);
  assert.deepEqual(calls, ['save', 'restore', 'save', 'restore', 'save', 'restore', 'save', 'restore']);

  // Převody souřadnic
  const wPt = api.latLonToWorld(50.771, 15.051);
  const back = api.worldToLatLon(wPt[0], wPt[1]);
  assert.ok(Math.abs(back[0] - 50.771) < 1e-9 && Math.abs(back[1] - 15.051) < 1e-9);
  const imgPt = api.latLonToImg(50.77, 15.05, 5);
  assert.deepEqual(JSON.parse(JSON.stringify(imgPt)), [17, -17]);

  uWorld(); uSky(); uSky2(); uTop();
  assert.equal(pluginFrames.length, 0);
}

console.log('OK: web/app.html syntaxe + pořadí knihoven, profanity, server_client, onFrame a vzor_doplnku');

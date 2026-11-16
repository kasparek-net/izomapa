// společné pro nástroje památek v Node (nahled.mjs, pred_po.mjs): kořen repa, mesto.json, malý server jen pro tento počítač
// a Chromium s grafickou kartou (stejně jako render.mjs: Mac Metal, Windows Direct3D 11, Linux GPU přes EGL, jinak SwiftShader).
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MESTO = JSON.parse(fs.readFileSync(path.join(ROOT, process.env.IZO_MESTO || 'mesto.json'), 'utf8'));
export const HALF = Number(MESTO.polovina || 1150);                 // půl strany čtverce (= geo.HALF)
export const PODKLADY = path.join(ROOT, 'podklady-soukrome/pamatky'); // místní podklady a snímky (mimo git)
export const cti = (p, def) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')); } catch { return def; } };

// statické soubory repa pro render.html: jen 127.0.0.1, jen soubory projektu, žádné skryté, jen typy, které render potřebuje
export async function server() {
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
  const s = http.createServer((req, res) => {
    if (req.headers.host !== `127.0.0.1:${s.address().port}`) { res.writeHead(403); res.end(); return; }
    let rel; try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); res.end(); return; }
    const p = path.join(ROOT, rel);
    if (rel.includes('\0') || !p.startsWith(ROOT + path.sep) || rel.split('/').some((x) => x.startsWith('.')) || !(path.extname(p) in MIME)) { res.writeHead(403); res.end(); return; }
    fs.readFile(p, (e, data) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': MIME[path.extname(p)], 'cache-control': 'no-store' }); res.end(data); });
  }).listen(0, '127.0.0.1');
  await new Promise((r) => s.once('listening', r));
  return s;
}

export async function prohlizec() {
  const SW = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  if (process.platform === 'darwin') return chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  if (process.platform === 'win32') return chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  let dri = false; try { dri = fs.readdirSync('/dev/dri').some((f) => f.startsWith('renderD')); } catch { /* bez GPU */ }
  if (dri) {
    const b = await chromium.launch({ args: ['--no-sandbox', '--use-gl=angle', '--use-angle=gl-egl', '--enable-gpu', '--ignore-gpu-blocklist'] });
    const p = await b.newPage();
    const gpu = await p.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); const d = gl?.getExtension('WEBGL_debug_renderer_info'); return gl ? String(gl.getParameter(d ? d.UNMASKED_RENDERER_WEBGL : gl.RENDERER)) : ''; });
    await p.close();
    if (gpu && !/swiftshader|llvmpipe|softpipe|swrast|lavapipe/i.test(gpu)) return b;
    await b.close();
  }
  return chromium.launch({ args: SW });
}

// výřez kolem památky: složka scény čtverce, střed rámu v místních souřadnicích čtverce, výška, poloměr
export function vyrez(d) {
  const [ci, cj] = d.ctverec, H = Math.max(12, ...(d.budovy || []).map((b) => b.top - b.base)), RAD = Math.hypot(d.ram.L, d.ram.W) / 2 || 6;
  return { dir: ci === 0 && cj === 0 ? 'build' : `build/c${ci}_${cj}`, fx: d.ram.x - ci * 2 * HALF, fy: d.ram.y - cj * 2 * HALF, H, RAD,
    fz: d.z + H * 0.4, span: Math.max(RAD * 2.3 + 12, H * 1.5 + 10), mapa: Math.max(70, RAD * 4.2, H * 2.6) };
}

// stránka render.html se scénou čtverce (q = další parametry, např. pam=vse&jen=1)
export async function stranka(browser, port, dir, q, sezona = 'summer') {
  const page = await browser.newPage(), chyby = [];
  page.on('pageerror', (e) => chyby.push('[pageerror] ' + e.message));
  page.on('console', (m) => { const t = m.text(); if (t.startsWith('PAMATKA')) chyby.push(t); });
  await page.goto(`http://127.0.0.1:${port}/render.html?mpp=0.2&tile=1024&season=${sezona}&dir=${dir}&alpha=0&v=${Date.now()}&${q}`);
  await page.waitForFunction(() => window.READY === true, null, { timeout: 300000, polling: 300 });
  page.chyby = chyby;
  return page;
}

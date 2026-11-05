// Share image with a title: close-up of the map, 1200x630, overwrites site/og.jpg from preview.py.
// Run before build_html.py, which puts a hash of the image in its URL: node nastroje/og.mjs SITE_DIR LAT LON KM "Line 1" "Line 2" "Subtitle" "domain"
// Needs build/PixelifySans.ttf (google/fonts, OFL).
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const [root, lat, lon, km, line1, line2, sub, domain] = process.argv.slice(2);
const mime = { '.html': 'text/html', '.json': 'application/json', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
const base = path.resolve(root);
const server = http.createServer((q, s) => {
  let p;
  try { p = decodeURIComponent(new URL(q.url, 'http://x').pathname); } catch { s.writeHead(400); s.end(); return; }
  if (p.endsWith('/')) p += 'index.html';
  const file = path.resolve(base, '.' + p);
  if (!file.startsWith(base + path.sep)) { s.writeHead(403); s.end(); return; }
  fs.readFile(file, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'content-type': mime[path.extname(p)] || 'application/octet-stream' }); s.end(d); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ args: (process.env.IZO_CHROME_ARGS || '').split(' ').filter(Boolean) });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 } });
await ctx.route('**/openseadragon.min.js', (r) => r.fulfill({ path: 'node_modules/openseadragon/build/openseadragon/openseadragon.min.js', contentType: 'text/javascript' }));
await ctx.route('**/fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
const page = await ctx.newPage();
await page.clock.setFixedTime(new Date('2026-11-05T15:30:00+01:00'));
await page.goto(`http://127.0.0.1:${server.address().port}/#@${lat},${lon},${km}`, { waitUntil: 'load' });
await page.waitForTimeout(9000);
const font = fs.readFileSync('build/PixelifySans.ttf').toString('base64');
await page.evaluate(([font, line1, line2, sub, domain]) => {
  const map = document.querySelector('.openseadragon-container').parentElement;
  for (const el of document.body.children) if (!el.contains(map) && el.tagName !== 'SCRIPT') el.style.display = 'none';
  const st = document.createElement('style');
  st.textContent = `@font-face{font-family:Px;src:url(data:font/ttf;base64,${font});font-weight:400 700}
  #og{position:fixed;inset:0;z-index:99999;font-family:Px;pointer-events:none}
  #og .box{position:absolute;left:36px;top:36px;padding:22px 30px 24px;background:#1b2333;color:#eef1e6;box-shadow:8px 8px 0 rgba(0,0,0,.4);border:3px solid #39455f}
  #og .a{font-size:62px;line-height:1;font-weight:500}#og .b{font-size:82px;line-height:1.05;font-weight:700;color:#e8663f}
  #og .c{font-size:27px;margin-top:12px;color:#c9d6b4}
  #og .d{position:absolute;right:36px;bottom:32px;padding:10px 18px;font-size:30px;background:#f2c66d;color:#1b2333;box-shadow:6px 6px 0 rgba(0,0,0,.4)}`;
  document.head.append(st);
  const og = document.createElement('div'); og.id = 'og';
  const box = document.createElement('div'); box.className = 'box';
  for (const [c, t] of [['a', line1], ['b', line2], ['c', sub]]) { const e = document.createElement('div'); e.className = c; e.textContent = t; box.append(e); }
  const d = document.createElement('div'); d.className = 'd'; d.textContent = domain;
  og.append(box, d); document.body.append(og);
  return document.fonts.load('700 82px Px');
}, [font, line1, line2, sub, domain]);
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(root, 'og.jpg'), type: 'jpeg', quality: 88 });
await browser.close().catch(() => {});
server.close(); process.exit(0);

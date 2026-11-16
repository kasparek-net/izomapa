// místní dashboard vlastních modelů památek (před / po): node nastroje/pamatky_server.mjs  (nebo npm run pamatky)  ->  http://127.0.0.1:8792
// Poslouchá jen na tomto počítači. Čte podklady-soukrome/pamatky/ (dashboard.json, img/, fotky z Commons) a rozhodnutí
// ukládá do podklady-soukrome/pamatky/rozhodnuti.json. Snímky vyrobí: node pamatky/pred_po.mjs [slug …]
// /nastaveni.json = název města, adresa mapy (mesto.json "url") a popisky skupin (pamatky/skupiny.json, nepovinné).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const D = path.join(ROOT, 'podklady-soukrome/pamatky');
const PAGE = path.join(ROOT, 'nastroje/pamatky.html');
const PORT = Number(process.env.PORT || 8792);
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.md': 'text/plain; charset=utf-8' };
const RJ = path.join(D, 'rozhodnuti.json');
const HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
const SLUG = /^[a-z0-9-]{1,40}$/;
const cti = (p, def) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return def; } };
fs.mkdirSync(D, { recursive: true });
http.createServer((q, r) => {
  // jen z tohoto počítače a jen z vlastní stránky dashboardu (ochrana před cizí stránkou otevřenou v prohlížeči)
  const org = q.headers.origin;
  if (!HOSTS.has(q.headers.host) || (org && !HOSTS.has(org.replace(/^https?:\/\//, '')))) { r.writeHead(403); r.end(); return; }
  let u; try { u = decodeURIComponent(q.url.split('?')[0]); } catch { r.writeHead(400); r.end(); return; }
  if (u.includes('\0')) { r.writeHead(400); r.end(); return; }
  if (q.method === 'POST' && u === '/rozhodnuti') {
    if (!/^application\/json\b/.test(q.headers['content-type'] || '')) { r.writeHead(415); r.end(); return; }
    let body = ''; q.on('data', (c) => { body += c; if (body.length > 1e5) q.destroy(); });
    q.on('end', () => {
      try {
        const { slug, stav, komentar } = JSON.parse(body);
        if (!SLUG.test(String(slug)) || ![null, 'ok', 'predelat', 'pozdeji'].includes(stav ?? null)) throw new Error('neplatný slug nebo stav');
        const all = cti(RJ, {});
        all[slug] = { stav: stav ?? null, komentar: String(komentar || '').slice(0, 4000), kdy: new Date().toISOString() };
        fs.writeFileSync(RJ, JSON.stringify(all, null, 1));
        r.writeHead(200, { 'content-type': 'application/json' }); r.end('{"ok":true}');
      } catch { r.writeHead(400); r.end(); }
    });
    return;
  }
  if (q.method !== 'GET') { r.writeHead(405); r.end(); return; }
  if (u === '/nastaveni.json') {
    const m = cti(path.join(ROOT, process.env.IZO_MESTO || 'mesto.json'), {});
    r.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    r.end(JSON.stringify({ mesto: m.nazev || '', url: m.url || '', skupiny: cti(path.join(ROOT, 'pamatky/skupiny.json'), {}) }));
    return;
  }
  const fp = u === '/' ? PAGE : path.join(D, u);
  if (fp !== PAGE && (!fp.startsWith(D + path.sep) || !(path.extname(fp) in TYPES) || u.split('/').some((s) => s.startsWith('.')))) { r.writeHead(403); r.end(); return; }
  fs.readFile(fp, (e, d) => {
    if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'content-type': TYPES[path.extname(fp)] || 'application/octet-stream', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); r.end(d);
  });
}).listen(PORT, '127.0.0.1', () => console.log(`památky před/po na http://127.0.0.1:${PORT}`));

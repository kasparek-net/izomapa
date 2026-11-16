// rychlý náhled vlastního modelu památky (bez prepu, scéna čtverce se načte za pár sekund):
//   node pamatky/nahled.mjs <slug> [--pred] [--sam] [--az=225,135,315,45] [--zoom=1] [--velky] [--sezona=winter]
// Výstup podklady-soukrome/pamatky/<slug>/nahled/:
//   arch.png      mřížka 3 × 2: pohled jako mapa (JZ) zblízka, JV, SZ, SV a okolí jako na mapě (stromy, sousedé)
//   po_<az>.png   jednotlivé pohledy 1024 px (s --velky)
// --pred = navíc arch_pred.png s dnešním vzhledem (bez modelu), --sam = arch_sam.png jen s modelem (bez okolních budov).
// Chyby modelu a počet trojúhelníků vypíše do konzole. Model nemusí být v seznam.json (zkouší se přes pamextra).
import fs from 'node:fs'; import path from 'node:path';
import { ROOT, PODKLADY, server, prohlizec, vyrez, stranka } from './_spolecne.mjs';

const args = process.argv.slice(2), opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const slug = args.find((a) => !a.startsWith('--'));
if (!slug || !/^[a-z0-9-]{1,40}$/.test(slug)) { console.log('použití: node pamatky/nahled.mjs <slug> [--pred] [--sam] [--velky] [--zoom=1.3] [--az=225,135,315,45] [--sezona=winter]'); process.exit(1); }
const d = JSON.parse(fs.readFileSync(path.join(ROOT, `pamatky/${slug}.json`), 'utf8'));
if (!d.ram) { console.log(`${slug}: chybí rám – nejdřív .venv/bin/python pamatky/sestav.py ${slug}`); process.exit(1); }
const OUT = path.join(PODKLADY, slug, 'nahled'); fs.mkdirSync(OUT, { recursive: true });
const v = vyrez(d), zoom = parseFloat(opt.zoom || '1'), R = v.RAD + 6, span = v.span / zoom;
const AZ = String(opt.az || '225,135,315,45').split(',').map(Number);
const NAZ = { 225: 'JZ (jako mapa)', 135: 'JV', 315: 'SZ', 45: 'SV' };

const srv = await server(), port = srv.address().port;
const browser = await prohlizec();

async function arch(pam, file, jen = false) {
  const page = await stranka(browser, port, v.dir, `pam=${pam}&pamextra=${slug}${jen ? '&jen=1&pamatka=' + slug : ''}`, opt.sezona || 'summer');
  const info = await page.evaluate(() => ({ log: window.PAM_LOG, stats: window.PAM_STATS }));
  const views = [...AZ.map((az) => ({ az, R, span, trees: false, label: `${NAZ[az] || az + '°'}` })),
    { az: 225, R: 0, span: span * 1.9, trees: true, label: 'okolí jako na mapě' }];
  const png = await page.evaluate(async ({ views, fx, fy, fz, big }) => {
    const S = 512, cols = 3, rows = Math.ceil(views.length / cols), c = document.createElement('canvas');
    c.width = S * cols; c.height = S * rows; const x = c.getContext('2d'); x.fillStyle = '#1b2333'; x.fillRect(0, 0, c.width, c.height);
    const singles = {};
    for (let i = 0; i < views.length; i++) {
      const w = views[i], url = window.renderView(w.az, fx, fy, fz, w.R, w.span, w.trees);
      if (big) singles[`${w.az}${w.trees ? '_okoli' : ''}`] = url;
      const im = new Image(); im.src = url; await im.decode();
      x.drawImage(im, (i % cols) * S, Math.floor(i / cols) * S, S, S);
      x.fillStyle = '#ffffffdd'; x.font = 'bold 18px sans-serif'; x.fillText(w.label, (i % cols) * S + 10, Math.floor(i / cols) * S + 26);
    }
    return { arch: c.toDataURL('image/png'), singles };
  }, { views, fx: v.fx, fy: v.fy, fz: v.fz, big: !!opt.velky });
  fs.writeFileSync(path.join(OUT, file), Buffer.from(png.arch.split(',')[1], 'base64'));
  for (const [k, u] of Object.entries(png.singles)) fs.writeFileSync(path.join(OUT, `${pam === 'vse' ? 'po' : 'pred'}_${k}.png`), Buffer.from(u.split(',')[1], 'base64'));
  await page.close();
  return { ...info, errs: page.chyby };
}
const po = await arch('vse', 'arch.png');
console.log(`${slug}: ${JSON.stringify(po.stats[slug] || 'model se nevolal (je bod v tomto čtverci? existuje pamatky/' + slug + '.js?)')}`);
for (const l of [...po.log, ...po.errs].filter((l) => l.includes(slug) || !/^[a-z0-9-]+(\.js|\.json)?:|PAMATKA CHYBA/.test(l))) console.log('  ! ' + l);
if (opt.sam) await arch('vse', 'arch_sam.png', true);
if (opt.pred) await arch('0', 'arch_pred.png');
console.log('hotovo:', path.relative(ROOT, OUT) + '/arch.png' + (opt.pred ? ' + arch_pred.png' : '') + (opt.sam ? ' + arch_sam.png (jen model)' : ''));
await browser.close(); srv.close();

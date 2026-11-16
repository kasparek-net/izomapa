// snímky před/po pro dashboard památek (nastroje/pamatky.html):
//   node pamatky/pred_po.mjs [slug …]      (bez slugů všechny ze seznam.json, které mají pamatky/<slug>.js)
// Do podklady-soukrome/pamatky/img/: <slug>_pred.jpg (dnes, bez modelu) a <slug>_po.jpg (s modelem) – stejný výřez jako mapa
// (od JZ, se stromy a okolím), <slug>_jz/_jv/_sz/_sv.jpg = jen model ze 4 stran. Souhrn do podklady-soukrome/pamatky/dashboard.json
// a skutečné vršky modelů do pamatky/vrsky.json (obrys při najetí myší, čte prep.py).
import fs from 'node:fs'; import path from 'node:path';
import { ROOT, PODKLADY, server, prohlizec, vyrez, stranka } from './_spolecne.mjs';

const IMG = path.join(PODKLADY, 'img'); fs.mkdirSync(IMG, { recursive: true });
const seznam = JSON.parse(fs.readFileSync(path.join(ROOT, 'pamatky/seznam.json'), 'utf8'));
const want = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const slugs = (want.length ? want : seznam).filter((s) => seznam.includes(s) && fs.existsSync(path.join(ROOT, `pamatky/${s}.js`)));
const D = Object.fromEntries(seznam.map((s) => [s, JSON.parse(fs.readFileSync(path.join(ROOT, `pamatky/${s}.json`), 'utf8'))]));
for (const s of slugs) if (!D[s].ram) { console.log(`${s}: chybí rám – nejdřív .venv/bin/python pamatky/sestav.py ${s}`); process.exit(1); }

const srv = await server(), port = srv.address().port;
const browser = slugs.length ? await prohlizec() : null;
const jpg = async (page, args) => page.evaluate(async ([az, fx, fy, fz, R, span, trees]) => {
  const url = window.renderView(az, fx, fy, fz, R, span, trees), im = new Image(); im.src = url; await im.decode();
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; c.getContext('2d').drawImage(im, 0, 0);
  return c.toDataURL('image/jpeg', 0.9);
}, args);
const save = (f, url) => fs.writeFileSync(path.join(IMG, f), Buffer.from(url.split(',')[1], 'base64'));
const stats = {}, logs = [];
for (const dir of [...new Set(slugs.map((s) => vyrez(D[s]).dir))]) {             // po čtvercích: scéna se načte jednou
  const mine = slugs.filter((s) => vyrez(D[s]).dir === dir);
  // pam=vse = i neschválené (běžný render dlaždic bere jen pamatky/schvalene.json)
  const [pred, po, sam] = [await stranka(browser, port, dir, 'pam=0'), await stranka(browser, port, dir, 'pam=vse'), await stranka(browser, port, dir, 'pam=vse&jen=1')];
  Object.assign(stats, await po.evaluate(() => window.PAM_STATS));
  logs.push(...(await po.evaluate(() => window.PAM_LOG)).filter((l) => mine.some((s) => l.startsWith(s)) || l.startsWith('_kit')), ...po.chyby);
  for (const s of mine) {
    const v = vyrez(D[s]);
    save(`${s}_pred.jpg`, await jpg(pred, [225, v.fx, v.fy, v.fz, 0, v.mapa, true]));
    save(`${s}_po.jpg`, await jpg(po, [225, v.fx, v.fy, v.fz, 0, v.mapa, true]));
    for (const [k, az] of [['jz', 225], ['jv', 135], ['sz', 315], ['sv', 45]]) save(`${s}_${k}.jpg`, await jpg(sam, [az, v.fx, v.fy, v.fz, v.RAD + 4, v.span, false]));
    console.log(s, JSON.stringify(stats[s] || 'model se nevolal'));
  }
  await Promise.all([pred.close(), po.close(), sam.close()]);
}
if (browser) await browser.close();
srv.close();
for (const l of logs) console.log('  ! ' + l);

// vršky modelů (světové souřadnice) pro obrys při najetí myší
const VF = path.join(ROOT, 'pamatky/vrsky.json'), vrsky = fs.existsSync(VF) ? JSON.parse(fs.readFileSync(VF, 'utf8')) : {};
for (const [s, st] of Object.entries(stats)) if (st.vrsek > -1e8 && D[s]) vrsky[s] = { vrsek: st.vrsek, obalka: st.obalka, oids: D[s].oids || [] };
fs.writeFileSync(VF, JSON.stringify(vrsky, null, 1));

// souhrn pro dashboard
const DJ = path.join(PODKLADY, 'dashboard.json'), old = fs.existsSync(DJ) ? JSON.parse(fs.readFileSync(DJ, 'utf8')) : {};
const rd = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
for (const k of Object.keys(old)) if (!seznam.includes(k)) delete old[k];          // vyřazené ze seznamu
for (const s of seznam) {
  const d = D[s], dirS = path.join(PODKLADY, s);
  const zdroje = fs.existsSync(path.join(dirS, 'fotky/zdroje.json')) ? JSON.parse(fs.readFileSync(path.join(dirS, 'fotky/zdroje.json'), 'utf8')) : [];
  old[s] = { ...(old[s] || {}), slug: s, nazev: d.nazev, skupina: d.skupina || '', uskp: d.uskp, wikidata: d.wikidata, lat: d.lat, lon: d.lon,
    preskocit: d.preskocit || null, ma_model: fs.existsSync(path.join(ROOT, `pamatky/${s}.js`)),
    fotky: zdroje.slice(0, 8).map((z) => ({ soubor: `${s}/fotky/${z.soubor}`, autor: z.autor, licence: z.licence, commons: z.commons })),
    model: rd(path.join(dirS, 'model.md')).slice(0, 3000),
    ...(stats[s] ? { stats: stats[s], snimky: Date.now() } : {}) };
}
fs.writeFileSync(DJ, JSON.stringify(old, null, 1));
console.log('hotovo:', slugs.length, 'památek → podklady-soukrome/pamatky/img/, dashboard.json, pamatky/vrsky.json');

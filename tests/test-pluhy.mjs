import assert from 'node:assert/strict';
const store = new Map(); let calls = [];
globalThis.caches = { default: { match: async (k) => store.get(k.url)?.clone(), put: async (k, v) => { store.set(k.url, v); } } };
const PTS = { features: [
  { geometry: { coordinates: [14.90, 50.41] }, properties: { name: 'A1', time: '2026-11-18T06:00:00', speed: 42, control: 0, roadType: 0 } },
  { geometry: { coordinates: [16.60, 49.20] }, properties: { name: 'B2', time: '2026-11-18T06:00:00', speed: 60, control: 1, roadType: 1 } }] };
const OLD = { features: [{ geometry: { type: 'LineString', coordinates: [[14.80, 50.40], [14.85, 50.41], [16.0, 49.0], [16.1, 49.1]] }, properties: { name: 'fromSixtyToThreeHours', control: 0, roadType: 1 } }] };
globalThis.fetch = async (u) => {
  calls.push(String(u));
  const body = String(u).endsWith('LivePoints') ? PTS : String(u).includes('WholeOld') ? OLD : { features: [] };
  return new Response(JSON.stringify(body), { status: 200 });
};
const { onRequest } = await import('../functions/api/pluhy.js');
const ask = (q) => onRequest({ request: new Request('http://x/api/pluhy' + q) });
const Q = '?lamin=50.3&lamax=50.5&lomin=14.7&lomax=15.1';
let r = await ask(Q), d = await r.json();
assert.equal(r.status, 200);
assert.deepEqual(d.pts, [{ id: 'A1', lon: 14.90, lat: 50.41, t: '2026-11-18T06:00:00', v: 42, z: 0, s: 0 }], 'jen vozy ve výřezu');
assert.equal(d.trasy.length, 1); assert.equal(d.trasy[0].a, 2, 'stáří 1–3 h');
assert.deepEqual(d.trasy[0].l, [[14.8, 50.4], [14.85, 50.41], [16, 49]], 'trasa oříznutá na výřez s jedním bodem přesahu');
assert.equal(calls.length, 3);
await ask(Q); assert.equal(calls.length, 3, 'druhý dotaz z cache');
r = await ask('?lamin=x'); assert.equal(r.status, 400);
r = await ask('?lamin=40&lamax=50&lomin=14&lomax=15'); assert.equal(r.status, 400, 'příliš velký výřez');
globalThis.fetch = async () => new Response('busy', { status: 503 }); store.clear();
r = await ask(Q); assert.equal(r.status, 200); assert.deepEqual(await r.json(), { pts: [], trasy: [] }, 'výpadek ŘSD = prázdno');
const worker = (await import('../hlaseni/worker.js')).default;
r = await worker.fetch(new Request('http://x/api/pluhy?lamin=x'), {}); assert.equal(r.status, 400, 'worker posílá /api/pluhy na prostředníka');
console.log('OK: výřez, trasy, cache, chybné parametry, výpadek zdroje, worker');

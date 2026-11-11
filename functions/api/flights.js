// Cloudflare Pages Function: aircraft near the map from adsb.lol (ODbL, no key).
// Browsers cannot call adsb.lol or OpenSky directly (no CORS for other origins), so the map asks this endpoint.
// Query: lamin, lamax, lomin, lomax (the box the map sends); answer is cached for 15 s for all visitors.
export async function onRequest({ request }) {
  const q = new URL(request.url).searchParams;
  const n = (k) => Number.parseFloat(q.get(k));
  const [la0, la1, lo0, lo1] = ['lamin', 'lamax', 'lomin', 'lomax'].map(n);
  if (![la0, la1, lo0, lo1].every(Number.isFinite)) return new Response('{"ac":[]}', { status: 400, headers: { 'content-type': 'application/json' } });
  const lat = ((la0 + la1) / 2).toFixed(2), lon = ((lo0 + lo1) / 2).toFixed(2);
  const src = `https://api.adsb.lol/v2/point/${lat}/${lon}/35`;
  const cache = caches.default, key = new Request(src);
  let r = await cache.match(key);
  if (!r) {
    const up = await fetch(src, { headers: { 'user-agent': 'izomapa' } });
    if (!up.ok) return new Response('{"ac":[]}', { status: 502, headers: { 'content-type': 'application/json' } });
    r = new Response(await up.text(), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=15' } });
    await cache.put(key, r.clone());
  }
  return r;
}

// Drobné objekty: sochy, kašny, pomníky, kříže, boží muka, kapličky, plastiky, památné stromy (opakující se tvary).
// Použití v pamatky/<slug>.js:  import { socha } from './_drobne.js';  export default (M, K) => socha(M, K, { … });
// Všechny tvary stojí v bodě M.bod (K.F, s = východ, t = sever) s posunem o.ds, o.dt a natočením o.a (rad; výchozí −π/4 =
// líc míří k jihozápadu, k divákovi mapy). Rozměry skutečné, ale čitelné (kříž 0,25 m, sokly ≥ 0,8 m).
const KAMEN = '#b3aa98', KAMEN2 = '#9d9483', PISKOVEC = '#c4b38f', ZULA = '#8e8a84', BRONZ = '#56685c', ZELEZO = '#3a3b3e', ZLATO = '#d0aa4a';
const VODA = '#4d7fa0', OMITKA = '#ece6d6', TASKY = '#9c4a30', BRIDLICE = '#4c535c';

const ram = (K, o = {}) => K.F.sub(o.ds || 0, o.dt || 0, o.a ?? -Math.PI / 4);
const z0 = (K, G) => K.vyskaF(G, 0, 0);                                  // terén pod objektem (rámec F je ve výšce M.g)

// sokl / podstavec: o.w šířka, o.d hloubka, o.h výška, o.stupne počet stupňů pod ním
export function sokl(K, G, z, o = {}) {
  const w = o.w ?? 1.0, d = o.d ?? w, h = o.h ?? 1.4, col = o.col || KAMEN, n = o.stupne ?? 1;
  let zz = z - 0.6;
  for (let i = 0; i < n; i++) { const k = (n - i) * 0.35; K.box(G, -w / 2 - k, w / 2 + k, -d / 2 - k, d / 2 + k, zz, z + 0.2 * (i + 1), K.sv(col, 0.93)); zz = z + 0.2 * (i + 1); }
  K.box(G, -w / 2, w / 2, -d / 2, d / 2, zz, zz + h, col);
  K.box(G, -w / 2 - 0.1, w / 2 + 0.1, -d / 2 - 0.1, d / 2 + 0.1, zz + h - 0.18, zz + h, K.sv(col, 1.06));
  if (o.deska) K.box(G, -w * 0.3, w * 0.3, -d / 2 - 0.04, -d / 2, zz + h * 0.35, zz + h * 0.75, o.deska);   // pamětní deska na líci
  return zz + h;
}

// socha (postava) na soklu: o.v výška postavy, o.barva, o.svatozar (svatozář), o.kriz (křížek v ruce), o.dve (dvě postavy)
export function socha(M, K, o = {}) {
  const G = ram(K, o), z = z0(K, G), top = sokl(K, G, z, { w: o.sw ?? 1.1, h: o.sh ?? 1.6, col: o.sokl || KAMEN, stupne: o.stupne ?? 1, deska: o.deska });
  const v = o.v ?? 1.9, col = o.barva || PISKOVEC;
  const lidi = o.dve ? [-0.35, 0.35] : [0];
  for (const u of lidi) K.socha(G, u, 0, top, v, col, { a: 0, ruka: o.ruka, svatozar: o.svatozar ? ZLATO : null });
  if (o.kriz) K.kriz(G, 0.3, -0.2, top + v * 0.55, 0.6, ZLATO);
  if (o.svatozar) for (let i = 0; i < 5; i++) { const a = Math.PI * (0.1 + 0.8 * i / 4); K.box(G, Math.cos(a) * 0.3 - 0.04, Math.cos(a) * 0.3 + 0.04, -0.03, 0.03, top + v + Math.sin(a) * 0.3 - 0.04, top + v + Math.sin(a) * 0.3 + 0.04, ZLATO); }
}

// zvíře (lev, medvěd, kůň, pes …) na soklu: tělo, hlava, nohy
export function zvire(M, K, o = {}) {
  const G = ram(K, o), z = z0(K, G), top = o.sh === 0 ? z : sokl(K, G, z, { w: o.sw ?? 1.6, d: 0.9, h: o.sh ?? 1.0, col: o.sokl || KAMEN, stupne: 0 });
  const k = o.k ?? 1.0, col = o.barva || PISKOVEC;
  K.box(G, -0.7 * k, 0.6 * k, -0.28 * k, 0.28 * k, top + 0.45 * k, top + 1.0 * k, col);
  K.box(G, 0.45 * k, 0.95 * k, -0.24 * k, 0.24 * k, top + 0.8 * k, top + 1.3 * k, K.sv(col, 1.05));
  for (const s of [-0.55, 0.45]) for (const t of [-0.2, 0.2]) K.box(G, (s - 0.1) * k, (s + 0.1) * k, (t - 0.08) * k, (t + 0.08) * k, top, top + 0.5 * k, K.sv(col, 0.9));
}

// busta na pilíři
export function busta(M, K, o = {}) {
  const G = ram(K, o), z = z0(K, G), top = sokl(K, G, z, { w: o.sw ?? 0.7, h: o.sh ?? 1.7, col: o.sokl || ZULA, stupne: o.stupne ?? 1, deska: o.deska });
  const col = o.barva || BRONZ;
  K.box(G, -0.32, 0.32, -0.2, 0.2, top, top + 0.45, col);
  K.rotace(G, 0, 0, top + 0.45, [[0.13, 0], [0.16, 0.15], [0.15, 0.35], [0.08, 0.48], [0.02, 0.5]], 8, col, { buf: 'X' });
}

// kašna: kruhová / osmiboká nádrž s vodou, uprostřed sloup s mísou nebo sochou
export function kasna(M, K, o = {}) {
  const G = ram(K, o), z = z0(K, G), r = o.r ?? 2.5, n = o.n ?? 16, hv = o.okraj ?? 0.6, col = o.barva || KAMEN, rot = o.rot ?? Math.PI / n;
  const zima = K.sezona === 'winter';
  K.jehlan(G, 0, 0, r + 0.25, r + 0.25, z - 0.4, z + hv, n, col, { buf: 'X', rot });
  K.jehlan(G, 0, 0, r + 0.3, r + 0.3, z + hv - 0.1, z + hv + 0.06, n, K.sv(col, 1.08), { buf: 'X', rot, vicko: false });
  K.jehlan(G, 0, 0, r - 0.05, r - 0.05, z, z + hv - 0.12, n, zima ? K.sv(col, 0.9) : VODA, { buf: 'X', rot, vicko: true, aw: zima ? [0, 1, 1, 0] : [0, 1, 0, 0] });
  if (o.stred === 'socha') {
    const top = o.sloup ?? 1.6;
    K.valec(G, 0, 0, 0.45, z, z + top, 8, col);
    K.socha(G, 0, 0, z + top, o.v ?? 2.0, o.socha || BRONZ, { a: 0, ruka: true });
  } else if (o.stred === 'misa') {
    K.valec(G, 0, 0, 0.25, z, z + 1.2, 8, col);
    K.rotace(G, 0, 0, z + 1.1, [[0.2, 0], [0.9, 0.25], [1.0, 0.4]], 12, col, { buf: 'X' });
    if (!zima) K.jehlan(G, 0, 0, 0.85, 0.85, z + 1.42, z + 1.44, 12, VODA, { buf: 'X', vicko: true, aw: [0, 1, 0, 0] });
  } else if (o.stred === 'obelisk') {
    K.jehlan(G, 0, 0, 0.45, 0.3, z, z + 2.6, 4, col, { buf: 'X' }); K.jehlan(G, 0, 0, 0.32, 0, z + 2.6, z + 3.1, 4, col, { buf: 'X' });
  } else if (o.stred === 'plastika') {
    K.koule(G, 0, 0, z + 0.2, o.rk ?? 0.6, o.socha || BRONZ);
  }
}

// pomník: o.tvar 'obelisk' | 'stela' | 'blok' | 'kamen' | 'sloup'; o.v výška, o.w šířka; o.deska barva pamětní desky; o.socha (postava nahoře)
export function pomnik(M, K, o = {}) {
  const G = ram(K, o), z = z0(K, G), v = o.v ?? 3, w = o.w ?? 1.2, col = o.barva || ZULA, tvar = o.tvar || 'obelisk';
  let zz = z - 0.6;
  for (let i = 0; i < (o.stupne ?? 2); i++) { const k = (2 - i) * 0.4; K.box(G, -w / 2 - k - 0.2, w / 2 + k + 0.2, -w / 2 - k - 0.2, w / 2 + k + 0.2, zz, z + 0.2 * (i + 1), K.sv(col, 1.05)); zz = z + 0.2 * (i + 1); }
  if (tvar === 'obelisk') {
    K.box(G, -w / 2, w / 2, -w / 2, w / 2, zz, zz + v * 0.22, col);
    K.jehlan(G, 0, 0, w * 0.42 * Math.SQRT2, w * 0.24 * Math.SQRT2, zz + v * 0.22, zz + v * 0.9, 4, col, { buf: 'X' });
    K.jehlan(G, 0, 0, w * 0.24 * Math.SQRT2, 0, zz + v * 0.9, zz + v, 4, col, { buf: 'X' });
  } else if (tvar === 'stela') K.box(G, -w / 2, w / 2, -w * 0.18, w * 0.18, zz, zz + v, col);
  else if (tvar === 'sloup') { K.box(G, -w / 2, w / 2, -w / 2, w / 2, zz, zz + 0.8, col); K.valec(G, 0, 0, w * 0.3, zz + 0.8, zz + v - 0.4, 10, col); K.box(G, -w * 0.4, w * 0.4, -w * 0.4, w * 0.4, zz + v - 0.4, zz + v, col); }
  else if (tvar === 'kamen') K.rotace(G, 0, 0, zz, [[w * 0.55, 0], [w * 0.6, v * 0.3], [w * 0.5, v * 0.75], [w * 0.2, v]], 7, col, { buf: 'X', rot: 0.3 });
  else K.box(G, -w / 2, w / 2, -w * 0.35, w * 0.35, zz, zz + v, col);
  if (o.deska) K.box(G, -w * 0.3, w * 0.3, -(tvar === 'stela' ? w * 0.18 : tvar === 'blok' ? w * 0.35 : w / 2) - 0.03, -(tvar === 'stela' ? w * 0.18 : tvar === 'blok' ? w * 0.35 : w / 2), zz + 0.3, zz + Math.min(v * 0.2 + 0.5, 1.4), o.deska);
  if (o.socha) K.socha(G, 0, 0, zz + v, o.sv ?? 1.8, o.socha, { a: 0, ruka: true });
  if (o.kriz) K.kriz(G, 0, 0, zz + v, 0.8, o.kriz === true ? ZELEZO : o.kriz);
}

// kříž: o.v celková výška nad terénem, o.sokl výška kamenného soklu, o.mat 'kamen' | 'zelezo' | 'drevo', o.korpus (Kristus)
export function kriz(M, K, o = {}) {
  const G = ram(K, o), z = z0(K, G), v = o.v ?? 4.0, hs = o.sokl ?? 1.3, ws = o.sw ?? 0.8;
  const col = o.mat === 'zelezo' ? ZELEZO : o.mat === 'drevo' ? '#6b4a32' : o.barva || PISKOVEC;
  const top = hs > 0 ? sokl(K, G, z, { w: ws, d: ws, h: hs, col: o.soklb || PISKOVEC, stupne: o.stupne ?? 1, deska: o.deska }) : z;
  const tl = o.tl ?? 0.25, hk = z + v, ra = Math.max(0.5, (hk - top) * 0.28);
  K.box(G, -tl / 2, tl / 2, -tl / 2, tl / 2, top, hk, col);
  K.box(G, -ra, ra, -tl / 2, tl / 2, hk - (hk - top) * 0.32 - tl / 2, hk - (hk - top) * 0.32 + tl / 2, col);
  if (o.korpus) {                                                         // Kristus: tělo a rozpažené ruce, tabulka INRI
    const kc = o.korpus === true ? '#e8e2d2' : o.korpus, hz = hk - (hk - top) * 0.32;
    K.box(G, -0.09, 0.09, -tl / 2 - 0.1, -tl / 2, hz - 0.95, hz - 0.05, kc);
    K.box(G, -ra * 0.85, ra * 0.85, -tl / 2 - 0.08, -tl / 2, hz - 0.05, hz + 0.06, kc);
    K.box(G, -0.07, 0.07, -tl / 2 - 0.1, -tl / 2, hz + 0.06, hz + 0.22, kc);
    K.box(G, -0.16, 0.16, -tl / 2 - 0.05, -tl / 2, hk - 0.28, hk - 0.08, o.mat === 'zelezo' ? '#d8d2c2' : ZELEZO);
  }
  if (o.plotek) { const r = ws / 2 + 0.7; for (const [a, b] of [[[-r, -r], [r, -r]], [[r, -r], [r, r]], [[r, r], [-r, r]], [[-r, r], [-r, -r]]]) K.balustrada(G, a, b, z, 0.8, ZELEZO, { krok: 0.25, sokl: false }); }
  if (o.stromy) for (const [s, t] of [[-1.6, 0.6], [1.6, 0.6]]) K.strom(G, s, t, o.stromy, false);
}

// boží muka: hranolový pilíř s výklenkovou hlavicí, stříškou a křížkem
export function bozimuka(M, K, o = {}) {
  const G = ram(K, o), z = z0(K, G), v = o.v ?? 3.2, w = o.w ?? 0.55, col = o.barva || PISKOVEC;
  K.box(G, -w / 2 - 0.15, w / 2 + 0.15, -w / 2 - 0.15, w / 2 + 0.15, z - 0.5, z + 0.4, K.sv(col, 0.92));
  K.box(G, -w / 2, w / 2, -w / 2, w / 2, z + 0.4, z + v - 1.0, col);
  K.box(G, -w / 2 - 0.12, w / 2 + 0.12, -w / 2 - 0.12, w / 2 + 0.12, z + v - 1.0, z + v - 0.25, col);
  K.box(G, -0.2, 0.2, -w / 2 - 0.15, -w / 2 - 0.1, z + v - 0.9, z + v - 0.4, '#3a3e44');                   // výklenek s obrázkem
  K.jehlan(G, 0, 0, (w / 2 + 0.25) * Math.SQRT2, 0, z + v - 0.25, z + v + 0.35, 4, o.strecha || KAMEN2, { buf: 'X' });
  K.kriz(G, 0, 0, z + v + 0.3, 0.55, ZELEZO);
}

// kaplička / zastavení křížové cesty: o.w šířka, o.d hloubka, o.h výška zdí, o.zvonicka, o.mala (výklenková kaplička)
export function kaplicka(M, K, o = {}) {
  const G = ram(K, o), z = z0(K, G), w = o.w ?? 2.4, d = o.d ?? 2.8, h = o.h ?? 2.6, col = o.barva || OMITKA, str = o.strecha || TASKY;
  K.box(G, -w / 2, w / 2, -d / 2, d / 2, z - 0.5, z + h, col);
  K.box(G, -w / 2 - 0.05, w / 2 + 0.05, -d / 2 - 0.05, d / 2 + 0.05, z - 0.5, z + 0.3, K.sv(col, 0.8));
  K.sedlo(G, -w / 2, w / 2, -d / 2, d / 2, z + h, o.v ?? Math.min(2.2, w * 0.6), str, { osa: 't', presah: 0.25, stit: col });
  if (o.mala) K.box(G, -w * 0.28, w * 0.28, -d / 2 - 0.05, -d / 2, z + h * 0.35, z + h * 0.85, '#3a3e44');        // výklenek s obrazem
  else K.dvere(G, [w / 2, -d / 2], [-w / 2, -d / 2], w / 2, Math.min(1.1, w * 0.45), Math.min(2.1, h * 0.8), { oblouk: 'pul', barva: '#5a4030', ram: K.sv(col, 0.9), ramS: 0.15 });
  if (o.zvonicka) { const hs = z + h + (o.v ?? Math.min(2.2, w * 0.6)); K.box(G, -0.3, 0.3, -d / 2 + 0.2, -d / 2 + 0.8, hs - 0.6, hs + 0.6, col); K.jehlan(G, 0, -d / 2 + 0.5, 0.5, 0, hs + 0.6, hs + 1.5, 4, BRIDLICE); K.kriz(G, 0, -d / 2 + 0.5, hs + 1.45, 0.5, ZELEZO); }
  else K.kriz(G, 0, -d / 2 + 0.1, z + h + (o.v ?? Math.min(2.2, w * 0.6)) - 0.05, 0.6, ZELEZO);
}

// abstraktní plastika: o.tvar 'koule' | 'blok' | 'kvet' | 'kapka' | 'oblouk' | 'trojice' | 'figura'; o.v výška, o.barva
export function plastika(M, K, o = {}) {
  const G = ram(K, o), z = z0(K, G), v = o.v ?? 2.0, col = o.barva || KAMEN, tv = o.tvar || 'blok';
  const zz = o.sokl ? sokl(K, G, z, { w: o.sw ?? 1.0, h: o.sokl, col: KAMEN2, stupne: 0 }) : z;
  if (tv === 'koule') K.koule(G, 0, 0, zz, v / 2, col);
  else if (tv === 'trojice') for (const [s, r] of [[-0.9, 0.45], [0, 0.6], [0.95, 0.4]]) K.koule(G, s, 0, zz, r, col);
  else if (tv === 'kvet') { K.valec(G, 0, 0, 0.25, zz, zz + v * 0.6, 8, col); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; K.tram(G, [0, 0, zz + v * 0.55], [Math.cos(a) * v * 0.35, Math.sin(a) * v * 0.35, zz + v], 0.3, 0.15, col); } }
  else if (tv === 'kapka') K.rotace(G, 0, 0, zz, [[0.05, 0], [v * 0.3, v * 0.2], [v * 0.25, v * 0.55], [0.03, v]], 10, col, { buf: 'X' });
  else if (tv === 'oblouk') { const n = 8, r = v / 2; for (let i = 0; i < n; i++) { const a0 = Math.PI * i / n, a1 = Math.PI * (i + 1) / n; K.tram(G, [Math.cos(a0) * r, 0, zz + Math.sin(a0) * r * 1.6], [Math.cos(a1) * r, 0, zz + Math.sin(a1) * r * 1.6], 0.35, 0.35, col); } }
  else if (tv === 'figura') K.socha(G, 0, 0, zz, v, col, { a: 0, ruka: true });
  else if (tv === 'sloupek') { K.box(G, -0.3, 0.3, -0.3, 0.3, zz, zz + v, col); K.box(G, -0.4, 0.4, -0.4, 0.4, zz + v, zz + v + 0.15, K.sv(col, 1.1)); }
  else { K.box(G, -v * 0.3, v * 0.3, -v * 0.2, v * 0.2, zz, zz + v * 0.7, col); K.box(G, -v * 0.18, v * 0.22, -v * 0.15, v * 0.15, zz + v * 0.7, zz + v, K.sv(col, 1.06)); }
}

// památný strom: pixelový strom mapy (sezónní barvy) + odklizení obecných stromů kolem, volitelně lavička / cedule / oplocení
export function strom(M, K, o = {}) {
  const G = ram(K, o), z = z0(K, G), v = o.v ?? 20;
  K.stromyPryc(G, 0, 0, o.pryc ?? 4.5);
  K.strom(G, 0, 0, v, !!o.jehlicnan);
  if (o.cedule !== false) { K.box(G, 1.6, 1.7, 1.6, 1.7, z - 0.3, z + 1.3, '#4a3a2a'); K.box(G, 1.45, 1.85, 1.55, 1.6, z + 0.9, z + 1.4, '#e8e2c8'); }
  if (o.lavicka) { const L = G.sub(-2.2, -1.2, 0.5); K.box(L, -0.8, 0.8, -0.22, 0.22, z + 0.38, z + 0.45, '#7a5838'); K.box(L, -0.8, 0.8, 0.15, 0.22, z + 0.45, z + 0.85, '#7a5838'); for (const s of [-0.65, 0.65]) K.box(L, s - 0.04, s + 0.04, -0.2, 0.2, z, z + 0.38, ZELEZO); }
  if (o.plot) { const r = o.plot; for (let i = 0; i < 8; i++) { const a0 = i / 8 * Math.PI * 2, a1 = (i + 1) / 8 * Math.PI * 2; K.balustrada(G, [Math.cos(a0) * r, Math.sin(a0) * r], [Math.cos(a1) * r, Math.sin(a1) * r], z, 0.6, '#6b4a32', { krok: 0.6, sokl: false }); } }
}

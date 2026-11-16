// UKÁZKA použití stavebnice (není to žádná konkrétní památka): činžovní dům na půdorysu z dat,
// okna po patrech na hranách viditelných z mapy, římsy, střecha po dílech z prepu, nárožní věžička s bání.
// Zkopíruj si jako pamatky/<slug>.js a přepiš podle fotek. Náhled: node pamatky/nahled.mjs <slug>
export default function (M, K) {
  const ZED = '#e2d6b8', RIMSA = '#f0e8d2', SOKL = '#9a8f7c', STRECHA = K.C.tasky, MED = K.C.med;
  const F = K.F;                                   // hlavní rámec: s podél delší strany, t napříč, h = výška nad terénem (M.g)
  const P = K.pudorys(0, F);                       // půdorys z dat v souřadnicích rámce
  const H = 15.5;                                  // okap (podle laseru v podkladu)
  // 1) hmota: sokl (od K.dno, aby dům na svahu nevisel) + omítnuté zdi
  K.hranol(F, P, K.dno, 1.2, SOKL, { vicko: false });
  K.hranol(F, P, 1.2, H, ZED, { vicko: false });
  // 2) římsy: kordon nad přízemím a hlavní římsa pod střechou
  K.rimsa(F, P, 4.2, 0.35, 0.18, RIMSA);
  K.rimsa(F, P, H - 0.5, 0.5, 0.45, RIMSA);
  // 3) okna na každé delší volné hraně (u hran k divákovi s šambránou a záklenkem v 1. patře)
  for (const e of K.hrany(F, P)) {
    if (e.L < 3 || e.soused > 0.5) continue;      // krátké hrany a štítové zdi u souseda bez oken
    const vid = e.divak > 0;
    K.okna(F, e.A, e.B, { rady: [[1.6, 3.4]], rozestup: 3.2, sirka: 1.4, sklo: K.C.sklo2, ram: null, parapet: false });   // výlohy v přízemí
    K.okna(F, e.A, e.B, { rady: [[5.2, 7.4]], rozestup: 3.2, sirka: 1.2, oblouk: vid ? 'seg' : 0, ram: vid ? RIMSA : null });
    K.okna(F, e.A, e.B, { rady: [[8.6, 10.6], [11.9, 13.9]], rozestup: 3.2, sirka: 1.2, ram: vid ? RIMSA : null });
  }
  // 4) střecha po dílech z dat (valba / sedlo podle prepu), okap o kousek výš než římsa
  K.strechaZDat(0, STRECHA, { h: H, v: 5 });
  // 5) nárožní věžička na rohu nejblíž k divákovi (roh s nejmenším s + t ve směru k divákovi)
  const kd = F.kDivakovi, roh = P.reduce((a, q) => (q[0] * kd[0] + q[1] * kd[1] > a[0] * kd[0] + a[1] * kd[1] ? q : a));
  const st = [roh[0] - kd[0] * 1.6, roh[1] - kd[1] * 1.6];
  K.valec(F, st[0], st[1], 2.2, H - 0.5, H + 3.2, 10, ZED);
  K.okna(F.sub(st[0], st[1]), [2.25, -1.2], [2.25, 1.2], { pocet: 1, sirka: 0.9, rady: [[H, H + 2.2]], oblouk: 'pul' });
  K.cibule(F, st[0], st[1], 2.4, H + 3.2, 6.5, MED, { lucerna: ZED });
  K.kriz(F, st[0], st[1], H + 9.7, 1.4);
}

---
name: pamatky
description: Vlastní 3D modely památek (kostel, radnice, zámek, kašna) pro hotovou mapu izomapy, od výběru kandidátů přes podklady a modely až po schválení uživatelem v dashboardu a render. Použij, až když je mapa hotová a uživatel o modely požádá.
---

Jsi koordinátor podle `pamatky/ZADANI_MODELARE.md`. Přečti celé zadání a `pamatky/README.md` a postupuj podle
sekce „Postup koordinátora“.

- V Claude Code jsou role připravené jako agenti: `reserser` (podklady a popis, stačí levnější model) a
  `modelar` (nejvýš 3 najednou, nejschopnější model). Každému dej seznam slugů v pořadí priority a jméno pro frontu.
  Bez pomocných agentů modeluj sám, stavbu po stavbě.
- Řekni uživateli předem, že velká stavba spotřebuje znatelnou část limitu předplatného.
- **Schvaluje jen uživatel** v dashboardu (`npm run pamatky`, http://127.0.0.1:8792). Nikdy neklikej Schváleno za
  něj a nezapisuj `rozhodnuti.json`.
- Do dlaždic jdou jen schválené (`pamatky/render_mapa.sh`). Nic nenasazuj.

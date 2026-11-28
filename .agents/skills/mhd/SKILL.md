---
name: mhd
description: Přidání jezdící MHD a vlaků do mapy izomapy podle jízdních řádů (GTFS dopravce nebo krajského systému, vlaky z CIS JŘ), včetně kontroly tras po stavbě. Použij, když uživatel chce v mapě autobusy, tramvaje, trolejbusy nebo vlaky.
---

Podklad je v `CLAUDE.md`: bod 3 postupu (odstavec **MHD**) a v sekci „Co ladit a jak“ položky **Vlaky** a
**Vlaky z celostátního jízdního řádu**.

Postup:
1. Zjisti sám, jestli má dopravce města veřejné GTFS, nebo je město v krajském systému. Do `mesto.json` doplň
   `mhd.gtfs` (URL zipu), `mhd.zdroj`, `mhd.zdroj_url`. Upozorni uživatele, ať si ověří podmínky dopravce.
2. Vlaky: `"vlak"` v `mesto.json` (model z katalogu `TRAINS` ve `web/js/80-vozidla.js`); bez tvarů tras v GTFS
   CIS JŘ přes `nastroje/vlaky_vyber.py` a `nastroje/vlaky.py`.
3. Jen jízdní řády beze změny mapy: `python mhd.py` a `python build_html.py` (poslední kroky `postav.sh`);
   jinak `./postav.sh render`.
4. Po stavbě v náhledu (`npm run nahled`) projdi trasy: vozidla jedou po silnicích, nestojí, nejezdí přes domy.
5. Trolejbusy nebo jiné barvy vozidel: nabídni vlastní model v `drawVehicle` (`web/js/84-kresleni-vozidel.js`),
   podklad jen fotky uživatele nebo volně licencované z Wikimedia Commons.

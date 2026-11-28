# Kontrola změny před pull requestem (pro AI agenty)

Kontroluje se rozdíl proti `upstream/main` (nebo `origin/main`): `git diff upstream/main...HEAD`. Kontrola jen
čte a hlásí. Obecné chyby v logice hledej taky, ale hlavně to, co je specifické pro izomapu a obecný reviewer nepozná.

## Kontroly

1. **Žádná data města.** Do PR nepatří `mesto.json`, `mista.json`, `obce/`, nic z `assets/`, `pamatky/*.js|json`
   (kromě `_kit.js`, `_ukazka.js`, `_drobne.js`), `fotky/`, `podklady/`, `podklady-soukrome/`, `build/`, `site/`,
   `data*/`, `.dev.vars`, hesla, klíče. `git diff --stat` a `git status` – co tam nemá být, je nález nejvyšší závažnosti.
2. **Žádný kód konkrétního města ve sdíleném kódu.** Názvy ulic, budov, souřadnice nebo výjimky jednoho města
   v `prep.py`, `overlay.py`, `render.html`, `web/js/` patří do `assets/custom_prep.py` / `assets/custom_models.js`
   (ukázky v `priklady/`), nebo do dat (`assets/upresneni.json`, `mesto.json`).
3. **Struktura zrcadlená s Libercem.** Prohlížeč je `web/js/NN-*.js`, číslo = oddíl, stejně jako v autorově repu
   Liberce, změny se přebírají po souborech. Nepřesouvat kód mezi soubory ani nepřejmenovávat bez dohody s autorem.
   Nový soubor = nové číslo na správném místě.
4. **Windows.** Soubory s češtinou se čtou a zapisují s `encoding='utf-8'`, skripty běží v Git Bash, žádné natvrdo
   `.venv/bin/python` ve skriptech (vzor: `postav.sh`), `PYTHONUTF8=1` ve shellových skriptech.
5. **Cizí texty.** Názvy z OSM, GTFS, Wikidat a texty návštěvníků se do stránky vkládají přes `textContent`, ne
   `innerHTML`; odkazy jen `http(s)`. Server (`hlaseni/worker.js`, `functions/api/`) ověřuje vstupy a SQL má
   vázané parametry.
6. **Render.** Změna `prep.py` nemá bez důvodu měnit scénu: `prep.py` je deterministický, porovnej
   `build/c<i>_<j>/scene.json` před a po na postaveném čtverci. Změna `render.html` znamená nový render celé mapy
   u všech uživatelů (otisk renderu) – má to být v popisu PR.
7. **Testy a návod.** `./tests/run.sh` projde. Nová volba v `mesto.json` nebo nový nástroj je popsaný v `CLAUDE.md`
   (sekce „Co ladit a jak“) a případně v README.
8. **Rozsah.** Jedno téma na PR, malý diff. Název česky ve stylu repa („Oprava: …“, „Letadla: …“), v popisu co a proč,
   jak je to ověřené a co ověřené není.

## Zpráva

Nálezy seřazené od nejzávažnějšího: `soubor:řádek`, co je špatně, proč to vadí, jak to ověřit nebo opravit.
Na konci verdikt **MŮŽE JÍT** nebo **NEJDŘÍV OPRAVIT** a seznam toho, co jsi nekontroloval.

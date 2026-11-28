# Kontrola mapy (pro AI agenty)

Po stavbě (`./postav.sh`) nebo po `./postav.sh render` projdi výsledek dřív, než ho ukážeš uživateli. Kontrola
jen čte a hlásí, nic neopravuje: opravy navrhni koordinátorovi (hlavnímu agentovi), ten je probere s uživatelem.

## Postup

1. Náhled: `python compose.py summer 8` → `build/nahled_summer.png` (celá mapa, každý 8. pixel). Prohlédni ho.
2. Podezřelá místa si přibliž: výřez z dlaždic čtverce (`build/c<i>_<j>/` nebo `build/` pro 0,0) nebo z
   `site/tiles` (Deep Zoom, vyšší úrovně = víc detailu). Výřez dělej Pythonem (Pillow) do `build/kontrola/`, ne do `site/`.
3. Porovnej s ortofotem: `build/orto_cele.jpg`, je-li stažené (`nastroje/les.py`). Nikdy ne s Google Maps,
   Apple Maps ani Mapy.cz.
4. Když běží náhled (`npm run nahled`, http://127.0.0.1:8000), můžeš zkontrolovat i klikací vrstvu: obrys budovy
   při najetí sedí na budovu, karta místa má text, auta jedou po silnicích.

## Na co se dívat

- **Švy mezi čtverci** (2,3 × 2,3 km): přerušené silnice, useknuté budovy nebo stromy, skok barvy terénu nebo pole.
- **Prázdná místa:** chybějící dlaždice, černé nebo průhledné plochy, čtverec bez budov (chyba v datech nebo prep).
- **Divné barvy:** černé střechy (nestažené ortofoto), les tam, kde je zástavba, a naopak (`nastroje/les.py`),
  zelené parkoviště, modrá plocha mimo vodu.
- **Budovy:** nesmyslná výška (porovnej s `build/dmp_kontrola.csv`), budova dvakrát přes sebe (kandidát na
  `skryt_budovy` v `assets/upresneni.json`), dominanta bez věže nebo s věží na špatné straně.
- **Cesty a koleje:** most „skokánek“, silnice přes dům, trať do ničeho.
- **Vánoční vrstva, MHD a vlaky** jen když jsou zapnuté v `mesto.json`.

## Zpráva

Česky, stručně, seřazeno od nejhoršího. U každého nálezu: kde (čtverec `i,j` a přibližné `lat, lon`, nebo
pixel v náhledu), co je špatně, pravděpodobná příčina (data / prep / render / ruční úprava) a návrh opravy podle
sekce „Co ladit a jak“ v `CLAUDE.md`. Přilož cesty k výřezům. Co jsi nekontroloval, napiš.

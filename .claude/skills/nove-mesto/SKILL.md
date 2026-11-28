---
name: nove-mesto
description: Založení a stavba izometrické mapy nového českého města v izomapě („udělej mi izometrickou mapu Chrastavy“). Použij, když uživatel chce mapu svého města nebo obce, od kontroly katalogu přes volbu rozlišení, MHD, zvířata a potoky až po stavbu a kontrolu.
argument-hint: "[název města]"
---

Postupuj podle sekce „Postup pro nové město“ v `CLAUDE.md` (body 1–9), krok po kroku, česky a věcně.
Před dlouhými kroky řekni, kolik budou trvat.

Kontrolní body, na které se nezapomíná:
1. Prostředí (`./setup.sh`) a katalog https://izomapa.fun/mesta/ – je už město hotové?
2. `novy_mesto.py` → počet čtverců a odhad času; u velkého města nabídni `--max 4`.
3. Zeptej se na rozlišení (základní / detailní), MHD, zvířata, potoky, letadla, sypače. Volby zapiš do
   `mesto.json`, stáda do `assets/upresneni.json` – před stavbou.
4. Texty v `mesto.json` (rod: „Izometrická Chrastava“).
5. `./postav.sh` na pozadí.
6. Kontrola výsledku podle `navody/kontrola_mapy.md` (v Claude Code agent `kontrolor-mapy`), pak `npm run nahled`.
7. Řekni uživateli, že mapu musí projít a porovnat se skutečností. Kredit autora v mapě nech.

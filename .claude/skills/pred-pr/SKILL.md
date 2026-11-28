---
name: pred-pr
description: Příprava změny obecného kódu izomapy na pull request do adamklatovsky/izomapa – testy, kontrola diffu podle pravidel projektu (žádná data města, žádný kód jednoho města ve sdíleném kódu, struktura zrcadlená s Libercem), název a popis PR. Použij, než pošleš vylepšení šablony autorovi.
---

1. Změna je ve vlastní větvi z `upstream/main` (fork, ne přímo `main`), jedno téma na větev.
2. `./tests/run.sh` projde. Změna `prep.py`: porovnej `scene.json` postaveného čtverce před a po.
3. Projdi diff podle `navody/review.md` (v Claude Code agent `reviewer`). Nálezy oprav, nebo je napiš do popisu PR.
4. Název česky ve stylu repa („Oprava: …“, „Letadla: …“), v popisu co a proč, jak je to ověřené a co ne.
5. PR otevři, jen když o to uživatel požádá.

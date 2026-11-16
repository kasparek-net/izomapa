# Knihovna `profanity`

Jednoduchá klientská knihovna pro validaci nevhodných výrazů v textových vstupech (přezdívky, poznámky apod.).

## Použití v doplňku

V `manifest.json` doplňku uveďte:

```json
{
  "libs": ["profanity"]
}
```

Zavaděč načte knihovnu jednou před spuštěním skriptů doplňku. V JS pak stačí zavolat:

```js
const profanity = Izomapa.getLib('profanity');
if (!profanity.isValid(nickname)) {
  // zobrazit chybu uživateli
}
```

## Poznámka k server-side validaci

Tato knihovna běží pouze v prohlížeči a slouží pro rychlou zpětnou vazbu uživateli (UX). Pokud doplněk ukládá uživatelské texty na server, **je nutné obdobnou validaci začlenit i do jeho server-side kódu** pro plnohodnotné ošetření (klientský JavaScript lze obejít).

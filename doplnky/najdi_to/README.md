# Doplněk „Najdeš to?“ (`najdi_to`)

Interaktivní hledací hra nad izometrickou mapou města. Funguje v režimu čistě v prohlížeči (`client`) i s anti-cheat serverovým ověřováním přes bezstavové HMAC tickety (`server`), s povinnou přezdívkou po každém levelu, automatickým zápisem do TOP 10 žebříčku pro každou úroveň i celkově, kontrolou 1 soutěžního pokusu a filtrací sprostých slov.

Doplněk využívá sdílené knihovny z `knihovny/` (`profanity` a `server_client`), které si vyžádá v `manifest.json` přes `"libs": ["profanity", "server_client"]`, a vykresluje nalezené body jak do DOM vrstvy doplňku, tak pulzující animací do plátna mapy přes `Izomapa.onFrame`.

## Rychlé zapnutí

1. Zkopírujte `doplnky/najdi_to/priklady/najdi_to.json` do `assets/doplnky/najdi_to.json` (podporován je i zpětně kompatibilní `assets/najdi_to.json`) a upravte úrovně a otázky pro vaše město.
2. Pro výchozí `client` režim není potřeba nic dalšího (`plugins.py` doplněk automaticky aktivuje podle `assets/doplnky/najdi_to.json`).
3. Pro `server` režim vytvořte `assets/doplnky.json`:

```json
{
  "najdi_to": {
    "enabled": true,
    "mode": "server",
    "profanity_filter": true,
    "one_attempt_only": true,
    "server_url": "api/najdi_to.php",
    "private": {
      "server_data_out": "site_server/server_data/najdi_to.targets.json"
    }
  }
}
```

## Nasazení serveru (`server` režim)

- Spusťte `python overlay.py`:
  - Do veřejného `site/overlay.json` se zapíší pouze názvy úrovní a texty otázek (žádné souřadnice ani odpovědi, klíč `"private"` se do `site/overlay.json` nikdy nepropíše).
  - Tajné souřadnice cílů se uloží do `site_server/server_data/najdi_to.targets.json` (mimo veřejný `site/`, včetně `.htaccess`).
  - PHP adaptér `doplnky/najdi_to/server/php/najdi_to.php` se automaticky zkopíruje do `site/api/najdi_to.php`.
- Při prvním požadavku si `najdi_to.php` automaticky vygeneruje tajný HMAC klíč do `site_server/server_data/najdi_to.secret` a SQLite databázi `site_server/server_data/najdi_to.sqlite` (příp. JSON fallback), takže funguje ihned po nahrání `site/` a `site_server/` na PHP hosting. Volitelně lze vytvořit vlastní `site/api/config.php` podle `config.sample.php` (pro vlastní `secret_key`, `admin_key` pro `?audit=1` nebo jiné cesty).

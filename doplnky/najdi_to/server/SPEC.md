# Serverové API doplňku „Najdeš to?“

Doplněk využívá v režimu `server` JSON REST protokol (volaný na klientovi přes sdílenou knihovnu `knihovny/server_client`) s bezstavovými HMAC-SHA256 tickety, per-level TOP 10 žebříčky a filtrací sprostých slov:

- **Ticket**: `base64url(JSON_payload) + "." + hex(HMAC_SHA256(base64url_payload, SECRET_KEY))`
- **Akce (`POST` JSON)**:
  1. `start` (`levelId`, `difficulty`, `season`) -> `{ order, questionIds, ticket }`
  2. `verify` (`x`, `y`, `ticket`) -> `{ hit, completed, elapsedMs?, targetHint?, answer?, ticket }` (při `hit: false` vrací pouze `{ hit: false, completed: false, ticket }`)
  3. `submit_level` (`nickname`, `ticket`) -> po každé dokončené úrovni zapíše přezdívku a čas do TOP 10 žebříčku dané úrovně `{ saved, levelId, timeMs, rank, entries }`
  4. `finish` (`nickname`, `tickets`) -> po splnění všech úrovní zapíše do celkového TOP 10 žebříčku a vystaví `{ saved, totalTimeMs, rank, certificateId }`
  5. `leaderboard` (`levelId?`) -> `{ entries, overall, levels }` (TOP 10 celkově i TOP 10 pro každou úroveň zvlášť)
- **Jeden soutěžní pokus & anti-replay**: zapnuto ve výchozím stavu (`"one_attempt_only": true`). Každý ticket má jednorázové `jti` (nelze ho uplatnit dvakrát) a z jednoho `audit_hash` se do každé úrovně i do celkového žebříčku zapíše pouze první dokončený pokus; další pokus vrátí HTTP `200` se `saved: false`, `alreadyPlayed: true`, `rank: null` a `message`.
- **Filtrace sprostých slov**: zapnuta ve výchozím stavu (`"profanity_filter": true`). Klient provádí okamžitou kontrolu přes sdílenou knihovnu `knihovny/profanity/profanity.js` a server provádí plnohodnotnou kontrolu při `submit_level` i `finish` (nevhodná přezdívka vrací HTTP `400`, `error: "profanity_nickname"`).
- **GDPR otisk**: `audit_hash = substr(hex(HMAC_SHA256(client_ip + "|" + YYYY-WW, SECRET_KEY)), 0, 12)` bez ukládání surové IP adresy.
- **Volitelný audit (`GET ?audit=1&key=...`)**: chráněný tajným klíčem `admin_key` z `config.php` nebo proměnné prostředí `NAJDI_TO_ADMIN_KEY`, s automatickým promazáváním mezikroků starších než 14 dní.

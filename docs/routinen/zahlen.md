# Routine "Social Zahlen"

Läuft täglich früh. Holt Follower, Tageswerte (Reichweite, Aufrufe, Interaktionen, Seitenbesuche, neue Follower),
Zielgruppe und Kennzahlen je Post.
Dashboard (Artefakt): https://claude.ai/artifact/6SheLVeDXVWVUF6ctwVTA6

1. Repo bereitstellen (wie in `posten.md`).
2. ArtifactData `query` auf `posts` mit `where: [["status","in",["published","partial"]]]`.
   Daraus alle Kanäle mit `results.<kanal>.status == "ok"` der letzten 90 Tage sammeln.
3. ArtifactData `list` auf `metrics` (mit `out_dir`, `limit` 1000). Die Dokumente der letzten 14 Tage
   als `existing` übernehmen: `{ "<YYYY-MM-DD>": <data des Dokuments> }`. Die `version` je Dokument merken.
4. `tmp/metrics.json` schreiben:
   `{ "days": 14, "published": [{ "post_id", "channel", "external_id" }], "existing": {...} }`.
   Gibt es in `metrics` weniger als 30 Dokumente, `"days": 90` setzen und alle Dokumente als `existing` übernehmen
   (Facebook liefert dann 90 Tage rückwirkend).
   Dann `node scripts/social.js metrics tmp/metrics.json > tmp/metrics-out.json`.
5. Ergebnis speichern, beides als `batch` (höchstens 50 Einträge je Batch, sonst aufteilen):
   - Jedes Dokument aus `docs` mit `set` nach `metrics/<datum>`. Die Dokumente sind schon zusammengeführt,
     also unverändert übernehmen. `if_version` angeben, wenn das Dokument vorher existierte.
   - Je Post die Werte aus `posts.<kanal>.<post_id>` als `results.<kanal>.stats` in das Post-Dokument schreiben
     (`update` mit if_version, results vorher lesen und nur `stats` ersetzen, dazu `stats_at` mit dem Zeitpunkt).
6. `errors` je Kanal kurz in `status/runner.summary` vermerken. `missing` nicht als Fehler melden,
   das zeigt das Dashboard selbst als Hinweis an (z. B. fehlendes Recht instagram_manage_insights).

## Shop und Newsletter (Reiter Zahlen › Shop und › Newsletter)

7. `node scripts/shop.js metrics tmp/metrics.json > tmp/shop-out.json` (dieselbe Datei wie oben, genutzt wird nur `days`).
   Liest nur: WooCommerce-Bestellungen (nur Summen, keine Kundendaten) und MailPoet-Kennzahlen über
   `/wp-json/zipperwalls/v1/newsletter/stats` (Code-Snippet `wordpress/zipperwalls-newsletter-snippet.php`).
8. Speichern als `batch` (höchstens 50 Einträge je Batch):
   - Jeder Tag aus `shop` mit `set` nach `shop/<datum>` (Werte unverändert übernehmen, `if_version` bei vorhandenen Dokumenten).
     Tage ohne Bestellung haben kein Dokument; ein vorhandenes Dokument für einen Tag im Abrufzeitraum, der in `shop` fehlt
     (z. B. weil eine Bestellung storniert wurde), löschen.
   - `status/shop` mit `set`: `{ fetched_at, since: <erster Tag des Abrufzeitraums, YYYY-MM-DD>, lists, missing, errors }`.
     `since` nur nach hinten verschieben, wenn es vorher schon früher lag (also das ältere Datum behalten).
   - Je Eintrag aus `newsletters` (Schlüssel = Dokument-ID, z. B. `nl-1`) `update` auf `newsletters/<key>` mit
     `open_rate, click_rate, unsubscribes, stats` und `stats_at` (if_version). Nur für Dokumente, die es gibt.
9. `missing: ["mailpoet_stats"]` heißt: Das Code-Snippet in WordPress ist noch nicht aktualisiert. Nicht als Fehler melden.

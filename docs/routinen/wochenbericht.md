# Routine "Wochenbericht"

Läuft jeden Montag früh. Schickt eine Mail mit dem Rückblick auf die letzte Woche (Montag bis Sonntag) und dem,
was diese Woche ansteht: Reichweite und Follower, veröffentlichte Posts, Shop-Umsatz, verschickte Newsletter,
neue Bewertungen, Termine und fällige To-dos (Wunsch Bela, 22.10.2026).
Dashboard (Artefakt): https://claude.ai/artifact/6SheLVeDXVWVUF6ctwVTA6

1. Repo bereitstellen (wie in `posten.md`).
2. Doppelte Mails vermeiden: ArtifactData `get` auf `status/wochenbericht`. Steht dort `week` gleich dem Montag der
   Vorwoche (YYYY-MM-DD): fertig.
3. ArtifactData `list` (mit `out_dir`, `limit` 1000) auf `posts`, `newsletters`, `metrics`, `reviews`, `shop` und `todos`.
   Daraus `tmp/wochenbericht.json` schreiben: `{ "posts": [<data jedes Dokuments plus "id">], "newsletters": [...], ... }`.
4. `node scripts/wochenbericht.js tmp/wochenbericht.json`.
5. Mail mit dem Gmail-Connector (`send_message`) an **info@darienpfirrmann.de**: `subject` und `body` aus der Ausgabe unverändert.
6. `status/wochenbericht` setzen: `{ week, sent_at: <jetzt>, summary }` (`set`, mit if_version falls vorhanden).
7. Nichts anderes tun: nicht freigeben, nicht posten, keine weiteren Mails, nichts committen.

# Routine "Social Zahlen"

Läuft täglich früh. Holt Follower und Post-Kennzahlen.
Dashboard (Artefakt): https://claude.ai/artifact/6SheLVeDXVWVUF6ctwVTA6

1. Repo bereitstellen (wie in `posten.md`).
2. ArtifactData `query` auf `posts` mit `where: [["status","in",["published","partial"]]]`.
   Daraus alle Kanäle mit `results.<kanal>.status == "ok"` der letzten 60 Tage sammeln.
3. `tmp/metrics.json` schreiben: `{ "published": [{ "post_id", "channel", "external_id" }] }`,
   dann `node scripts/social.js metrics tmp/metrics.json`.
4. Ergebnis speichern: Dokument `metrics/<YYYY-MM-DD>` (`set`) mit
   `{ "facebook": { "account": {...} }, "instagram": {...}, "linkedin": {...} }` (nur `account` je Kanal).
   Je Post die Werte aus `channels.<kanal>.posts.<post_id>` als `results.<kanal>.stats` in das Post-Dokument schreiben
   (`update` mit if_version, results vorher lesen und nur `stats` ergänzen). Mehrere Schreibvorgänge als `batch`.
5. Fehler je Kanal (`errors`) kurz in `status/runner.summary` vermerken.

# Routine "Social Posting"

Läuft werktags stündlich. Veröffentlicht freigegebene Posts aus dem Dashboard.
Dashboard (Artefakt): https://claude.ai/artifact/6SheLVeDXVWVUF6ctwVTA6

Grundregeln: Nur Posts mit Status `approved` oder `scheduled` veröffentlichen, deren `scheduled_at` erreicht ist.
Nie Texte ändern, nie selbst freigeben, nie Entwürfe posten. Veröffentlicht wird ausschließlich über
`scripts/social.js`, nicht mit eigenen API Aufrufen. Zugangsdaten nie ausgeben oder in die Datenbank schreiben.

## Ablauf

1. Repo bereitstellen: `belapfirrmann/zipperwalls.de` (Branch laut Routine) klonen, falls nicht vorhanden. Kein `npm install` nötig.
2. Verbindungen prüfen: `node scripts/social.js check`, Ergebnis per ArtifactData als Dokument `status/connections` speichern (`set`).
3. Fällige Posts holen: ArtifactData `query` auf Collection `posts` mit `where: [["status","in",["approved","scheduled"]]]`.
   Davon nur die mit `scheduled_at` kleiner oder gleich jetzt (UTC). Keine fälligen: weiter mit Schritt 5.
4. Für jeden fälligen Post (ältester zuerst, höchstens 5 pro Lauf):
   1. Sperre setzen: `update` mit `if_version` auf `{ "status": "publishing", "updated_at": <jetzt> }`. Schlägt das fehl, hat sich der Post geändert: überspringen.
   2. Bilder laden: Hat der Post `slides` (Liste von Asset-IDs, Karussell), jedes davon in dieser Reihenfolge holen.
      Sonst für `image` und `image_linkedin` (falls gesetzt) das Asset mit dem Artifact Tool holen
      (`action: "read"`, `url` wie oben, `path`: die Asset ID, `out_dir`: `tmp/`). Pfad merken.
   3. Job Datei `tmp/job-<id>.json` schreiben:
      `{ "post": { "variants", "body", "hashtags", "channels", "results" aus dem Dokument }, "images": { "main": <Pfad image>, "linkedin": <Pfad image_linkedin oder weglassen>, "slides": [<Pfade der Slides in Reihenfolge>] } }`
      (`slides` nur bei Karussell; dann werden alle Kanäle als Karussell gepostet)
   4. `node scripts/social.js publish tmp/job-<id>.json` ausführen. Ausgabe ist JSON `{ status, results }`.
   5. Zurückschreiben (`update`): `status` = Ausgabe status (published, partial oder failed),
      `results` = bisherige results zusammengeführt mit den neuen (Kanal für Kanal; ein neuer Eintrag ersetzt den alten des Kanals vollständig, ein altes `error` fällt also weg), `updated_at` = jetzt.
      Bricht das Skript ab (Exit Code ungleich 0), `status: "failed"` und die Fehlermeldung in `results` beim betroffenen Kanal.
5. Aufträge aus dem Dashboard (kind `social`) abarbeiten nach `auftraege.md`. Danach weiter.
6. Hängende Posts: Steht ein Post seit mehr als 30 Minuten auf `publishing`, auf `failed` setzen mit Hinweis in `results`. Nicht erneut senden.
7. Lauf protokollieren: `status/runner` setzen auf `{ "last_run": <jetzt>, "summary": "<kurz: wie viele gepostet, Fehler>" }`.
8. Bei Fehlern (partial oder failed) in der Antwort kurz nennen, welcher Post und welcher Kanal.

Ohne fällige Posts, ohne Aufträge und ohne Fehler: Lauf kurz halten, keine weitere Ausgabe.

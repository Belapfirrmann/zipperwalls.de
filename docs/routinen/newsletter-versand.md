# Routine "Newsletter Versand"

Läuft werktags stündlich. Plant freigegebene Newsletter („Standpunkt“) aus dem Dashboard automatisch in MailPoet ein,
zeitgleich mit dem gekoppelten Social-Media-Post, und meldet den Stand zurück.
Dashboard (Artefakt): https://claude.ai/artifact/6SheLVeDXVWVUF6ctwVTA6

Technik: Auf zipperwalls.de läuft das Code-Snippet „Zipperwalls Newsletter-Schnittstelle (Claude)“ (Code Snippets Nr. 95,
Quelle `wordpress/zipperwalls-newsletter-snippet.php`). Es stellt `/wp-json/zipperwalls/v1/newsletter/*` bereit und nutzt intern
die MailPoet-Funktionen von „Speichern“ und „Einplanen“. Angesprochen wird es ausschließlich über `scripts/newsletter.js`.

Grundregeln: Nur Newsletter mit Status „Freigegeben“ einplanen. Nie Texte freigegebener Newsletter ändern, nie selbst freigeben, nie an andere Listen
als `LIST_IDS` (`src/newsletter-sync.js`, Liste 3 „Infopost zipperwalls.de“) senden. Keine eigenen Aufrufe an WordPress oder
MailPoet, nichts anderes auf der Website verändern. Zugangsdaten (`WP_USER`, `WP_APP_PASSWORD`) nie ausgeben oder speichern.

## Ablauf

1. Repo bereitstellen: `belapfirrmann/zipperwalls.de` (Branch laut Routine) klonen, falls nicht vorhanden. Kein `npm install` nötig.
2. Verbindung prüfen: `node scripts/newsletter.js info`. Bei Fehler: `status/newsletter_runner` setzen auf
   `{ "last_run": <jetzt>, "ok": false, "summary": "<Fehler>" }` und Lauf beenden.
3. Daten holen (ArtifactData, `list`): Collection `newsletters` (alle Dokumente) und Collection `posts` (für die Termine der gekoppelten Posts).
4. Eingabe `tmp/nl-input.json` schreiben: `{ "now": <jetzt ISO>, "newsletters": [ { "id": <doc id>, ...Felder } ], "posts": { "<plan_nr>": { "scheduled_at": ... } } }`
   und `node scripts/newsletter.js plan tmp/nl-input.json` ausführen. Ausgabe: `{ actions: [ { key, action, send_at?, reason? } ] }`.
   Keine Aktionen: weiter mit Schritt 6.
5. Je Aktion (Dokument vorher mit `get` lesen, jede Änderung mit `update` und `if_version`):
   - `schedule`: `tmp/nl-<key>.json` = `{ "key": <key>, "doc": <Felder des Dokuments>, "send_at": <send_at aus der Aktion> }`,
     dann `node scripts/newsletter.js schedule tmp/nl-<key>.json`.
     Erfolg: `{ status: "In MailPoet eingeplant", mailpoet_id: newsletter.id, mp_state: "scheduled", mp_scheduled_for: <send_at>,
     send_at: <send_at>, planned_at: <jetzt>, mp_error: null, updated_at: <jetzt> }`.
     Fehler: nur `{ mp_error: "<Meldung>", updated_at }`, Status bleibt „Freigegeben“ (nächster Lauf versucht es erneut).
   - `unschedule`: `node scripts/newsletter.js unschedule <key>`. Erfolg: `{ mp_state: newsletter.status, mp_scheduled_for: null, updated_at }`.
   - `check`: `node scripts/newsletter.js status <key>`. MailPoet-Status `sent`: `{ status: "Versendet", mp_state: "sent", sent_at: <sent_at>, updated_at }`.
     `sending`: `{ mp_state: "sending" }`. Kein Newsletter gefunden: `{ mp_error: "In MailPoet nicht mehr gefunden.", status: "Freigegeben" }`.
   - `missed`: `{ status: "Verschoben", mp_error: "Termin verpasst (<send_at>), nicht gesendet. Bitte neuen Termin abstimmen und erneut freigeben.", updated_at }`.
   - `error`: `{ mp_error: <reason>, updated_at }`.
6. Aufträge aus dem Dashboard (kind `newsletter`) abarbeiten nach `auftraege.md`. Neu angelegte Entwürfe sind „Entwurf“ und werden erst nach Freigabe eingeplant.
7. Lauf protokollieren: `status/newsletter_runner` setzen auf `{ "last_run": <jetzt>, "ok": true, "summary": "<kurz: eingeplant, versendet, Fehler>" }`.
8. Bei Fehlern in der Antwort kurz nennen, welcher Newsletter und welche Meldung.

Ohne Aktionen, ohne Aufträge und ohne Fehler: Lauf kurz halten, keine weitere Ausgabe.

## Testen ohne echte Empfänger

- Testmail an eine Adresse: `node scripts/newsletter.js preview job.json` mit `{ key: "test-…", doc, email }`.
- Einplanen an die Testliste: `schedule` mit `"segment_ids": [4]` und einem `key` wie `test-…`; danach `trash test-…`.
- Nur das HTML ansehen: `node scripts/newsletter.js html job.json`.

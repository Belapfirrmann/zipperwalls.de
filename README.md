# Zipperwalls Social Media Dashboard

Plan, Freigabe, Abhakeliste und Zahlen für Facebook, Instagram und LinkedIn, dazu der Newsletter-Plan (MailPoet). Läuft komplett in Claude, ohne eigenen Server.

- **Dashboard**: Claude Artefakt https://claude.ai/artifact/6SheLVeDXVWVUF6ctwVTA6 (privat). Daten in der Artefakt-Datenbank, Bilder als Artefakt-Assets.
- **Posten**: Claude Routine, stündlich. Holt freigegebene Posts und veröffentlicht sie mit `scripts/social.js`.
- **Entwürfe**: Claude Routine, Mo und Mi. Legt die Posts aus dem Redaktionsplan als Entwurf an.
- **Zahlen**: Claude Routine, täglich.
- **Jetzt erstellen** (Social-Plan und Newsletter-Plan): schickt über den Connector „Claude Code Remote“ einen Auftrag an eine Claude-Sitzung. Social an die Dashboard-Sitzung, Newsletter an die Newsletter-Sitzung (IDs in `dashboard/app.js`, CLAUDE_TARGETS, oder ohne Neuveröffentlichung im Dokument `status/targets`). Beauftragungen stehen in der Collection `requests`.

Ablauf: Entwurf erscheint unter "Freigabe" > Bela oder Darien prüfen > "Jetzt posten" oder "Planen" > beim nächsten Lauf veröffentlicht Claude.

Einrichtung: `docs/SETUP.md`. Anleitungen der Routinen: `docs/routinen/`.

| Pfad | Inhalt |
|---|---|
| `dashboard/` | Quellen des Dashboards (`app.js`, `style.css`, Logo) |
| `scripts/build-dashboard.js` | baut `dist/social-dashboard.html` (eine Datei fürs Artefakt) |
| `scripts/social.js` | Kommandozeile: `publish`, `metrics`, `check` |
| `src/jobs.js` | Veröffentlichen, Wiederholen ohne Doppelpost, Kennzahlen, Verbindungsprüfung |
| `src/publishers/` | Facebook, Instagram, LinkedIn |
| `src/text.js` | Textregeln (Hashtags, Zeichengrenzen, Platzhalter), gemeinsam für Dashboard und Skript |
| `src/redaktionsplan.js` | Redaktionsplan, erzeugt aus `plans/Redaktionsplan_*.xlsx` |
| `src/newsletterplan.js` | Newsletter-Plan, erzeugt aus `plans/Newsletter-Plan_*.xlsx` |
| `src/newsletter-render.js` | Newsletter als E-Mail-HTML im Zipperwalls-Design (Vorschau im Dashboard) |
| `test/` | Tests (`npm test`) |

## Redaktionsplan aktualisieren

```bash
pip install openpyxl
python3 scripts/import_plan.py plans/Redaktionsplan_Social_Media_Q1_2027.xlsx
npm test && npm run build
```
Danach `dist/social-dashboard.html` von Claude auf dieselbe Artefakt-Adresse veröffentlichen lassen.

## Newsletter

Reiter **Newsletter-Plan** zeigt den Versandkalender aus dem Newsletter-Plan. Die **Freigabe** ist zweigeteilt:
Social Media und Newsletter. Newsletter-Ablauf: Entwurf prüfen und freigeben (Darien) › in MailPoet einplanen und
„In MailPoet eingeplant“ klicken › nach dem Versand „Als versendet markieren“ › nach etwa 7 Tagen Kennzahlen eintragen.
Änderungen und Status liegen in der Artefakt-Datenbank, Collection `newsletters`, Dokument `nl-<Nr>`
(Felder wie im Plan plus `status`, `approved_at`, `planned_at`, `sent_at`, `open_rate`, `click_rate`, `unsubscribes`).
Status-Werte wie in der Tabelle: Entwurf, Verschoben, Freigegeben, In MailPoet eingeplant, Versendet, Gestrichen.
In der Freigabe erscheinen nur angelegte Entwürfe, mit gestalteter Vorschau (Newsletter „Standpunkt“, `src/newsletter-render.js`),
Vollbild als Desktop- oder Handy-Ansicht und klickbaren Links. Wie Claude einen Entwurf anlegt: `docs/routinen/newsletter-entwuerfe.md`.

Neuen Newsletter-Plan einspielen:

```bash
python3 scripts/import_newsletter.py plans/Newsletter-Plan_Q1_2027.xlsx
npm test && npm run build
```

## Merkliste für später

- **Postingzeiten anpassen (nach etwa zwei Quartalen, frühestens April 2027):** Anhand der Zahlen im Dashboard prüfen,
  zu welchen Wochentagen und Uhrzeiten die Posts am besten laufen (Reichweite, Interaktionen je Post, Veröffentlichungszeit
  steht in `results.<kanal>.at`). Dann die Uhrzeit im Redaktionsplan (`rhythm.time`) und ggf. die Tage anpassen.
  Die Routine "Social Posting" läuft werktags stündlich 7 bis 19 Uhr und braucht dafür keine Änderung, solange die neue Zeit
  in diesem Fenster liegt. Hinweis: Die Meta-Kennzahl "Follower online" bräuchte die Berechtigung `instagram_manage_insights`,
  die aktuell nicht angeboten wird.

## Routinen (eingerichtet am 04.10.2026)

| Routine | Zeitplan (deutsche Zeit) | ID |
|---|---|---|
| Social Posting | Mo bis Fr, stündlich 7:02 bis 19:02 | trig_01ERtb1TXuFCvLryHAS7HwYA |
| Social Entwürfe | Mo und Mi 7:22 | trig_01C3paD3D2UCSy8iNpyYGsSe |
| Social Zahlen | täglich 6:22 | trig_01AED9zLW4vaZ67DP7Kj6G5B |
| Newsletter Versand | Mo bis Fr, stündlich 7:12 bis 19:12 | trig_017ZCmKkwwBohkyF9PbG72Sc |

Newsletter-Versand: Freigegebene Newsletter plant die Routine über das Code-Snippet Nr. 95 „Zipperwalls Newsletter-Schnittstelle (Claude)“ auf zipperwalls.de in MailPoet ein (Liste 3 „Infopost zipperwalls.de“, Termin des gekoppelten Posts). Anleitung: `docs/routinen/newsletter-versand.md`, Snippet-Quelle: `wordpress/zipperwalls-newsletter-snippet.php`. Abschalten: Snippet in Code Snippets deaktivieren.

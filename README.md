# Zipperwalls Social Media Dashboard

Plan, Freigabe, Abhakeliste und Zahlen für Facebook, Instagram und LinkedIn. Läuft komplett in Claude, ohne eigenen Server.

- **Dashboard**: Claude Artefakt https://claude.ai/artifact/6SheLVeDXVWVUF6ctwVTA6 (privat). Daten in der Artefakt-Datenbank, Bilder als Artefakt-Assets.
- **Posten**: Claude Routine, stündlich. Holt freigegebene Posts und veröffentlicht sie mit `scripts/social.js`.
- **Entwürfe**: Claude Routine, Mo und Mi. Legt die Posts aus dem Redaktionsplan als Entwurf an.
- **Zahlen**: Claude Routine, täglich.

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
| `src/redaktionsplan.js` | Redaktionsplan, erzeugt aus `plans/*.xlsx` |
| `test/` | Tests (`npm test`) |

## Redaktionsplan aktualisieren

```bash
pip install openpyxl
python3 scripts/import_plan.py plans/Redaktionsplan_Social_Media_Q1_2027.xlsx
npm test && npm run build
```
Danach `dist/social-dashboard.html` von Claude auf dieselbe Artefakt-Adresse veröffentlichen lassen.

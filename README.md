# Zipperwalls Social Media Dashboard

Dashboard für Plan, Freigabe, Abhakeliste und Zahlen der Zipperwalls Kanäle (Facebook, Instagram, LinkedIn).

Ablauf: Der Claude Agent liefert zweimal pro Woche einen Entwurf (`docs/AGENT-API.md`). Bela oder Darien prüfen ihn
im Dashboard und klicken "Jetzt posten" oder "Planen". Der Worker veröffentlicht automatisch auf allen gewählten
Kanälen und holt täglich die Kennzahlen.

Technik: Cloudflare Worker (`src/`), D1 Datenbank (`migrations/`), R2 für Bilder, statisches Frontend (`public/`),
Login über Cloudflare Access. Kein Build Schritt.

Einrichtung: `docs/SETUP-APIS.md`

## Redaktionsplan aktualisieren

Der Plan liegt als Excel in `plans/` und wird mit einem Skript in `src/redaktionsplan.js` übersetzt:

```bash
pip install openpyxl
python3 scripts/import_plan.py plans/Redaktionsplan_Social_Media_Q1_2027.xlsx
npm test && npm run deploy
```

Im Dashboard kann jeder Planeintrag mit "Als Entwurf anlegen" direkt in die Freigabe übernommen werden
(Texte je Kanal, Hashtags, Termin 09:00 Uhr). Grafiken dann unter "Freigabe" hochladen.

| Pfad | Inhalt |
|---|---|
| `src/worker.js` | Router, Admin API, Agent API |
| `src/publish.js` | Veröffentlichen, Wiederholen ohne Doppelpost, Cron, Kennzahlen |
| `src/publishers/` | Facebook, Instagram, LinkedIn |
| `src/oauth.js` | Verbinden der Konten |
| `src/redaktionsplan.js` | Redaktionsplan (erzeugt aus `plans/*.xlsx`) |
| `src/plan.js` | Vorlagen der Abhakeliste |
| `public/` | Dashboard |
| `test/` | Tests (`npm test`) |

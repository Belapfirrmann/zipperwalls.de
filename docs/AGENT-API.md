# Agent API: Posts ins Dashboard liefern

Der Claude Agent erstellt zweimal pro Woche einen Post und schickt ihn per HTTP an das Dashboard.
Dort erscheint er unter "Freigabe" als Entwurf. Veröffentlicht wird erst, wenn Bela oder Darien auf
"Jetzt posten" oder "Planen" klicken.

## Zugang

- Basis URL: `https://social.zipperwalls.de` (bzw. die URL eures Workers)
- Header: `Authorization: Bearer <AGENT_API_TOKEN>`
- Das Token ist ein Worker Secret. Im Claude Projekt als geheime Angabe hinterlegen, nie in einen Post oder ein Repo schreiben.

## Post einliefern

`POST /api/agent/posts` mit JSON:

| Feld | Pflicht | Beschreibung |
|---|---|---|
| `title` | ja | Interner Titel, z. B. "Referenz Messe Frankfurt" |
| `body` | ja | Haupttext (Sie-Ansprache, keine Gedankenstriche) |
| `hashtags` | nein | Liste, mit oder ohne `#`. Werden angehängt, falls nicht im Text |
| `variants` | nein | Eigener Text je Kanal: `{ "linkedin": "...", "instagram": "...", "facebook": "..." }` |
| `channels` | nein | Standard alle drei: `["facebook","instagram","linkedin"]` |
| `image_base64` + `image_type` | nein | Bild als Base64, `image/jpeg` (empfohlen, Instagram nimmt nur JPEG) oder `image/png`, max. 8 MB |
| `image_url` | nein | Alternativ eine öffentliche https URL zum Bild |
| `scheduled_at` | nein | Vorschlag für den Termin (ISO 8601). Gilt erst nach Freigabe |
| `images` | nein | Eigenes Bild je Kanal, z. B. `{ "linkedin": { "base64": "...", "type": "image/jpeg" } }` oder `{ "linkedin": { "url": "https://..." } }`. Laut Plan: LinkedIn 1200 x 1200, Instagram und Facebook 1080 x 1350 als Hauptbild |
| `plan_nr` | nein | Nummer des Eintrags im Redaktionsplan (Spalte "Nr"). Verknüpft den Post mit dem Plan; ohne `scheduled_at` wird der Plantermin um 09:00 Uhr übernommen |
| `notes` | nein | Hinweis an die Admins, z. B. offene Punkte aus dem Plan |

Instagram braucht immer ein Bild. Texte mit Platzhaltern wie `[DATUM]` oder `[ZEITEN]` werden angenommen, lassen sich aber erst freigeben, wenn der Platzhalter ersetzt ist. Grenzen: Instagram 2.200 Zeichen und 30 Hashtags, LinkedIn 3.000 Zeichen.

Beispiel:

```bash
curl -X POST https://social.zipperwalls.de/api/agent/posts \
  -H "Authorization: Bearer $AGENT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Aufbau in 5 Minuten",
    "body": "Ein Messestand, der in fünf Minuten steht. Ohne Werkzeug.",
    "hashtags": ["messebau", "messewand", "zipperwalls"],
    "variants": { "linkedin": "Für Messeverantwortliche: Aufbau in fünf Minuten, ohne Werkzeug." },
    "image_url": "https://zipperwalls.de/bilder/aufbau.jpg",
    "scheduled_at": "2026-10-06T08:00:00Z",
    "notes": "Säule: Produkt und Aufbau"
  }'
```

Antwort `201`: `{ "id": "...", "status": "draft", "review_url": "https://.../#freigabe" }`

## Weitere Endpunkte

- `GET /api/agent/posts/{id}`: Status des Posts und Ergebnis je Kanal (Link, Fehler, Kennzahlen)
- `GET /api/agent/summary`: Plan, letzte Posts und Kennzahlen. So kann der Agent sehen, was gut lief, und den nächsten Post daran ausrichten.

## Anweisung für den Agent (zum Einfügen ins Claude Projekt)

> Hole mit `GET /api/agent/summary` den Redaktionsplan. Nimm den nächsten Eintrag (Dienstag oder Donnerstag),
> zu dem `post` noch leer ist. Erstelle die Grafiken nach dem Zipperwalls Brand Kit (Instagram und Facebook
> 1080 x 1350 mit dem Bildtext aus dem Plan, LinkedIn 1200 x 1200) und liefere den Post per
> `POST /api/agent/posts` ein: `plan_nr`, `title`, `body`, `variants` mit den drei Plantexten, `hashtags`,
> Hauptbild als `image_base64` (JPEG) und LinkedIn Bild unter `images.linkedin`. Offene Punkte aus dem Plan
> in `notes`. Veröffentliche nie selbst. Die Freigabe erfolgt im Dashboard durch Bela oder Darien.

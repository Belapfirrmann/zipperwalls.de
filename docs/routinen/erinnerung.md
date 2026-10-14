# Routine "Freigabe-Erinnerung"

Läuft täglich am Nachmittag. Schickt Darien eine E-Mail, wenn für **morgen** ein Social-Media-Post oder ein Newsletter
geplant ist, der noch nicht freigegeben ist (Wunsch Bela, 14.10.2026). Ist alles freigegeben, geht keine Mail raus.
Dashboard (Artefakt): https://claude.ai/artifact/6SheLVeDXVWVUF6ctwVTA6

1. Repo bereitstellen (wie in `posten.md`).
2. ArtifactData `list` auf `posts` und auf `newsletters` (mit `out_dir`). Daraus `tmp/erinnerung.json` schreiben:
   `{ "posts": [<data jedes Dokuments plus "id">], "newsletters": [<ebenso>] }`.
3. `node scripts/erinnerung.js tmp/erinnerung.json`. Ist `items` leer: fertig, keine Mail.
4. Doppelte Mails vermeiden: ArtifactData `get` auf `status/reminder`. Steht dort `date` gleich dem `date` der Ausgabe: fertig.
5. Mail mit dem Gmail-Connector (`send_message`) an **info@darienpfirrmann.de**: `subject` und `body` aus der Ausgabe unverändert.
6. `status/reminder` setzen: `{ date, sent_at: <jetzt>, items: <Anzahl> }` (`set`, mit if_version falls vorhanden).
7. Nichts anderes tun: nicht freigeben, nicht posten, keine weiteren Mails, nichts committen.

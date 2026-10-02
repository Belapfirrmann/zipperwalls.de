# Routine "Social Entwürfe"

Läuft montags und mittwochs morgens. Legt die Posts für Dienstag und Donnerstag als Entwurf ins Dashboard.
Dashboard (Artefakt): https://claude.ai/artifact/6SheLVeDXVWVUF6ctwVTA6

## Ablauf

1. Repo bereitstellen (wie in `posten.md`). Plan steht in `src/redaktionsplan.js` (`REDAKTIONSPLAN.entries`).
2. Nächsten Eintrag bestimmen: den frühesten Eintrag mit Datum in den nächsten 3 Tagen, zu dem es in Collection `posts`
   noch kein Dokument `plan-<nr>` gibt (ArtifactData `get`). Gibt es keinen: Lauf beenden.
3. Grafiken erstellen nach dem Skill `brandkit` (Social Media Formate): Instagram und Facebook 1080 x 1350 px,
   LinkedIn 1200 x 1200 px, Bildtext = `headline` aus dem Plan, Logo als Originaldatei. Als JPEG speichern.
   Bilder als Assets ins Artefakt laden (Artifact Tool, `url` wie oben, `asset: true`, `file_path`). IDs merken.
   Kann keine Grafik erstellt werden, ohne Bild weitermachen und das in `notes` vermerken.
4. Dokument `posts/plan-<nr>` anlegen (`set`, ohne if_version):
   ```json
   {
     "title": "#<nr> <topic>", "plan_nr": <nr>, "status": "draft", "source": "claude",
     "body": <facebook Text>, "variants": { "instagram": ..., "facebook": ..., "linkedin": ... },
     "hashtags": <hashtags>, "channels": ["facebook","instagram","linkedin"],
     "image": <Asset ID 4:5 oder null>, "image_linkedin": <Asset ID 1:1 oder null>,
     "notes": "Plan Nr. <nr>, KW <kw>, <pillar>. Offen: <note>",
     "scheduled_at": <Datum 09:00 Uhr Berliner Zeit als UTC ISO>, "results": {},
     "created_at": <jetzt>, "updated_at": <jetzt>
   }
   ```
   Texte unverändert aus dem Plan übernehmen. Platzhalter wie [DATUM] nicht selbst ausfüllen.
5. Nie freigeben oder posten. Das machen Bela oder Darien im Dashboard.

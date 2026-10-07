# Routine "Social Entwürfe"

Läuft montags und mittwochs morgens. Legt die Posts für Dienstag und Donnerstag als Entwurf ins Dashboard.
Dashboard (Artefakt): https://claude.ai/artifact/6SheLVeDXVWVUF6ctwVTA6

## Ablauf

1. Repo bereitstellen (wie in `posten.md`). Plan steht in `src/redaktionsplan.js` (`REDAKTIONSPLAN.entries`).
2. Nächsten Eintrag bestimmen: den frühesten Eintrag mit Datum in den nächsten 3 Tagen, zu dem es in Collection `posts`
   noch kein Dokument `plan-<nr>` gibt (ArtifactData `get`). Gibt es keinen: Lauf beenden.
3. Grafiken erstellen nach dem Skill `brandkit` (Social Media Formate): Instagram und Facebook 1080 x 1350 px,
   LinkedIn 1200 x 1200 px. Als JPEG speichern.
   - **Kein Zipperwalls-Logo in der Grafik.** Das Logo steht schon als Profilbild über jedem Post, im Bild würde es sich doppeln
     (Vorgabe Bela und Darien, 04.10.2026). Das gilt vor allen Brandkit-Regeln zur Logoplatzierung.
   Verbindliche Regeln von Bela und Darien:
   - **Jede Grafik enthält mindestens ein echtes Foto** (Produkt, Stand, Aufbau, Detail). Reine Text-Grafiken sind nicht erlaubt.
     Kein passendes Foto verfügbar: keine Grafik bauen, `image` und `image_linkedin` auf null lassen und in `notes`
     „FOTO fehlt: <welches Motiv gebraucht wird>“ eintragen. Nie ein Foto erfinden oder ein Fremdlogo zeigen.
   - **Fotoquelle:** zuerst Bilder, die Bela und Darien im Dashboard hochgeladen haben, sonst Produkt- und Standbilder aus dem
     Shop zipperwalls.de (passend zum Thema des Posts, z. B. Messestand-Sets mit mehreren Wänden). Keine Bilder mit
     sichtbarem Fremdlogo. Ausnahme: Das Logo „PIXLIP GO“ ist erlaubt (fast alle Standbilder im Shop zeigen es,
     Freigabe von Bela und Darien am 04.10.2026). Keine KI-Bilder ohne ausdrücklichen Hinweis in `notes`.
   - **Abwechslung bei Produkten und Bildern** (Vorgabe Bela und Darien, 06.10.2026). Der Shop hat weit mehr als PIXLIP GO:
     Messewände gerade und gebogen, Theken, Promotiontheken, LED-Theken, Leuchtkästen, Deckenhänger, Digital Signage,
     Kundenstopper, Beachflags, Outdoor-Zelte, Rollups, Prospektständer, Textilrahmen und komplette Messestand-Sets.
     - Katalog nach Produktfamilie: `plans/shop-katalog.json` (vorher `node scripts/shop-katalog.mjs` ausführen, aktualisiert ihn).
     - Vor dem Bauen die Felder `products` der letzten vier Posts lesen (Collection `posts`, nach `scheduled_at`).
       Das Hauptmotiv (Bild bzw. Slide 1) stammt aus einer anderen Produktfamilie als bei den letzten zwei Posts.
       PIXLIP GO als Hauptmotiv höchstens bei jedem dritten Post, außer der Post handelt von PIXLIP GO.
     - Karussell: jedes Slide ein anderes Foto, möglichst aus mindestens drei Produktfamilien, wenn das Thema es zulässt.
       Ein Produkt-Post (z. B. „EASE L“) zeigt sein Produkt, aber verschiedene Ansichten (Anwendung, Detail, Transport).
     - Bildarten mischen: Anwendung mit Menschen oder auf der Messe, freigestelltes Produkt, Detail.
     - **Jedes Shopbild vor der Verwendung ansehen.** Viele zeigen das Lieferantenlogo „a.“ oder den Schriftzug „adsystem“
       oder fremde Kunden- und Markenlogos: solche Bilder nicht verwenden. Das Zipperwalls-Logo auf einem Produktdruck ist erlaubt.
     - Im Post-Dokument `products` setzen (Liste der Produktfamilien in Bildreihenfolge) und in `notes` die Shopseiten der Fotos nennen.
   - **Heller Hintergrund ist der Standard** (Weiß `#FFFFFF` oder `#F5F5F5`, Text `#1D1D1B`, farbiges Logo auf Weiß,
     schwarzes Logo auf Hellgrau). Das dunkle Footer-Grün `#1F2725` nur als Ausnahme: höchstens jeder vierte Post,
     nie zwei Posts hintereinander.
   - **Keine Herkunftsangaben**: nie Ortsnamen (insbesondere nie „Herxheim“), nie „aus Deutschland“, „Made in Germany“
     oder Ähnliches, weder im Bild noch im Text. Steht so etwas im Plan, nicht übernehmen, sondern in `notes` melden.
   - Bildtext = `headline` aus dem Plan, Barlow Black, Versalien, ein gelbes Signalelement.
   - **Tipp-Posts (Pillar „Ratgeber“, Titel mit „Messe-Tipp“, Checklisten) und Posts mit mehreren Punkten immer als Karussell**
     (Vorgabe Bela und Darien, 04.10.2026): 1080 x 1350 px je Slide, 3 bis 10 Slides.
     Slide 1: Titelbild mit Headline und Foto. Danach **ein Slide pro Punkt**: Nummer, kurze Überschrift, zwei bis drei Sätze
     Erklärung und ein passendes Foto. Letzter Slide: kurze Zusammenfassung oder Hinweis auf den Ratgeber.
     Gleicher heller Stil auf allen Slides, kein Logo. Slides als Assets hochladen und die IDs in Reihenfolge in `slides` eintragen,
     `image` = erste Slide, `image_linkedin` = null.
   - **Texte bei Tipp-Posts: jeden Punkt im Text ausführen** (nummerierte Liste, je Punkt ein bis zwei Sätze Erklärung), nicht nur aufzählen.
     Wenn es im Ratgeber auf zipperwalls.de/wissen einen passenden Beitrag gibt, am Ende darauf hinweisen (bei Instagram ohne Link,
     „mehr im Ratgeber auf zipperwalls.de“). Fachlich nichts erfinden, nur Fakten aus dem Plan, dem Shop oder dem Ratgeber.
   - **Newsletter-Hinweis bei gekoppelten Posts** (Vorgabe Bela und Darien, 04.10.2026): In `src/newsletterplan.js` nennt jede
     Ausgabe im Feld `social` den gekoppelten Post (z. B. „Post 02: …“ = Plan-Nr. 2; nur die direkt genannte Nummer zählt,
     nicht ein „Zusatzblock zu Post …“). Ist der Post gekoppelt, am Ende aller drei Texte ergänzen:
     „Noch mehr zu diesem Thema gibt es in unserem Newsletter. Anmelden können Sie sich auf zipperwalls.de.“
     Bei Facebook und LinkedIn darf statt „auf zipperwalls.de“ der direkte Link zur Anmeldeseite stehen, aber nur wenn du sie auf
     www.zipperwalls.de gefunden und per curl (HTTP 200) geprüft hast. In `notes` vermerken: „Gekoppelt mit Newsletter Nr. X (Datum)“.
   - **Bio-Link in jeder Caption** (Vorgabe Bela und Darien, 07.10.2026): Der Hinweis „Unseren Onlineshop und vieles mehr finden
     Sie über den Link in unserer Bio“ wird beim Veröffentlichen automatisch vor die Hashtags gesetzt (`BIO_HINT` in `src/text.js`,
     bei Facebook und LinkedIn mit dem Link https://linktr.ee/zipperwalls). Nicht selbst in die Texte schreiben.
     Deshalb bei Instagram keine Schlusszeilen wie „Mehr auf zipperwalls.de“ (dort nicht klickbar). Bei Facebook und LinkedIn
     statt „auf zipperwalls.de“ den direkten Link zur passenden Produkt- oder Kategorieseite nennen (per curl auf HTTP 200 prüfen).
   Grafiken bauen mit `node scripts/grafik.mjs <spec.json>` (Layouts title, point, end, quote; vorher
   `npm i --no-save playwright @fontsource/barlow`, Aufbau der spec steht oben im Skript). Das Skript bricht ab, wenn Schrift oder Foto fehlen.
   Ergebnis immer ansehen, bevor es hochgeladen wird.
   Bilder als Assets ins Artefakt laden (Artifact Tool, `url` wie oben, `asset: true`, `file_path`). IDs merken.
4. Dokument `posts/plan-<nr>` anlegen (`set`, ohne if_version):
   ```json
   {
     "title": "#<nr> <topic>", "plan_nr": <nr>, "status": "draft", "source": "claude",
     "body": <facebook Text>, "variants": { "instagram": ..., "facebook": ..., "linkedin": ... },
     "hashtags": <hashtags>, "channels": ["facebook","instagram","linkedin"],
     "image": <Asset ID 4:5 oder null>, "image_linkedin": <Asset ID 1:1 oder null>, "slides": [<Asset IDs in Reihenfolge, nur bei Karussell>],
     "products": [<Produktfamilien laut plans/shop-katalog.json, in Bildreihenfolge>],
     "notes": "Plan Nr. <nr>, KW <kw>, <pillar>. Offen: <note>",
     "scheduled_at": <Datum 09:00 Uhr Berliner Zeit als UTC ISO>, "results": {},
     "created_at": <jetzt>, "updated_at": <jetzt>
   }
   ```
   Texte aus dem Plan übernehmen; bei Tipp-Posts die Punkte wie oben beschrieben ausführen. Platzhalter wie [DATUM] nicht selbst ausfüllen.
5. Nie freigeben oder posten. Das machen Bela oder Darien im Dashboard.

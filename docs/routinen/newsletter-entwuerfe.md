# Newsletter-Entwürfe anlegen („Standpunkt“)

Ein Entwurf pro Ausgabe, erst wenn Bela oder Darien darum bitten oder der Versand näher rückt. Nur angelegte Entwürfe
erscheinen unter Freigabe › Newsletter. Dashboard (Artefakt): https://claude.ai/artifact/6SheLVeDXVWVUF6ctwVTA6

## Ablauf

1. Repo bereitstellen (wie in `posten.md`). Plan: `src/newsletterplan.js` (`NEWSLETTERPLAN.entries`).
2. Ausgabe wählen und prüfen, ob es in Collection `newsletters` schon `nl-<nr>` gibt (ArtifactData `get`). Dann nicht überschreiben.
3. Bild: das Foto des gekoppelten Social-Media-Posts (Collection `posts`, Dokument `plan-<Post-Nr>`, erste Slide zeigt das Motiv),
   aber ohne Text darauf. Am besten dasselbe Produktfoto aus dem Shop (zipperwalls.de/wp-content/uploads/…, volle Größe ohne
   `-768x432`). Keine Fremdlogos außer PIXLIP GO, keine KI-Bilder.
   - `image_url`: öffentliche Adresse auf www.zipperwalls.de (die nutzt MailPoet).
   - Dieselbe Datei als Asset ins Artefakt laden (Artifact Tool, `asset: true`) und die ID als `image_asset` eintragen (nur für die Vorschau,
     fremde Adressen sind im Artefakt gesperrt).
   - **Abwechslung:** Das Aufmacherbild darf nicht dasselbe sein wie in den letzten zwei Ausgaben (`image_url` von `nl-<nr-1>`, `nl-<nr-2>` lesen).
     Ist die Ausgabe nicht gekoppelt, ein Foto passend zum Thema aus dem Shop wählen.
   - **Bilder im Text:** zusätzlich 1 bis 2 Fotos, die einen Schritt zeigen (Detail, Aufbau, Stand, Material), als `img2_*` und `img3_*`
     (`url` auf zipperwalls.de, `asset` als Kopie für die Vorschau, `alt`, `caption` mit einem Satz Nutzen, `link` optional auf die Produktseite).
     Im `text` eine eigene Zeile `[Bild 2]` an die passende Stelle setzen, z. B. nach einem Absatz oder zwischen Zwischenüberschriften;
     `[Bild 2] [Bild 3]` in einer Zeile setzt zwei Bilder nebeneinander. Nicht mitten zwischen die nummerierten Schritte.
     Nur echte Fotos, keine Bilder doppelt in derselben Ausgabe.
4. Dokument `newsletters/nl-<nr>` anlegen (`set`, ohne if_version). Felder:
   `nr, kw, date, time, status: "Entwurf", subject, subject_alt, preview, badge, headline, image_url, image_asset, image_alt, image_link,
   text, button_text, button_link, offer_label, offer_title, offer_text, offer_button_text, offer_button_link, extra_title, extra_text,
   extra_link, source: "claude", notes, created_at, updated_at`.
   - `badge` und `headline` wie die Grafik des Social-Media-Posts (z. B. „Messe-Tipp #01“, „Frühjahrsmesse?\nJetzt planen.“).
   - **Inhalt vor Werbung:** Der Leser soll danach etwas gelernt haben. Jeden Schritt ausführlich erklären (3 bis 5 Sätze: warum,
     wie genau, worauf achten), dazu je eine Zeile „Tipp: …“ mit einem konkreten Praxistipp. Wo es passt, einen Zeitplan
     („Mitte November: …“ je Zeile) oder eine Checkliste ergänzen. Nur belegte Fakten (Plan, Shop, Ratgeber, Druckvorgaben).
   - `text` aus dem Plan als Grundlage, ausgebaut wie oben. Gliederung: Leerzeile = Absatz, Zeile in VERSALIEN = Zwischenüberschrift, „1. Titel. Text“ = Schritt,
     „Viele Grüße …“ = Grußformel, Telefon/E-Mail = Kontaktzeile. Grußformel ohne Ortsnamen („Viele Grüße“, nicht „aus Herxheim“).
   - Angebot: Hilfe bei der Standerstellung ist erwünscht (z. B. Kasten „Wir planen Ihre Frühjahrsmesse mit“: Messe, Standmaße und
     Termin nennen, Zipperwalls schlägt die Ausstattung vor), dazu Grafikservice oder Beratung zu Produkten. Kein Rabatt-Ton.
   - Produktempfehlungen (gelber Block über der Fußzeile): `products_label`, `products_title` und drei Produkte `p1_*` bis `p3_*`
     (`name`, `price` als ab-Preis netto aus dem Shop, z. B. „ab 169,60 € netto“, vor jeder Ausgabe auf der Produktseite prüfen,
     `text` mit einem belegten Nutzen, `link` auf die Produktseite, `image_url` aus dem Shop). Die Bilder zusätzlich als Assets
     hochladen und als `p1_image_asset` usw. eintragen. Passend zum Thema der Ausgabe.
     **Abwechslung:** aus mindestens zwei Bereichen mischen (Messewände, Theken, LED und Lightboxen, Banner und Roll-ups,
     Zubehör wie Transport, Licht, Prospektständer) und kein Produkt aus den letzten zwei Ausgaben wiederholen (`p*_name` von
     `nl-<nr-1>` und `nl-<nr-2>` lesen). Die Produktbilder dürfen nicht dieselben sein wie das Aufmacherbild oder die Bilder im Text.
   - Alle Links auf https://www.zipperwalls.de/ und vorher mit curl auf HTTP 200 prüfen.
   - Platzhalter wie [DATUM] nicht selbst ausfüllen, in `notes` melden.
5. Nie freigeben. Das macht Darien im Dashboard.

Gestaltung: `src/newsletter-render.js` (Design „Standpunkt“ wie `newsletter/messepraxis-vorlage.html` auf main).

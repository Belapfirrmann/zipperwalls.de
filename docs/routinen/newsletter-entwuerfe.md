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
   - Angebot: ein passendes, sachliches Angebot (Beratung, Grafikservice, Produkt) mit Button. Kein Rabatt-Ton.
   - Produktempfehlungen (gelber Block über der Fußzeile): `products_label`, `products_title` und drei Produkte `p1_*` bis `p3_*`
     (`name`, `text` mit einem belegten Nutzen, `link` auf die Produktseite, `image_url` aus dem Shop). Die Bilder zusätzlich als Assets
     hochladen und als `p1_image_asset` usw. eintragen. Passend zum Thema der Ausgabe, z. B. drei Messewände für die Frühjahrsmessen.
   - Alle Links auf https://www.zipperwalls.de/ und vorher mit curl auf HTTP 200 prüfen.
   - Platzhalter wie [DATUM] nicht selbst ausfüllen, in `notes` melden.
5. Nie freigeben. Das macht Darien im Dashboard.

Gestaltung: `src/newsletter-render.js` (Design „Messepraxis“ wie `newsletter/messepraxis-vorlage.html` auf main).

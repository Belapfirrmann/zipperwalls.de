# Newsletter „Messepraxis“ (MailPoet)

- `messepraxis-vorlage.html`: Grundgerüst mit allen Modulen. Alles in [ECKIGEN KLAMMERN] ersetzen, nicht benötigte Module löschen.
- `messepraxis-01.html`: Ausgabe 01 (Frühjahrsmesse 2027) als ausgefülltes Beispiel.
- `assets/logo-farbig-440.png`: Logo für die WordPress-Mediathek (Anzeige 220 px breit).

Die Dateien sind die Designreferenz. Ziel ist, die Vorlage als E-Mail im MailPoet-Block-Editor auf zipperwalls.de anzulegen.
Ohne Zugang: in MailPoet einen HTML-Block einfügen und den Inhalt zwischen <body> und </body> hineinkopieren.

MailPoet-Shortcodes: [subscriber:firstname | default:...], [link:newsletter_view_in_browser_action],
[link:subscription_unsubscribe_url], [link:subscription_manage_url].

## MailPoet-Blöcke (neuer E-Mail-Editor)

`mailpoet/` enthält beide Fassungen als native Editor-Blöcke (Absatz, Überschrift, Bild, Gruppe, Spalten, Button, Abstand), weil der MailPoet-Editor keinen HTML-Block kennt.
`npm install && npm run build && npm run validate` erzeugt und prüft `messepraxis-vorlage.blocks.html` und `messepraxis-01.blocks.html`.
Personalisierung im neuen Editor: `<!--[mailpoet/subscriber-firstname default="..."]-->`, Links über `data-link-href="[mailpoet/subscription-unsubscribe-url]"` usw.

Stand auf zipperwalls.de (Route `/wp-json/wp/v2/mailpoet_email`, Template „Allgemeine E-Mail“, Status Entwurf):
- Beitrag 41346: Messepraxis Vorlage
- Beitrag 41348: Messepraxis 01
- Logo: Mediathek-ID 41347 (`zipperwalls-logo-farbig-440.png`)

Die REST-Route legt nur den Beitrag an, keinen Eintrag in der MailPoet-E-Mail-Liste. Betreff, Preheader und Liste lassen sich erst setzen, wenn MailPoet den Beitrag als Newsletter kennt.

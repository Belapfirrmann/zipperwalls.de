# Einrichtung

Das Dashboard ist ein Claude Artefakt, gepostet wird von Claude Routinen. Einmalig nötig sind nur die Zugänge
bei Meta und LinkedIn. Die Werte tragt ihr in `docs/Zugangsdaten-Vorlage.txt` ein und fügt sie dann in Claude ein (Schritt 3).

## 1. Facebook und Instagram

Voraussetzungen: Ihr seid Admin der Zipperwalls Facebook Seite. Instagram (@zipperwalls.de) ist ein **Business Konto**
und mit der Facebook Seite verknüpft (Meta Business Suite > Einstellungen > Konten > Instagram).

Wichtig: Meta zeigt eine Berechtigung im Graph API Explorer erst an, wenn die App den passenden **Anwendungsfall**
hat und die Berechtigung dort hinzugefügt wurde. Deshalb zuerst die Anwendungsfälle, dann der Explorer.

1. https://developers.facebook.com > Meine Apps > App erstellen. Bela und Darien unter App Rollen als Admin eintragen.
   Die App bleibt im Entwicklungsmodus. Eine Prüfung durch Meta (App Review) ist nicht nötig, solange nur ihr die App für eure eigene Seite nutzt.
2. Anwendungsfall **„Alles auf deiner Seite verwalten“** (englisch: *Manage everything on your Page*) hinzufügen > **Anpassen** >
   Berechtigungen hinzufügen: `pages_manage_posts`, `pages_read_engagement`.
   (`pages_show_list` und `business_management` sind automatisch dabei.)
3. Anwendungsfall **„Nachrichten und Inhalte auf Instagram verwalten“** (*Manage messaging & content on Instagram*) hinzufügen >
   Variante **„API-Einrichtung mit Facebook-Login“** wählen (nicht „mit Instagram-Login“) > Berechtigungen hinzufügen:
   `instagram_basic`, `instagram_content_publish` und für die Zahlen `instagram_manage_insights`.
4. Graph API Explorer öffnen (https://developers.facebook.com/tools/explorer), oben die App wählen, „User Token“ erzeugen und im
   Dropdown diese Rechte anhaken (jetzt werden sie angeboten):
   `pages_show_list, pages_read_engagement, pages_manage_posts, business_management, instagram_basic, instagram_content_publish, instagram_manage_insights`
   Im folgenden Facebook Fenster die Zipperwalls Seite und das Instagram Konto auswählen.
5. Token verlängern: Info Symbol neben dem Token > „Im Access Token Tool öffnen“ > „Zugriffsschlüssel verlängern“. Den langen Token im Explorer einsetzen.
6. Im Explorer abfragen: `me/accounts?fields=id,name,access_token,instagram_business_account`
   Aus der Zeile der Zipperwalls Seite:
   - `access_token` wird **META_PAGE_TOKEN** (läuft nicht ab, weil aus dem verlängerten Token erzeugt)
   - `id` wird **META_PAGE_ID**
   - `instagram_business_account.id` wird **IG_USER_ID**

Heißen die Anwendungsfälle bei euch anders oder fehlt einer: Screenshot der Liste an Claude schicken.

## 2. LinkedIn

1. https://www.linkedin.com/developers/apps > App erstellen, Zipperwalls Unternehmensseite angeben und bestätigen lassen.
2. Tab "Products": **Share on LinkedIn** und **Sign In with LinkedIn using OpenID Connect** hinzufügen.
3. Docs and tools > **OAuth Token Tools** > Token erzeugen mit den Scopes `openid profile w_member_social`.
   Der Token wird **LINKEDIN_TOKEN**. Er gilt 60 Tage. Das Ablaufdatum als **LINKEDIN_TOKEN_EXPIRES** eintragen (z. B. `2026-12-01`).
   Gepostet wird über das Profil der Person, die den Token erzeugt.
4. Posten als Unternehmensseite geht erst nach Freigabe der "Community Management API" durch LinkedIn (Antrag unter Products, dauert Wochen).
   Danach zusätzlich **LINKEDIN_AUTHOR** = `urn:li:organization:<Seiten ID>` setzen.

## 3. Zugangsdaten in Claude eintragen

1. `docs/Zugangsdaten-Vorlage.txt` in einem Editor öffnen und hinter jedes `=` den Wert schreiben.
2. In der Claude Code Sitzung oben auf die Cloud Umgebung klicken > Bearbeiten > **Umgebungsvariablen**: den ganzen Text einfügen.
3. Im selben Fenster unter **Netzwerkzugriff** diese Adressen erlauben: `graph.facebook.com`, `api.linkedin.com`, `www.linkedin.com`.
4. Ausgefüllte Datei löschen. Tokens nie in den Chat kopieren.
5. Claude Bescheid geben. Claude prüft die Zugänge, das Ergebnis erscheint im Dashboard unter "Verbindungen".

## 4. Routinen

Drei geplante Claude Läufe, eingerichtet von Claude nach eurer Bestätigung:

| Routine | Wann | Anleitung |
|---|---|---|
| Social Posting | werktags stündlich 7 bis 19 Uhr | `docs/routinen/posten.md` |
| Social Entwürfe | Mo und Mi 7:30 Uhr | `docs/routinen/entwuerfe.md` |
| Social Zahlen | täglich 6:30 Uhr | `docs/routinen/zahlen.md` |

Alle 60 Tage: neuen LinkedIn Token erzeugen und `LINKEDIN_TOKEN` sowie `LINKEDIN_TOKEN_EXPIRES` ersetzen.
Das Dashboard warnt 10 Tage vorher.

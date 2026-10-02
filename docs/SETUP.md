# Einrichtung (ohne Cloudflare)

Alles läuft in Claude: Das Dashboard ist ein Claude Artefakt, gepostet wird von Claude Routinen.
Einmalig nötig sind nur die Zugänge bei Meta und LinkedIn. Diese Schritte stehen auch in der Abhakeliste des Dashboards.

## 1. Facebook und Instagram

Voraussetzungen: Ihr seid Admin der Zipperwalls Facebook Seite. Instagram (@zipperwalls.de) ist ein **Business Konto**
und mit der Facebook Seite verknüpft (Meta Business Suite > Einstellungen > Konten > Instagram).

1. https://developers.facebook.com > Meine Apps > App erstellen > Typ **Business**. Bela und Darien unter App Rollen als Admin eintragen.
   Die App kann im Entwicklungsmodus bleiben, eine Prüfung durch Meta ist nicht nötig.
2. Graph API Explorer öffnen (https://developers.facebook.com/tools/explorer), oben die App wählen,
   "User Token" erzeugen mit diesen Berechtigungen:
   `pages_show_list, pages_manage_posts, pages_read_engagement, instagram_basic, instagram_content_publish, instagram_manage_insights, business_management`
3. Token verlängern: auf das Info Symbol neben dem Token > "Im Access Token Tool öffnen" > "Zugriffsschlüssel verlängern". Den langen Token kopieren und im Explorer einsetzen.
4. Im Explorer abfragen: `me/accounts?fields=id,name,access_token,instagram_business_account`
   Aus der Zeile der Zipperwalls Seite:
   - `access_token` wird **META_PAGE_TOKEN** (läuft nicht ab, weil aus dem verlängerten Token erzeugt)
   - `id` wird **META_PAGE_ID**
   - `instagram_business_account.id` wird **IG_USER_ID**

## 2. LinkedIn

1. https://www.linkedin.com/developers/apps > App erstellen, Zipperwalls Unternehmensseite angeben und bestätigen lassen.
2. Tab "Products": **Share on LinkedIn** und **Sign In with LinkedIn using OpenID Connect** hinzufügen.
3. Docs and tools > **OAuth Token Tools** > Token erzeugen mit den Scopes `openid profile w_member_social`.
   Der Token wird **LINKEDIN_TOKEN**. Er gilt 60 Tage. Das Ablaufdatum als **LINKEDIN_TOKEN_EXPIRES** eintragen (z. B. `2026-12-01`).
   Gepostet wird über das Profil der Person, die den Token erzeugt.
4. Posten als Unternehmensseite geht erst nach Freigabe der "Community Management API" durch LinkedIn (Antrag unter Products, dauert Wochen).
   Danach zusätzlich **LINKEDIN_AUTHOR** = `urn:li:organization:<Seiten ID>` setzen.

## 3. Zugangsdaten in Claude eintragen

In der Claude Code Sitzung oben im Titel auf die Cloud Umgebung > Bearbeiten:
- **Umgebungsvariablen**: `META_PAGE_TOKEN`, `META_PAGE_ID`, `IG_USER_ID`, `LINKEDIN_TOKEN`, `LINKEDIN_TOKEN_EXPIRES`
  (optional `LINKEDIN_AUTHOR`). Tokens nie in den Chat kopieren.
- **Netzwerkzugriff**: diese Adressen erlauben: `graph.facebook.com`, `api.linkedin.com`, `www.linkedin.com`.

Prüfen: In einer neuen Sitzung `node scripts/social.js check` ausführen lassen. Das Ergebnis erscheint im Dashboard unter "Verbindungen".

## 4. Routinen

Drei geplante Claude Läufe, eingerichtet von Claude nach eurer Bestätigung:

| Routine | Wann | Anleitung |
|---|---|---|
| Social Posting | werktags stündlich 7 bis 19 Uhr | `docs/routinen/posten.md` |
| Social Entwürfe | Mo und Mi 7:30 Uhr | `docs/routinen/entwuerfe.md` |
| Social Zahlen | täglich 6:30 Uhr | `docs/routinen/zahlen.md` |

Alle 60 Tage: neuen LinkedIn Token erzeugen und `LINKEDIN_TOKEN` sowie `LINKEDIN_TOKEN_EXPIRES` ersetzen.
Das Dashboard warnt 10 Tage vorher.

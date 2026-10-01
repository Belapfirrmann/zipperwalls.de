# Einrichtung Schritt für Schritt

Einmalig etwa 1 bis 2 Stunden. Alles, was hier steht, findet sich auch als Abhakeliste im Dashboard.

## 1. Cloudflare (Hosting, kostenlos)

1. Konto auf https://dash.cloudflare.com anlegen (falls noch nicht vorhanden). Die Domain zipperwalls.de sollte bei Cloudflare liegen, sonst eine `*.workers.dev` Adresse nutzen.
2. Im Repo:
   ```bash
   npm install
   npx wrangler login
   npx wrangler d1 create zipperwalls-social        # ausgegebene database_id in wrangler.toml eintragen
   npx wrangler r2 bucket create zipperwalls-social-media
   npm run db:migrate:remote
   ```
3. Secrets setzen (Werte werden abgefragt, landen nie im Repo):
   ```bash
   npx wrangler secret put AGENT_API_TOKEN    # langer Zufallswert: openssl rand -hex 32
   npx wrangler secret put ENCRYPTION_KEY     # openssl rand -base64 32
   ```
4. In `wrangler.toml` unter `[vars]` eintragen: `ADMIN_EMAILS` (Bela und Darien, Komma getrennt) und `PUBLIC_BASE_URL`.
5. `npm run deploy`. Danach unter Workers > zipperwalls-social > Settings > Domains die eigene Domain `social.zipperwalls.de` hinzufügen.

## 2. Login nur für Bela und Darien (Cloudflare Access)

1. Cloudflare Dashboard > Zero Trust > Access > Applications > "Add an application" > Self-hosted.
2. Domain: `social.zipperwalls.de`. Policy "Allow", Include: Emails = Bela und Darien. Login per Einmalcode an die E-Mail.
3. Zwei weitere Applications mit Policy **Bypass** (Everyone) anlegen, sonst funktioniert es nicht:
   - `social.zipperwalls.de/media/*` (Instagram und Facebook laden die Bilder von dort)
   - `social.zipperwalls.de/api/agent/*` (der Agent meldet sich mit eigenem Token an)
4. In der Haupt-Application unter Overview den "Application Audience (AUD) Tag" kopieren und in `wrangler.toml` als `ACCESS_AUD` eintragen, die Team Domain (`xyz.cloudflareaccess.com`) als `ACCESS_TEAM_DOMAIN`. Neu deployen.

Der Worker prüft das Access Token selbst. Ohne gültigen Login und ohne Eintrag in `ADMIN_EMAILS` gibt es keinen Zugriff.

## 3. Facebook und Instagram (Meta)

Voraussetzungen:
- Ihr seid Admin der Zipperwalls Facebook Seite.
- Instagram ist ein **Business oder Creator Konto** und mit der Facebook Seite verknüpft (Instagram App > Einstellungen > Kontotyp; Verknüpfung in der Meta Business Suite).

App anlegen:
1. https://developers.facebook.com > My Apps > Create App > Use case "Other" > Typ **Business**.
2. Produkte hinzufügen: "Facebook Login for Business" und "Instagram Graph API".
3. Facebook Login > Settings > Valid OAuth Redirect URIs: `https://social.zipperwalls.de/oauth/meta/callback`
4. App Settings > Basic: App ID und App Secret kopieren:
   ```bash
   npx wrangler secret put META_APP_ID
   npx wrangler secret put META_APP_SECRET
   ```
5. Bela und Darien unter App Roles als Administrator eintragen.

Die App kann im **Entwicklungsmodus** bleiben: Solange nur App Admins sich anmelden und nur eigene Seiten nutzen, ist keine App Prüfung durch Meta nötig. Im Dashboard unter "Verbindungen" auf "Verbinden" klicken, Seite und Instagram Konto auswählen, alle Berechtigungen bestätigen. Facebook und Instagram werden zusammen verbunden, das Seiten Token läuft nicht ab.

## 4. LinkedIn

1. https://www.linkedin.com/developers/apps > Create app. Als Unternehmensseite die Zipperwalls Seite angeben (muss von einem Seiten Admin bestätigt werden).
2. Tab Products: **"Sign In with LinkedIn using OpenID Connect"** und **"Share on LinkedIn"** hinzufügen (sofort freigeschaltet).
3. Tab Auth: Redirect URL `https://social.zipperwalls.de/oauth/linkedin/callback`. Client ID und Secret kopieren:
   ```bash
   npx wrangler secret put LINKEDIN_CLIENT_ID
   npx wrangler secret put LINKEDIN_CLIENT_SECRET
   ```
4. Im Dashboard verbinden. Gepostet wird dann über das **persönliche Profil** der Person, die verbindet.
5. Das Token gilt 60 Tage. Das Dashboard zeigt die Restlaufzeit, danach einfach "Neu verbinden".

### Posten als Unternehmensseite (optional)

Dafür braucht es die **Community Management API**. Antrag in der App unter Products. LinkedIn prüft manuell (mehrere Wochen, Ablehnung möglich, ein Unternehmensnachweis wird verlangt). Nach Freigabe:
- In `wrangler.toml` `LINKEDIN_ORG_ID` setzen (Zahl aus der Admin URL der Seite: `linkedin.com/company/12345678/admin`).
- Neu deployen und LinkedIn neu verbinden. Dann gibt es auch Follower und Post Zahlen für LinkedIn.

## 5. Agent anbinden

Siehe `docs/AGENT-API.md`. Den Wert von `AGENT_API_TOKEN` im Claude Projekt hinterlegen.

## Lokal ausprobieren

```bash
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev        # http://localhost:8787, Login wird lokal übersprungen
npm test
```

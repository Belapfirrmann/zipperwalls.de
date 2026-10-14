# Zipperwalls Apple Connector

Eigener MCP Server, über den Claude auf den iCloud Kalender und das Mailpostfach zugreifen kann, ohne Umweg über Google. Er wird in claude.ai als eigener Connector eingetragen und funktioniert danach im Browser, in der App und in Claude Code.

Kalender läuft über CalDAV, Mail über IMAP (lesen, Entwürfe) und SMTP (senden). Das funktioniert mit iCloud und mit jedem normalen Mailanbieter.

## Was Claude damit kann

Kalender: Kalender auflisten, Termine in einem Zeitraum anzeigen (inklusive Serien), Termine anlegen, ändern und löschen.

Mail: Ordner auflisten, Mails suchen und lesen, Entwürfe anlegen (auch als Antwort auf eine Mail), Mails als gelesen oder markiert setzen, Mails verschieben. Direktes Senden ist standardmäßig aus und wird erst mit `ALLOW_SEND=true` freigeschaltet. Bis dahin legt Claude nur Entwürfe an, die man in Apple Mail prüft und selbst abschickt.

Mit `ALLOW_CALENDAR_WRITE=false` darf Claude den Kalender nur lesen.

## Einrichtung

### 1. App-spezifisches Passwort bei Apple

Auf account.apple.com anmelden, unter "Anmeldung und Sicherheit" ein app-spezifisches Passwort erstellen (Name z.B. "Claude Connector"). Das kommt in `CALDAV_PASSWORD` und, bei iCloud Mail, auch in `IMAP_PASSWORD`. Das normale Apple ID Passwort wird nie gebraucht. Das app-spezifische Passwort lässt sich dort jederzeit wieder widerrufen.

Liegt die Mail nicht bei iCloud, sondern bei einem anderen Anbieter, kommen dessen IMAP und SMTP Zugangsdaten in die Mail Felder.

### 2. Server (Hetzner)

Beim Domainanbieter eine Subdomain wie `connector.zipperwalls.de` per A Eintrag auf die IP des Servers zeigen lassen. Dann per SSH auf den Server und dort:

```bash
apt update && apt install -y git gh
gh auth login                      # GitHub.com, HTTPS, "Login with a web browser", Code im Browser eingeben
gh repo clone Belapfirrmann/zipperwalls.de
cd zipperwalls.de/apple-connector
sudo bash install.sh
```

Das Skript installiert bei Bedarf Docker, fragt Subdomain, Apple ID und app-spezifisches Passwort ab, testet die Zugangsdaten bei Apple und startet den Connector. Ist Port 80/443 frei, holt Caddy automatisch ein HTTPS Zertifikat. Läuft auf dem Server schon ein Webserver, startet der Connector auf `127.0.0.1:3000` und der vorhandene Webserver muss die Subdomain dorthin weiterleiten.

Am Ende zeigt das Skript die Connector URL und das Anmeldepasswort an. Danach sollte `https://connector.zipperwalls.de/health` mit `{"ok":true}` antworten.

Updates einspielen: `git pull && docker compose --profile caddy up -d --build` (ohne Caddy: `docker compose up -d --build`).

Zugangsdaten erneut testen: `docker compose run --rm --no-deps connector node dist/check.js`

Anmeldedaten von Claude (keine Passwörter, nur Token Hashes) liegen im Docker Volume `connector-data`.

### 3. In Claude eintragen

In claude.ai unter Einstellungen > Connectors > "Eigenen Connector hinzufügen":

Name: Zipperwalls Kalender & Mail
URL: `https://connector.zipperwalls.de/mcp`

Beim Verbinden öffnet sich die Anmeldeseite des Connectors, dort das `ADMIN_PASSWORD` eingeben. Fertig.

## Sicherheit

Der Zugriff ist per OAuth geschützt. Nur wer das `ADMIN_PASSWORD` kennt, kann einen Client freischalten. Nach 5 Fehlversuchen ist die Anmeldung für 15 Minuten gesperrt. Weiterleitungen sind nur zu claude.ai, claude.com und localhost erlaubt (`ALLOWED_REDIRECT_HOSTS`). Access Tokens gelten eine Stunde, Refresh Tokens 90 Tage und werden bei jeder Nutzung erneuert. Gespeichert werden nur Hashes der Tokens.

Die Zugangsdaten zu Apple und zum Mailserver stehen nur in der `.env` auf dem Server. Die Datei gehört nicht ins Repo (steht in `.gitignore`).

Alle Zugänge sperren: app-spezifisches Passwort bei Apple widerrufen, oder `docker compose down` und das Volume `connector-data` löschen.

## Entwicklung

```bash
npm install
cp .env.example .env   # PUBLIC_URL=http://localhost:3000
npm run dev
```

`npm run check` prüft die Typen.

Hinweise: Termin IDs sind die URLs der Kalenderobjekte. Ändern und Löschen eines wiederkehrenden Termins betrifft die ganze Serie. Zeiten ohne Offset gelten in `TIMEZONE` (Standard Europe/Berlin).

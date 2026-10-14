#!/usr/bin/env bash
# Einrichtung auf einem Hetzner Managed Server / Webhosting (konsoleH, ohne Docker).
# Per SSH im Ordner apple-connector ausführen:  bash setup-managed.sh
set -euo pipefail
export NPM_CONFIG_UPDATE_NOTIFIER=false
cd "$(dirname "$0")"
APP_DIR=$(pwd)
ENV_FILE="$HOME/.apple-connector.env"

ask() {
  local prompt="$1" default="${2:-}" value
  read -r -p "$prompt${default:+ [$default]}: " value
  echo "${value:-$default}"
}

ask_secret() {
  local value
  read -r -s -p "$1: " value
  echo >&2
  echo "$value"
}

quote() {
  if [[ "$1" == *"'"* ]]; then
    echo "Werte dürfen kein ' enthalten." >&2
    exit 1
  fi
  printf "'%s'" "$1"
}

node_major() { node -v 2>/dev/null | sed 's/^v//; s/\..*//' || echo 0; }

echo "== Zipperwalls Apple Connector: Einrichtung auf dem Managed Server =="
echo

# ---------- Node.js Version ----------
if [ "$(node_major)" -lt 22 ]; then
  echo 24 > "$HOME/.nodeversion"
  hash -r
  if [ "$(node_major)" -lt 22 ]; then
    echo "Node.js 24 wurde in ~/.nodeversion eingetragen."
    echo "Bitte einmal ab- und wieder anmelden (exit, dann neu per SSH verbinden) und das Skript erneut starten."
    exit 1
  fi
fi
echo "Node.js $(node -v), npm $(npm -v)"

# ---------- Bauen ----------
echo
echo "Installiere Pakete und baue den Connector ..."
npm ci --no-audit --no-fund --loglevel=error
npm run build --silent
npm prune --omit=dev --no-audit --no-fund --loglevel=error

# ---------- Konfiguration ----------
ADMIN_PASSWORD_NEW=""
if [ -f "$ENV_FILE" ] && [ "$(ask "Es gibt schon eine Konfiguration ($ENV_FILE). Behalten? (j/n)" j)" = "j" ]; then
  echo "Vorhandene Konfiguration wird verwendet."
else
  DOMAIN=$(ask "Subdomain für den Connector" "connector.zipperwalls.de")
  APPLE_ID=$(ask "Apple ID (E-Mail Adresse, mit der Papa sich bei Apple anmeldet)")
  APP_PW=$(ask_secret "App-spezifisches Passwort (xxxx-xxxx-xxxx-xxxx, wird nicht angezeigt)")
  MAIL_FROM=$(ask "Absender für Mails" "Darien Pfirrmann <$APPLE_ID>")

  if [ "$(ask 'Liegt die Mail bei iCloud? (j/n)' j)" = "j" ]; then
    IMAP_HOST=imap.mail.me.com; IMAP_PORT=993; IMAP_USER=$APPLE_ID; IMAP_PW=$APP_PW
    SMTP_HOST=smtp.mail.me.com; SMTP_PORT=587
  else
    IMAP_HOST=$(ask "IMAP Server (z.B. mail.your-server.de)")
    IMAP_PORT=$(ask "IMAP Port" 993)
    IMAP_USER=$(ask "IMAP Benutzername" "$APPLE_ID")
    IMAP_PW=$(ask_secret "IMAP Passwort (wird nicht angezeigt)")
    SMTP_HOST=$(ask "SMTP Server" "$IMAP_HOST")
    SMTP_PORT=$(ask "SMTP Port" 587)
  fi

  ADMIN_PASSWORD_NEW=$(head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)

  umask 077
  cat > "$ENV_FILE" <<EOF
PUBLIC_URL=$(quote "https://$DOMAIN")
ADMIN_PASSWORD=$(quote "$ADMIN_PASSWORD_NEW")
TIMEZONE='Europe/Berlin'
CALDAV_URL='https://caldav.icloud.com'
CALDAV_USER=$(quote "$APPLE_ID")
CALDAV_PASSWORD=$(quote "$APP_PW")
ALLOW_CALENDAR_WRITE='true'
IMAP_HOST=$(quote "$IMAP_HOST")
IMAP_PORT=$(quote "$IMAP_PORT")
IMAP_USER=$(quote "$IMAP_USER")
IMAP_PASSWORD=$(quote "$IMAP_PW")
SMTP_HOST=$(quote "$SMTP_HOST")
SMTP_PORT=$(quote "$SMTP_PORT")
MAIL_FROM=$(quote "$MAIL_FROM")
ALLOW_SEND='false'
EOF
  chmod 600 "$ENV_FILE"
  echo "Konfiguration gespeichert in $ENV_FILE (nur für euren Benutzer lesbar)."
fi

# ---------- Zugangsdaten testen ----------
echo
echo "Teste die Zugangsdaten bei Apple bzw. beim Mailanbieter ..."
if ! node dist/check.js; then
  echo
  echo "Mindestens ein Test ist fehlgeschlagen (siehe oben). Häufige Ursachen:"
  echo "  Apple ID statt Name des Passworts eingetragen? App-spezifisches Passwort richtig kopiert?"
  echo "  Bei 'timeout' oder 'ECONNREFUSED': der Server darf diese Verbindung nicht nach außen aufbauen,"
  echo "  dann beim Hetzner Support ausgehende Verbindungen zu Port 993 und 587 anfragen."
  echo "Korrigieren: bash setup-managed.sh erneut starten und neue Konfiguration wählen."
  exit 1
fi

DOMAIN=$(grep '^PUBLIC_URL=' "$ENV_FILE" | cut -d= -f2- | tr -d "'" | sed 's#^https://##')
REL_DIR=${APP_DIR#"$HOME"/}

echo
echo "================================================================"
echo "Jetzt in konsoleH bei der Subdomain $DOMAIN Node.js einrichten:"
echo
echo "  Arbeitsverzeichnis (Working directory):  $REL_DIR"
echo "  Skriptpfad (Script path):                dist/index.js"
echo "  Node.js Version:                         24"
echo "  Umgebungsvariablen:                      keine nötig"
echo
echo "Danach SSL (Let's Encrypt) für $DOMAIN aktivieren."
echo "Test im Browser: https://$DOMAIN/health  sollte {\"ok\":true} zeigen."
echo
echo "Connector URL für claude.ai:  https://$DOMAIN/mcp"
if [ -n "$ADMIN_PASSWORD_NEW" ]; then
  echo "Passwort für die Anmeldung:   $ADMIN_PASSWORD_NEW"
  echo "(Jetzt im Passwortmanager speichern. Nachlesen: grep ADMIN_PASSWORD $ENV_FILE)"
fi
echo "================================================================"

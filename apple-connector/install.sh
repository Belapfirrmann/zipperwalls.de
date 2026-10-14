#!/usr/bin/env bash
# Richtet den Zipperwalls Apple Connector auf einem Linux Server ein.
# Aufruf im Ordner apple-connector:  sudo bash install.sh
set -euo pipefail
cd "$(dirname "$0")"

if [ "$(id -u)" -ne 0 ]; then
  echo "Bitte als root ausführen: sudo bash install.sh"
  exit 1
fi

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
  # Wert für die .env Datei, in einfachen Anführungszeichen (keine Variablenersetzung)
  if [[ "$1" == *"'"* ]]; then
    echo "Werte dürfen kein ' enthalten." >&2
    exit 1
  fi
  printf "'%s'" "$1"
}

echo "== Zipperwalls Apple Connector: Installation =="
echo

# ---------- Docker ----------
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker fehlt, wird installiert ..."
  curl -fsSL https://get.docker.com | sh
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "docker compose fehlt. Bitte Docker aktualisieren."
  exit 1
fi

# ---------- Konfiguration ----------
if [ -f .env ] && [ "$(ask 'Es gibt schon eine Konfiguration (.env). Behalten? (j/n)' j)" = "j" ]; then
  echo "Vorhandene .env wird verwendet."
  ADMIN_PASSWORD_NEW=""
else
  DOMAIN=$(ask "Subdomain für den Connector (z.B. connector.zipperwalls.de)")
  APPLE_ID=$(ask "Apple ID (E-Mail Adresse, mit der Papa sich bei Apple anmeldet)")
  APP_PW=$(ask_secret "App-spezifisches Passwort (xxxx-xxxx-xxxx-xxxx, wird nicht angezeigt)")
  MAIL_FROM=$(ask "Absender für Mails" "Darien Pfirrmann <$APPLE_ID>")

  if [ "$(ask 'Liegt die Mail bei iCloud? (j/n)' j)" = "j" ]; then
    IMAP_HOST=imap.mail.me.com; IMAP_PORT=993; IMAP_USER=$APPLE_ID; IMAP_PW=$APP_PW
    SMTP_HOST=smtp.mail.me.com; SMTP_PORT=587
  else
    IMAP_HOST=$(ask "IMAP Server (z.B. imap.ionos.de)")
    IMAP_PORT=$(ask "IMAP Port" 993)
    IMAP_USER=$(ask "IMAP Benutzername" "$APPLE_ID")
    IMAP_PW=$(ask_secret "IMAP Passwort (wird nicht angezeigt)")
    SMTP_HOST=$(ask "SMTP Server (z.B. smtp.ionos.de)")
    SMTP_PORT=$(ask "SMTP Port" 587)
  fi

  ADMIN_PASSWORD_NEW=$(head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)

  umask 077
  cat > .env <<EOF
PUBLIC_URL=$(quote "https://$DOMAIN")
DOMAIN=$(quote "$DOMAIN")
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
  chmod 600 .env
  echo "Konfiguration gespeichert in $(pwd)/.env"
fi

DOMAIN=$(grep '^DOMAIN=' .env | cut -d= -f2- | tr -d "'")

# ---------- DNS prüfen ----------
SERVER_IP=$(curl -fsS4 --max-time 10 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
DOMAIN_IP=$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk 'NR==1{print $1}')
echo
echo "Server IP: $SERVER_IP, $DOMAIN zeigt auf: ${DOMAIN_IP:-(noch nirgends)}"
if [ "$SERVER_IP" != "$DOMAIN_IP" ]; then
  echo "ACHTUNG: Beim Domainanbieter einen A Eintrag $DOMAIN -> $SERVER_IP anlegen."
  echo "Ohne den gibt es kein HTTPS Zertifikat. Danach dieses Skript einfach nochmal starten."
  [ "$(ask 'Trotzdem weitermachen? (j/n)' n)" = "j" ] || exit 1
fi

# ---------- Bauen und Zugangsdaten testen ----------
echo
echo "Baue den Connector (dauert beim ersten Mal 1 bis 2 Minuten) ..."
docker compose build --quiet connector

echo
echo "Teste die Zugangsdaten bei Apple bzw. beim Mailanbieter ..."
if ! docker compose run --rm --no-deps connector node dist/check.js; then
  echo
  echo "Mindestens ein Test ist fehlgeschlagen (siehe oben). Häufige Ursachen:"
  echo "  Apple ID statt Name des Passworts eingetragen? App-spezifisches Passwort richtig kopiert?"
  echo "Korrigieren: sudo bash install.sh erneut starten und neue Konfiguration wählen."
  exit 1
fi

# ---------- Starten ----------
PORTS_BUSY=$(ss -ltnpH 2>/dev/null | awk '$4 ~ /:(80|443)$/' | grep -v docker-proxy || true)
echo
if [ -z "$PORTS_BUSY" ]; then
  echo "Starte Connector mit Caddy (HTTPS) ..."
  docker compose --profile caddy up -d --build
  echo "Warte auf HTTPS Zertifikat ..."
  for _ in $(seq 1 30); do
    if curl -fsS --max-time 5 "https://$DOMAIN/health" >/dev/null 2>&1; then HEALTH=ok; break; fi
    sleep 3
  done
  if [ "${HEALTH:-}" != "ok" ]; then
    echo "https://$DOMAIN/health antwortet noch nicht. Ist in der Hetzner Firewall Port 80 und 443 offen?"
    echo "Logs ansehen: docker compose logs caddy"
  fi
else
  echo "Port 80/443 wird schon von einem anderen Programm benutzt:"
  echo "$PORTS_BUSY"
  echo "Starte den Connector deshalb ohne Caddy auf 127.0.0.1:3000 ..."
  docker compose up -d --build connector
  echo
  echo "Der vorhandene Webserver muss $DOMAIN an http://127.0.0.1:3000 weiterleiten."
  echo "Diese Ausgabe an Claude schicken, dann gibt es die passende Konfiguration dafür."
fi

echo
echo "================================================================"
echo "Connector URL für claude.ai:  https://$DOMAIN/mcp"
if [ -n "$ADMIN_PASSWORD_NEW" ]; then
  echo "Passwort für die Anmeldung:   $ADMIN_PASSWORD_NEW"
  echo "(Jetzt im Passwortmanager speichern, es wird nicht nochmal angezeigt."
  echo " Nachlesen geht mit: grep ADMIN_PASSWORD $(pwd)/.env)"
fi
echo "================================================================"
echo "In claude.ai: Einstellungen > Connectors > Eigenen Connector hinzufügen,"
echo "URL eintragen, verbinden und dort das Passwort eingeben."

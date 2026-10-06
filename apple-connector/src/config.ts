function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Umgebungsvariable ${name} fehlt (siehe .env.example)`);
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "ja"].includes(value.toLowerCase());
}

const imapPort = Number(optional("IMAP_PORT", "993"));
const smtpPort = Number(optional("SMTP_PORT", "587"));

export const config = {
  port: Number(optional("PORT", "3000")),
  publicUrl: required("PUBLIC_URL").replace(/\/+$/, ""),
  adminPassword: required("ADMIN_PASSWORD"),
  dataDir: optional("DATA_DIR", "./data"),
  timezone: optional("TIMEZONE", "Europe/Berlin"),
  allowedRedirectHosts: optional("ALLOWED_REDIRECT_HOSTS", "claude.ai,claude.com,localhost,127.0.0.1")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean),

  caldav: {
    url: optional("CALDAV_URL", "https://caldav.icloud.com"),
    user: required("CALDAV_USER"),
    password: required("CALDAV_PASSWORD"),
  },

  imap: {
    host: optional("IMAP_HOST", "imap.mail.me.com"),
    port: imapPort,
    secure: bool("IMAP_SECURE", imapPort === 993),
    user: required("IMAP_USER"),
    password: required("IMAP_PASSWORD"),
  },

  smtp: {
    host: optional("SMTP_HOST", "smtp.mail.me.com"),
    port: smtpPort,
    secure: bool("SMTP_SECURE", smtpPort === 465),
    user: optional("SMTP_USER", process.env.IMAP_USER ?? ""),
    password: optional("SMTP_PASSWORD", process.env.IMAP_PASSWORD ?? ""),
  },

  mailFrom: required("MAIL_FROM"),
  allowSend: bool("ALLOW_SEND", false),
  allowCalendarWrite: bool("ALLOW_CALENDAR_WRITE", true),
};

if (config.adminPassword.length < 12) {
  throw new Error("ADMIN_PASSWORD muss mindestens 12 Zeichen lang sein");
}

// Prüft die Zugangsdaten: docker compose run --rm connector node dist/check.js
import { listCalendars } from "./calendar.js";
import { listFolders } from "./mail.js";
import { config } from "./config.js";

let ok = true;

try {
  const calendars = await listCalendars();
  console.log(`Kalender OK: ${calendars.length} gefunden (${calendars.map((c) => c.name).join(", ")})`);
} catch (err) {
  ok = false;
  console.log(`Kalender FEHLER bei ${config.caldav.url}: ${err instanceof Error ? err.message : err}`);
}

try {
  const folders = await listFolders();
  const inbox = folders.find((f) => f.path.toUpperCase() === "INBOX");
  console.log(`Mail OK: ${folders.length} Ordner, Posteingang ${inbox?.messages ?? "?"} Mails (${inbox?.unseen ?? "?"} ungelesen)`);
} catch (err) {
  ok = false;
  console.log(`Mail FEHLER bei ${config.imap.host}: ${err instanceof Error ? err.message : err}`);
}

process.exit(ok ? 0 : 1);

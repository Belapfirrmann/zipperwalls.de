import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as calendar from "./calendar.js";
import * as mail from "./mail.js";
import { config } from "./config.js";

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    const result = await fn();
    return { content: [{ type: "text", text: JSON.stringify(result ?? { ok: true }, null, 2) }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Tool Fehler:", message);
    return { content: [{ type: "text", text: `Fehler: ${message}` }], isError: true };
  }
}

const timeHint = `ISO Format. Ohne Offset gilt die Zeitzone ${config.timezone}, z.B. "2026-10-06T14:00". Nur Datum ("2026-10-06") bedeutet ganztägig.`;

export function buildServer(): McpServer {
  const server = new McpServer({ name: "zipperwalls-apple-connector", version: "1.0.0" });

  // ---------- Kalender ----------

  server.registerTool(
    "calendar_list_calendars",
    {
      title: "Kalender auflisten",
      description: "Listet alle iCloud Kalender mit Namen auf.",
      annotations: { readOnlyHint: true },
    },
    () => run(() => calendar.listCalendars()),
  );

  server.registerTool(
    "calendar_list_events",
    {
      title: "Termine anzeigen",
      description: `Termine in einem Zeitraum, wiederkehrende Termine werden aufgelöst. Zeiten werden in ${config.timezone} zurückgegeben.`,
      inputSchema: {
        start: z.string().describe(`Beginn des Zeitraums. ${timeHint}`),
        end: z.string().describe("Ende des Zeitraums (exklusiv), gleiches Format."),
        calendar: z.string().optional().describe("Name des Kalenders. Leer lassen für alle Kalender."),
      },
      annotations: { readOnlyHint: true },
    },
    (args) => run(() => calendar.listEvents(args)),
  );

  if (config.allowCalendarWrite) {
    server.registerTool(
      "calendar_create_event",
      {
        title: "Termin anlegen",
        description: "Legt einen neuen Termin an. Ohne Ende dauert er eine Stunde (bzw. einen Tag bei ganztägig).",
        inputSchema: {
          calendar: z.string().describe("Name des Kalenders, siehe calendar_list_calendars."),
          title: z.string(),
          start: z.string().describe(timeHint),
          end: z.string().optional().describe("Ende. Bei ganztägig der letzte Tag (inklusiv)."),
          location: z.string().optional(),
          description: z.string().optional(),
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
      },
      (args) => run(() => calendar.createEvent(args)),
    );

    server.registerTool(
      "calendar_update_event",
      {
        title: "Termin ändern",
        description:
          "Ändert einen Termin. Nur übergebene Felder werden geändert; wird nur der Start verschoben, bleibt die Dauer gleich. Bei wiederkehrenden Terminen betrifft das die ganze Serie.",
        inputSchema: {
          id: z.string().describe("id des Termins aus calendar_list_events."),
          title: z.string().optional(),
          start: z.string().optional().describe(timeHint),
          end: z.string().optional(),
          location: z.string().optional().describe("Leerer Text entfernt den Ort."),
          description: z.string().optional().describe("Leerer Text entfernt die Beschreibung."),
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
      },
      ({ id, ...input }) => run(() => calendar.updateEvent(id, input)),
    );

    server.registerTool(
      "calendar_delete_event",
      {
        title: "Termin löschen",
        description:
          "Löscht einen Termin endgültig, bei wiederkehrenden Terminen die ganze Serie. Vorher immer beim Nutzer nachfragen.",
        inputSchema: { id: z.string().describe("id des Termins aus calendar_list_events.") },
        annotations: { readOnlyHint: false, destructiveHint: true },
      },
      ({ id }) => run(() => calendar.deleteEvent(id).then(() => ({ deleted: id }))),
    );
  }

  // ---------- Mail ----------

  server.registerTool(
    "mail_list_folders",
    {
      title: "Mailordner auflisten",
      description: "Listet alle Mailordner mit Anzahl gesamt und ungelesen.",
      annotations: { readOnlyHint: true },
    },
    () => run(() => mail.listFolders()),
  );

  server.registerTool(
    "mail_search",
    {
      title: "Mails suchen",
      description: "Sucht Mails in einem Ordner und gibt die neuesten Treffer zuerst zurück (ohne Inhalt, dafür mail_read nutzen).",
      inputSchema: {
        folder: z.string().optional().describe('Ordner, Standard "INBOX".'),
        from: z.string().optional().describe("Absender enthält"),
        to: z.string().optional().describe("Empfänger enthält"),
        subject: z.string().optional().describe("Betreff enthält"),
        text: z.string().optional().describe("Volltext (Kopf und Inhalt) enthält"),
        since: z.string().optional().describe("Ab Datum, z.B. 2026-10-01"),
        before: z.string().optional().describe("Vor Datum"),
        unseen: z.boolean().optional().describe("Nur ungelesene"),
        flagged: z.boolean().optional().describe("Nur markierte"),
        limit: z.number().int().optional().describe("Maximal so viele Treffer, Standard 20, höchstens 100."),
      },
      annotations: { readOnlyHint: true },
    },
    (args) => run(() => mail.searchMail(args)),
  );

  server.registerTool(
    "mail_read",
    {
      title: "Mail lesen",
      description: "Liest eine Mail komplett (Kopf, Text, Liste der Anhänge). Markiert sie nicht als gelesen.",
      inputSchema: {
        folder: z.string().optional().describe('Ordner, Standard "INBOX".'),
        uid: z.number().int().describe("uid aus mail_search"),
        maxChars: z.number().int().optional().describe("Text kürzen ab so vielen Zeichen, Standard 20000."),
      },
      annotations: { readOnlyHint: true },
    },
    (args) => run(() => mail.readMail(args)),
  );

  const composeShape = {
    to: z.string().optional().describe("Empfänger, mehrere mit Komma. Bei Antworten optional (dann Absender der Originalmail)."),
    cc: z.string().optional(),
    bcc: z.string().optional(),
    subject: z.string().optional().describe('Bei Antworten optional (dann "Re: ...").'),
    body: z.string().describe("Text der Mail (nur Text, kein HTML)."),
    replyTo: z
      .object({ folder: z.string().optional(), uid: z.number().int() })
      .optional()
      .describe("Mail, auf die geantwortet wird. Setzt Threading Header."),
  };

  server.registerTool(
    "mail_create_draft",
    {
      title: "Mailentwurf anlegen",
      description: "Speichert eine Mail als Entwurf im Entwürfe Ordner. Sie wird nicht gesendet und kann in Apple Mail geprüft und abgeschickt werden.",
      inputSchema: composeShape,
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    (args) => run(() => mail.createDraft(args)),
  );

  if (config.allowSend) {
    server.registerTool(
      "mail_send",
      {
        title: "Mail senden",
        description: "Sendet eine Mail sofort. Nur nach ausdrücklicher Bestätigung des Nutzers mit dem finalen Text verwenden, sonst mail_create_draft.",
        inputSchema: composeShape,
        annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
      },
      (args) => run(() => mail.sendMail(args)),
    );
  }

  server.registerTool(
    "mail_set_flags",
    {
      title: "Mail markieren",
      description: "Setzt eine Mail auf gelesen/ungelesen oder markiert/entfernt die Markierung.",
      inputSchema: {
        folder: z.string().optional(),
        uid: z.number().int(),
        seen: z.boolean().optional(),
        flagged: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    (args) => run(() => mail.setFlags(args)),
  );

  server.registerTool(
    "mail_move",
    {
      title: "Mail verschieben",
      description: "Verschiebt eine Mail in einen anderen Ordner (z.B. Archiv). Verschieben in den Papierkorb nur nach Rückfrage.",
      inputSchema: {
        folder: z.string().optional().describe('Quellordner, Standard "INBOX".'),
        uid: z.number().int(),
        target: z.string().describe("Zielordner, siehe mail_list_folders."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    (args) => run(() => mail.moveMail(args)),
  );

  return server;
}

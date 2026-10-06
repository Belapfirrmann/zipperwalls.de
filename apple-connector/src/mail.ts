import { ImapFlow, type FetchMessageObject, type SearchObject } from "imapflow";
import { simpleParser, type AddressObject } from "mailparser";
import nodemailer from "nodemailer";
import { config } from "./config.js";
import { formatLocal, parseDateTime } from "./time.js";

async function withImap<T>(fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  const client = new ImapFlow({
    host: config.imap.host,
    port: config.imap.port,
    secure: config.imap.secure,
    auth: { user: config.imap.user, pass: config.imap.password },
    logger: false,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.logout().catch(() => client.close());
  }
}

async function withFolder<T>(folder: string, fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  return withImap(async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      return await fn(client);
    } finally {
      lock.release();
    }
  });
}

async function specialFolder(client: ImapFlow, use: "\\Drafts" | "\\Sent", fallbacks: string[]): Promise<string> {
  const folders = await client.list();
  const bySpecialUse = folders.find((f) => f.specialUse === use);
  if (bySpecialUse) return bySpecialUse.path;
  const byName = folders.find((f) => fallbacks.some((name) => f.path.toLowerCase() === name.toLowerCase()));
  if (byName) return byName.path;
  throw new Error(`Ordner ${use} nicht gefunden`);
}

export async function listFolders() {
  return withImap(async (client) => {
    const folders = await client.list({ statusQuery: { messages: true, unseen: true } });
    return folders.map((f) => ({
      path: f.path,
      specialUse: f.specialUse || undefined,
      messages: f.status?.messages,
      unseen: f.status?.unseen,
    }));
  });
}

function addressList(list?: { name?: string; address?: string }[]): string {
  return (list ?? []).map((a) => (a.name ? `${a.name} <${a.address}>` : (a.address ?? ""))).join(", ");
}

function overview(msg: FetchMessageObject) {
  const env = msg.envelope;
  return {
    uid: msg.uid,
    date: env?.date ? formatLocal(new Date(env.date)) : undefined,
    from: addressList(env?.from),
    to: addressList(env?.to),
    subject: env?.subject ?? "",
    seen: msg.flags?.has("\\Seen") ?? false,
    flagged: msg.flags?.has("\\Flagged") ?? false,
  };
}

export type SearchParams = {
  folder?: string;
  from?: string;
  to?: string;
  subject?: string;
  text?: string;
  since?: string;
  before?: string;
  unseen?: boolean;
  flagged?: boolean;
  limit?: number;
};

export async function searchMail(params: SearchParams) {
  const folder = params.folder || "INBOX";
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
  const query: SearchObject = {};
  if (params.from) query.from = params.from;
  if (params.to) query.to = params.to;
  if (params.subject) query.subject = params.subject;
  if (params.text) query.text = params.text;
  if (params.since) query.since = parseDateTime(params.since);
  if (params.before) query.before = parseDateTime(params.before);
  if (params.unseen) query.seen = false;
  if (params.flagged) query.flagged = true;
  if (Object.keys(query).length === 0) query.all = true;

  return withFolder(folder, async (client) => {
    const uids = (await client.search(query, { uid: true })) || [];
    const newest = uids.sort((a, b) => b - a).slice(0, limit);
    if (newest.length === 0) return { folder, total: 0, messages: [] };
    const messages = [];
    for await (const msg of client.fetch(newest.join(","), { uid: true, envelope: true, flags: true }, { uid: true })) {
      messages.push(overview(msg));
    }
    messages.sort((a, b) => b.uid - a.uid);
    return { folder, total: uids.length, messages };
  });
}

function addressText(addr?: AddressObject | AddressObject[]): string | undefined {
  if (!addr) return undefined;
  return (Array.isArray(addr) ? addr : [addr]).map((a) => a.text).join(", ");
}

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fetchRaw(client: ImapFlow, uid: number): Promise<Buffer> {
  const msg = await client.fetchOne(String(uid), { uid: true, source: true }, { uid: true });
  if (!msg || !msg.source) throw new Error(`Mail mit UID ${uid} nicht gefunden`);
  return msg.source;
}

export async function readMail(params: { folder?: string; uid: number; maxChars?: number }) {
  const folder = params.folder || "INBOX";
  const maxChars = params.maxChars ?? 20000;
  const raw = await withFolder(folder, (client) => fetchRaw(client, params.uid));
  const parsed = await simpleParser(raw);
  let body = parsed.text?.trim() || (parsed.html ? htmlToText(parsed.html) : "");
  if (body.length > maxChars) body = `${body.slice(0, maxChars)}\n\n[… gekürzt, ${body.length} Zeichen insgesamt]`;
  return {
    folder,
    uid: params.uid,
    messageId: parsed.messageId,
    date: parsed.date ? formatLocal(parsed.date) : undefined,
    from: addressText(parsed.from),
    to: addressText(parsed.to),
    cc: addressText(parsed.cc),
    replyTo: addressText(parsed.replyTo),
    subject: parsed.subject ?? "",
    body,
    attachments: parsed.attachments.map((a) => ({
      filename: a.filename,
      contentType: a.contentType,
      size: a.size,
    })),
  };
}

export type ComposeParams = {
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  body: string;
  replyTo?: { folder?: string; uid: number };
};

type BuiltMessage = { raw: Buffer; envelope: { to: string; cc?: string; bcc?: string; subject: string } };

async function buildMessage(params: ComposeParams): Promise<BuiltMessage> {
  let to = params.to;
  let subject = params.subject;
  let inReplyTo: string | undefined;
  let references: string[] | undefined;

  if (params.replyTo) {
    const raw = await withFolder(params.replyTo.folder || "INBOX", (client) => fetchRaw(client, params.replyTo!.uid));
    const original = await simpleParser(raw);
    inReplyTo = original.messageId;
    const prior = original.references ? (Array.isArray(original.references) ? original.references : [original.references]) : [];
    references = original.messageId ? [...prior, original.messageId] : prior;
    to ??= addressText(original.replyTo) ?? addressText(original.from);
    if (!subject) {
      const base = original.subject ?? "";
      subject = /^(re|aw):/i.test(base) ? base : `Re: ${base}`;
    }
  }

  if (!to) throw new Error("Empfänger (to) fehlt");
  subject ??= "";

  const composer = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "windows" });
  const info = await composer.sendMail({
    from: config.mailFrom,
    to,
    cc: params.cc,
    bcc: params.bcc,
    subject,
    text: params.body,
    inReplyTo,
    references,
  });
  return { raw: info.message as Buffer, envelope: { to, cc: params.cc, bcc: params.bcc, subject } };
}

export async function createDraft(params: ComposeParams) {
  const { raw, envelope } = await buildMessage(params);
  const folder = await withImap(async (client) => {
    const drafts = await specialFolder(client, "\\Drafts", ["Drafts", "Entwürfe"]);
    await client.append(drafts, raw, ["\\Draft", "\\Seen"]);
    return drafts;
  });
  return { savedIn: folder, ...envelope };
}

/** Entfernt den Bcc Header (inkl. Folgezeilen), damit Empfänger die Bcc Adressen nicht sehen. */
function stripBcc(raw: Buffer): Buffer {
  const text = raw.toString("utf8");
  const split = text.indexOf("\r\n\r\n");
  const head = split === -1 ? text : text.slice(0, split);
  const lines = head.split("\r\n");
  const kept: string[] = [];
  let skipping = false;
  for (const line of lines) {
    if (/^bcc:/i.test(line)) {
      skipping = true;
      continue;
    }
    if (skipping && /^[ \t]/.test(line)) continue;
    skipping = false;
    kept.push(line);
  }
  return Buffer.from(kept.join("\r\n") + (split === -1 ? "" : text.slice(split)), "utf8");
}

export async function sendMail(params: ComposeParams) {
  if (!config.allowSend) throw new Error("Senden ist deaktiviert (ALLOW_SEND=false). Bitte als Entwurf speichern.");
  const { raw, envelope } = await buildMessage(params);
  const transport = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: { user: config.smtp.user, pass: config.smtp.password },
  });
  const recipients = [envelope.to, envelope.cc, envelope.bcc].filter(Boolean).join(", ");
  await transport.sendMail({ envelope: { from: config.mailFrom, to: recipients }, raw: stripBcc(raw) });
  // Kopie in "Gesendet" ablegen, da nicht jeder Anbieter das bei SMTP selbst macht.
  const sentFolder = await withImap(async (client) => {
    const sent = await specialFolder(client, "\\Sent", ["Sent Messages", "Sent", "Gesendet"]);
    await client.append(sent, raw, ["\\Seen"]);
    return sent;
  }).catch(() => undefined);
  return { sent: true, savedIn: sentFolder, ...envelope };
}

export async function setFlags(params: { folder?: string; uid: number; seen?: boolean; flagged?: boolean }) {
  return withFolder(params.folder || "INBOX", async (client) => {
    const add: string[] = [];
    const remove: string[] = [];
    if (params.seen !== undefined) (params.seen ? add : remove).push("\\Seen");
    if (params.flagged !== undefined) (params.flagged ? add : remove).push("\\Flagged");
    if (add.length) await client.messageFlagsAdd(String(params.uid), add, { uid: true });
    if (remove.length) await client.messageFlagsRemove(String(params.uid), remove, { uid: true });
    return { uid: params.uid, added: add, removed: remove };
  });
}

export async function moveMail(params: { folder?: string; uid: number; target: string }) {
  return withFolder(params.folder || "INBOX", async (client) => {
    const result = await client.messageMove(String(params.uid), params.target, { uid: true });
    if (!result) throw new Error("Verschieben fehlgeschlagen");
    const newUid = result.uidMap?.get(params.uid);
    return { movedTo: params.target, newUid };
  });
}

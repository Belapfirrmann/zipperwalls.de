import { config } from "./config.js";

/** Offset der Zeitzone zum Zeitpunkt `date` in Minuten (z.B. +120 für MESZ). */
function offsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - date.getTime()) / 60000);
}

const LOCAL_DATETIME = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

/**
 * Wandelt eine Zeitangabe in ein Date um. Ohne Offset (z.B. "2026-10-06T14:00")
 * wird sie als Ortszeit in config.timezone verstanden.
 */
export function parseDateTime(input: string, timeZone = config.timezone): Date {
  const match = LOCAL_DATETIME.exec(input.trim());
  if (!match) {
    const date = new Date(input);
    if (Number.isNaN(date.getTime())) throw new Error(`Ungültige Zeitangabe: ${input}`);
    return date;
  }
  const [, y, mo, d, h = "0", mi = "0", s = "0"] = match;
  const guess = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  let result = guess - offsetMinutes(new Date(guess), timeZone) * 60000;
  // Zweiter Durchlauf, falls die Zeitumstellung zwischen Schätzung und Ergebnis liegt.
  result = guess - offsetMinutes(new Date(result), timeZone) * 60000;
  return new Date(result);
}

/** Formatiert ein Date als lokale ISO Zeit mit Offset, z.B. 2026-10-06T14:00:00+02:00 */
export function formatLocal(date: Date, timeZone = config.timezone): string {
  const offset = offsetMinutes(date, timeZone);
  const local = new Date(date.getTime() + offset * 60000).toISOString().slice(0, 19);
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  return `${local}${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

export function isDateOnly(input: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(input.trim());
}

/** "2026-10-06" plus n Tage */
export function addDays(dateOnly: string, days: number): string {
  const d = new Date(`${dateOnly}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

import { randomUUID } from "node:crypto";
import ICAL from "ical.js";
import { DAVClient, type DAVCalendar, type DAVCalendarObject } from "tsdav";
import { config } from "./config.js";
import { addDays, formatLocal, isDateOnly, parseDateTime } from "./time.js";

export type CalendarInfo = { name: string; url: string; color?: string };

export type EventSummary = {
  id: string; // URL des Kalenderobjekts, für Ändern und Löschen
  uid: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  description?: string;
  calendar: string;
  recurring: boolean;
};

let clientPromise: Promise<DAVClient> | null = null;

function client(): Promise<DAVClient> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const c = new DAVClient({
        serverUrl: config.caldav.url,
        credentials: { username: config.caldav.user, password: config.caldav.password },
        authMethod: "Basic",
        defaultAccountType: "caldav",
      });
      await c.login();
      return c;
    })().catch((err) => {
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

function displayName(cal: DAVCalendar): string {
  const name = cal.displayName;
  if (typeof name === "string" && name) return name;
  return cal.url.split("/").filter(Boolean).pop() ?? cal.url;
}

async function eventCalendars(): Promise<DAVCalendar[]> {
  const c = await client();
  const calendars = await c.fetchCalendars();
  return calendars.filter((cal) => !cal.components || cal.components.includes("VEVENT"));
}

async function findCalendar(ref: string): Promise<DAVCalendar> {
  const calendars = await eventCalendars();
  const needle = ref.trim().toLowerCase();
  const found =
    calendars.find((cal) => cal.url === ref) ??
    calendars.find((cal) => displayName(cal).toLowerCase() === needle);
  if (!found) {
    const names = calendars.map(displayName).join(", ");
    throw new Error(`Kalender "${ref}" nicht gefunden. Vorhanden: ${names}`);
  }
  return found;
}

async function calendarForObject(objectUrl: string): Promise<DAVCalendar> {
  const calendars = await eventCalendars();
  const found = calendars.find((cal) => objectUrl.startsWith(cal.url));
  if (!found) throw new Error(`Kein Kalender zu Termin ${objectUrl} gefunden`);
  return found;
}

export async function listCalendars(): Promise<CalendarInfo[]> {
  const calendars = await eventCalendars();
  return calendars.map((cal) => ({
    name: displayName(cal),
    url: cal.url,
    color: typeof cal.calendarColor === "string" ? cal.calendarColor : undefined,
  }));
}

function registerTimezones(root: ICAL.Component) {
  for (const tz of root.getAllSubcomponents("vtimezone")) {
    const tzid = tz.getFirstPropertyValue("tzid");
    if (typeof tzid === "string" && !ICAL.TimezoneService.has(tzid)) {
      ICAL.TimezoneService.register(new ICAL.Timezone(tz), tzid);
    }
  }
}

function formatTime(time: ICAL.Time): string {
  if (time.isDate) return time.toString(); // YYYY-MM-DD
  return formatLocal(time.toJSDate());
}

function truncate(text: string | undefined, max: number): string | undefined {
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max)} …` : text;
}

function summarize(
  item: ICAL.Event,
  start: ICAL.Time,
  end: ICAL.Time,
  obj: DAVCalendarObject,
  calendar: string,
  recurring: boolean,
): EventSummary {
  // Ganztägige Termine enden in iCal exklusiv, wir zeigen den letzten Tag inklusiv an.
  const endText = end.isDate ? addDays(end.toString(), -1) : formatTime(end);
  return {
    id: obj.url,
    uid: item.uid,
    title: item.summary || "(ohne Titel)",
    start: formatTime(start),
    end: endText,
    allDay: start.isDate,
    location: item.location || undefined,
    description: truncate(item.description, 1000),
    calendar,
    recurring,
  };
}

function expandObject(
  obj: DAVCalendarObject,
  calendar: string,
  rangeStart: Date,
  rangeEnd: Date,
): EventSummary[] {
  if (!obj.data) return [];
  const root = new ICAL.Component(ICAL.parse(obj.data));
  registerTimezones(root);
  const vevents = root.getAllSubcomponents("vevent");
  const master = vevents.find((v) => !v.hasProperty("recurrence-id"));
  const exceptions = vevents.filter((v) => v.hasProperty("recurrence-id"));
  const overlaps = (s: ICAL.Time, e: ICAL.Time) => s.toJSDate() < rangeEnd && e.toJSDate() > rangeStart;
  const out: EventSummary[] = [];

  if (!master) {
    for (const ex of exceptions) {
      const ev = new ICAL.Event(ex);
      if (overlaps(ev.startDate, ev.endDate)) out.push(summarize(ev, ev.startDate, ev.endDate, obj, calendar, true));
    }
    return out;
  }

  const event = new ICAL.Event(master);
  for (const ex of exceptions) event.relateException(ex);

  if (!event.isRecurring()) {
    if (overlaps(event.startDate, event.endDate)) {
      out.push(summarize(event, event.startDate, event.endDate, obj, calendar, false));
    }
    return out;
  }

  const iterator = event.iterator();
  for (let next = iterator.next(), guard = 0; next && guard < 5000; next = iterator.next(), guard++) {
    if (next.toJSDate() >= rangeEnd) break;
    const details = event.getOccurrenceDetails(next);
    if (overlaps(details.startDate, details.endDate)) {
      out.push(summarize(details.item, details.startDate, details.endDate, obj, calendar, true));
    }
  }
  return out;
}

export async function listEvents(params: { start: string; end: string; calendar?: string }): Promise<EventSummary[]> {
  const rangeStart = parseDateTime(params.start);
  const rangeEnd = parseDateTime(params.end);
  if (rangeEnd <= rangeStart) throw new Error("Ende muss nach dem Start liegen");

  const c = await client();
  const calendars = params.calendar ? [await findCalendar(params.calendar)] : await eventCalendars();
  const results = await Promise.all(
    calendars.map(async (cal) => {
      const objects = await c.fetchCalendarObjects({
        calendar: cal,
        timeRange: { start: rangeStart.toISOString(), end: rangeEnd.toISOString() },
      });
      return objects.flatMap((obj) => {
        try {
          return expandObject(obj, displayName(cal), rangeStart, rangeEnd);
        } catch (err) {
          console.warn(`Termin ${obj.url} konnte nicht gelesen werden:`, err);
          return [];
        }
      });
    }),
  );
  return results.flat().sort((a, b) => a.start.localeCompare(b.start));
}

export type EventInput = {
  title?: string;
  start?: string;
  end?: string;
  location?: string;
  description?: string;
};

function timeFromInput(input: string): ICAL.Time {
  if (isDateOnly(input)) return ICAL.Time.fromDateString(input.trim());
  return ICAL.Time.fromJSDate(parseDateTime(input), true);
}

function applyInput(vevent: ICAL.Component, input: EventInput) {
  const setText = (name: string, value: string | undefined) => {
    if (value === undefined) return;
    vevent.removeAllProperties(name);
    if (value !== "") vevent.addPropertyWithValue(name, value);
  };
  setText("summary", input.title);
  setText("location", input.location);
  setText("description", input.description);

  if (input.start !== undefined) {
    vevent.removeAllProperties("dtstart");
    vevent.addPropertyWithValue("dtstart", timeFromInput(input.start));
  }
  if (input.end !== undefined) {
    // Bei ganztägigen Terminen ist das übergebene Ende der letzte Tag (inklusiv).
    const end = isDateOnly(input.end) ? ICAL.Time.fromDateString(addDays(input.end.trim(), 1)) : timeFromInput(input.end);
    vevent.removeAllProperties("dtend");
    vevent.removeAllProperties("duration");
    vevent.addPropertyWithValue("dtend", end);
  }
  vevent.removeAllProperties("dtstamp");
  vevent.addPropertyWithValue("dtstamp", ICAL.Time.fromJSDate(new Date(), true));
}

function defaultEnd(start: string): string {
  if (isDateOnly(start)) return start.trim();
  return new Date(parseDateTime(start).getTime() + 60 * 60000).toISOString();
}

export async function createEvent(params: EventInput & { calendar: string; start: string }): Promise<EventSummary> {
  const c = await client();
  const cal = await findCalendar(params.calendar);
  const uid = randomUUID().toUpperCase();

  const root = new ICAL.Component(["vcalendar", [], []]);
  root.addPropertyWithValue("version", "2.0");
  root.addPropertyWithValue("prodid", "-//Zipperwalls//Apple Connector//DE");
  const vevent = new ICAL.Component("vevent");
  vevent.addPropertyWithValue("uid", uid);
  applyInput(vevent, { ...params, end: params.end ?? defaultEnd(params.start) });
  root.addSubcomponent(vevent);

  const filename = `${uid}.ics`;
  const res = await c.createCalendarObject({ calendar: cal, filename, iCalString: root.toString() });
  if (!res.ok) throw new Error(`Termin konnte nicht angelegt werden: HTTP ${res.status}`);

  const url = new URL(filename, cal.url).toString();
  const event = new ICAL.Event(vevent);
  return summarize(event, event.startDate, event.endDate, { url, data: root.toString() }, displayName(cal), false);
}

async function fetchObject(id: string): Promise<{ cal: DAVCalendar; obj: DAVCalendarObject }> {
  const c = await client();
  const cal = await calendarForObject(id);
  const [obj] = await c.fetchCalendarObjects({ calendar: cal, objectUrls: [id] });
  if (!obj?.data) throw new Error(`Termin ${id} nicht gefunden`);
  return { cal, obj };
}

export async function updateEvent(id: string, input: EventInput): Promise<EventSummary> {
  const c = await client();
  const { cal, obj } = await fetchObject(id);
  const root = new ICAL.Component(ICAL.parse(obj.data));
  registerTimezones(root);
  const vevent = root.getAllSubcomponents("vevent").find((v) => !v.hasProperty("recurrence-id"));
  if (!vevent) throw new Error("Termin hat keinen Haupteintrag und kann nicht geändert werden");

  // Wird nur der Start verschoben, bleibt die Dauer erhalten.
  if (input.start !== undefined && input.end === undefined) {
    const before = new ICAL.Event(vevent);
    if (isDateOnly(input.start)) {
      const days = Math.max(1, Math.round(before.duration.toSeconds() / 86400));
      input = { ...input, end: addDays(input.start.trim(), days - 1) };
    } else {
      const durationMs = before.duration.toSeconds() * 1000;
      input = { ...input, end: new Date(parseDateTime(input.start).getTime() + durationMs).toISOString() };
    }
  }

  applyInput(vevent, input);
  const sequence = Number(vevent.getFirstPropertyValue("sequence") ?? 0);
  vevent.removeAllProperties("sequence");
  vevent.addPropertyWithValue("sequence", sequence + 1);

  const data = root.toString();
  const res = await c.updateCalendarObject({ calendarObject: { url: obj.url, etag: obj.etag, data } });
  if (!res.ok) throw new Error(`Termin konnte nicht geändert werden: HTTP ${res.status}`);
  const event = new ICAL.Event(vevent);
  return summarize(event, event.startDate, event.endDate, { url: obj.url, data }, displayName(cal), event.isRecurring());
}

export async function deleteEvent(id: string): Promise<void> {
  const c = await client();
  const { obj } = await fetchObject(id);
  const res = await c.deleteCalendarObject({ calendarObject: { url: obj.url, etag: obj.etag } });
  if (!res.ok) throw new Error(`Termin konnte nicht gelöscht werden: HTTP ${res.status}`);
}

import type { CalEvent, CalendarClient, CalendarInfo, EventInput } from "../calendar/index.js";
import type { GraphMail } from "./index.js";

/**
 * Her Outlook calendar (Microsoft 365), read-only: Grow puts her client sessions here. The app shows it next to
 * Google Calendar; new events and changes are made in Outlook. Events that look like client sessions are marked
 * `private`, so their titles never go into Claude requests.
 */
const READ_ONLY = "Your Outlook calendar is read-only here: add or change Outlook events in Outlook.";
export const OUTLOOK_PREFIX = "outlook:";
/**
 * Looks like a client session: it came from Grow, or its title or place says client / intake / telehealth /
 * counseling / therapy session / "session with ...". Her own business name ("Get In Tune Music Therapy",
 * getintunemusictherapy.com) is taken out first: it's on most of her events and isn't a sign of a client.
 */
const FROM_GROW = /growtherapy|grow therapy|\bgrow\b/i;
const CLIENTISH = /\bclients?\b|\bintake\b|tele-?health|counsel+ing|therapy session|\bsession with\b|\bappointment with\b/i;
const HER_BUSINESS = /get\s*in\s*tune(\s*music\s*therapy)?|getintunemusictherapy(\.com)?/gi;
export function looksLikeClientSession(e: { subject?: string; location?: string; organizer?: string }): boolean {
  const clean = (t?: string) => String(t ?? "").replace(HER_BUSINESS, " ");
  const title = clean(e.subject), place = clean(e.location), org = clean(e.organizer);
  return FROM_GROW.test(`${title} ${place} ${org}`) || CLIENTISH.test(`${title} ${place}`);
}

export class OutlookCalendar implements CalendarClient {
  readonly kind = "outlook" as const;
  constructor(private g: GraphMail) {}
  connected() {
    return this.g.connected();
  }

  async calendars(): Promise<CalendarInfo[]> {
    const j = await this.g.api("/me/calendars?$select=id,name,hexColor,isDefaultCalendar");
    return (j.value ?? []).map((c: any) => ({ id: OUTLOOK_PREFIX + c.id, name: `${c.name} (Outlook)`, color: c.hexColor || "#4241a0", primary: !!c.isDefaultCalendar, writable: false }));
  }

  async events(o: { start: string; end: string; calendarIds?: string[]; q?: string }): Promise<CalEvent[]> {
    const cals = (await this.calendars()).filter((c) => !o.calendarIds?.length || o.calendarIds.includes(c.id));
    const out: CalEvent[] = [];
    for (const c of cals) {
      const id = c.id.slice(OUTLOOK_PREFIX.length);
      const q = new URLSearchParams({ startDateTime: o.start, endDateTime: o.end, $top: "250", $select: "id,subject,start,end,isAllDay,location,webLink,onlineMeeting,seriesMasterId,responseStatus,organizer,bodyPreview,showAs" });
      const j = await this.g.api(`/me/calendars/${encodeURIComponent(id)}/calendarView?${q}`, { Prefer: 'outlook.timezone="UTC"' });
      for (const e of j.value ?? []) out.push(toEvent(c, e));
    }
    const q = o.q?.toLowerCase();
    return out.filter((e) => !q || e.title.toLowerCase().includes(q)).sort((a, b) => a.start.localeCompare(b.start));
  }

  async busy(o: { start: string; end: string; calendarIds?: string[] }) {
    return (await this.events(o)).filter((e) => !e.allDay).map((e) => ({ start: e.start, end: e.end }));
  }

  async create(_e: EventInput): Promise<CalEvent> {
    throw new Error(READ_ONLY);
  }
  async update(): Promise<CalEvent> {
    throw new Error(READ_ONLY);
  }
  async remove(): Promise<void> {
    throw new Error(READ_ONLY);
  }
}

function utc(dt: string | undefined): string {
  if (!dt) return "";
  return /[zZ]|[+-]\d\d:\d\d$/.test(dt) ? new Date(dt).toISOString() : new Date(`${dt.replace(/\.\d+$/, "")}Z`).toISOString();
}

export function toEvent(c: CalendarInfo, e: any): CalEvent {
  const allDay = !!e.isAllDay;
  const title = String(e.subject ?? "(no title)");
  const location = e.location?.displayName || undefined;
  return {
    id: String(e.id),
    calendarId: c.id,
    title,
    start: allDay ? String(e.start?.dateTime ?? "").slice(0, 10) : utc(e.start?.dateTime),
    end: allDay ? String(e.end?.dateTime ?? "").slice(0, 10) : utc(e.end?.dateTime),
    allDay,
    location,
    color: c.color,
    link: e.webLink || undefined,
    meet: e.onlineMeeting?.joinUrl || undefined,
    recurringId: e.seriesMasterId || undefined,
    myResponse: ({ accepted: "accepted", declined: "declined", tentativelyAccepted: "tentative", notResponded: "needsAction" } as Record<string, string>)[e.responseStatus?.response] ?? undefined,
    private: looksLikeClientSession({ subject: title, location, organizer: `${e.organizer?.emailAddress?.address ?? ""} ${e.organizer?.emailAddress?.name ?? ""}` }),
    source: "outlook",
  };
}

/**
 * Google Calendar and her Outlook calendar together: both shown, new events go to Google Calendar (Outlook is
 * read-only here). If one side isn't connected or doesn't answer, the other still shows.
 */
export class CombinedCalendar implements CalendarClient {
  readonly kind = "combined" as const;
  constructor(private google: CalendarClient, private outlook: CalendarClient) {}
  connected() {
    return this.google.connected() || this.outlook.connected();
  }
  private sides() {
    return [this.google, this.outlook].filter((c) => c.connected());
  }
  async calendars() {
    return (await Promise.all(this.sides().map((c) => c.calendars().catch(() => [])))).flat();
  }
  async events(o: { start: string; end: string; calendarIds?: string[]; q?: string }) {
    const pick = (c: CalendarClient) => (o.calendarIds?.length ? { ...o, calendarIds: o.calendarIds.filter((id) => id.startsWith(OUTLOOK_PREFIX) === (c === this.outlook)) } : o);
    const wanted = this.sides().filter((c) => !o.calendarIds?.length || (pick(c).calendarIds ?? []).length);
    return (await Promise.all(wanted.map((c) => c.events(pick(c)).catch(() => [])))).flat().sort((a, b) => a.start.localeCompare(b.start));
  }
  async busy(o: { start: string; end: string; calendarIds?: string[] }) {
    return (await Promise.all(this.sides().map((c) => c.busy(o).catch(() => [])))).flat();
  }
  private route(calendarId?: string) {
    return calendarId?.startsWith(OUTLOOK_PREFIX) ? this.outlook : this.google;
  }
  create(e: EventInput) {
    if (!this.google.connected() && !e.calendarId?.startsWith(OUTLOOK_PREFIX)) throw new Error("New events go to Google Calendar, which isn't connected yet (Connect Gmail). Or add it in Outlook.");
    return this.route(e.calendarId).create(e);
  }
  update(calendarId: string, id: string, e: Partial<EventInput>) {
    return this.route(calendarId).update(calendarId, id, e);
  }
  remove(calendarId: string, id: string) {
    return this.route(calendarId).remove(calendarId, id);
  }
}

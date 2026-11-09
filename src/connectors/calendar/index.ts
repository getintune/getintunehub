import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { google, type calendar_v3 } from "googleapis";
import type { Config } from "../../core/config.js";
import { GoogleAuth, SCOPES } from "../google/auth.js";
import { TIME_ZONE } from "../../core/config.js";
import { CombinedCalendar, OutlookCalendar } from "../outlook/calendar.js";
import { GraphMail } from "../outlook/index.js";

/** Google Calendar: the owner's calendars and events, read and write. */
export interface CalendarInfo {
  id: string;
  name: string;
  color: string;
  primary: boolean;
  writable: boolean;
}

export interface CalEvent {
  id: string;
  calendarId: string;
  title: string;
  start: string; // ISO date-time, or YYYY-MM-DD when allDay
  end: string;
  allDay: boolean;
  location?: string;
  description?: string;
  color?: string;
  link?: string; // open in Google Calendar
  meet?: string;
  attendees?: { email: string; name?: string; response?: string }[];
  /** The series a repeating event belongs to (Google's recurringEventId). */
  recurringId?: string;
  /** Her own answer when she's an invitee: "accepted", "declined", "tentative", "needsAction". */
  myResponse?: string;
  /** Looks like a client session (e.g. from Grow): shown to her, but never put into Claude requests. */
  private?: boolean;
  /** Why it counts as a client session (e.g. 'the title says "intake"'), for her to check. */
  privateWhy?: string;
  /** Where it lives: Google Calendar or her Outlook calendar (read-only here). */
  source?: "google" | "outlook";
}

export interface EventInput {
  calendarId?: string;
  title: string;
  start: string;
  end: string;
  allDay?: boolean;
  location?: string;
  description?: string;
  attendees?: string[];
  /** Minutes before the start for a popup reminder. */
  reminderMinutes?: number;
}

export interface CalendarClient {
  readonly kind: "mock" | "google" | "outlook" | "combined";
  connected(): boolean;
  calendars(): Promise<CalendarInfo[]>;
  events(o: { start: string; end: string; calendarIds?: string[]; q?: string }): Promise<CalEvent[]>;
  create(e: EventInput): Promise<CalEvent>;
  update(calendarId: string, id: string, e: Partial<EventInput>): Promise<CalEvent>;
  remove(calendarId: string, id: string): Promise<void>;
  /** Busy blocks across the given calendars, for finding free time. */
  busy(o: { start: string; end: string; calendarIds?: string[] }): Promise<{ start: string; end: string }[]>;
}

export class GoogleCalendar implements CalendarClient {
  readonly kind = "google" as const;
  private api?: calendar_v3.Calendar;
  private colors?: Record<string, string>;
  constructor(private auth: GoogleAuth, private tz = TIME_ZONE) {}

  connected() {
    return this.auth.hasScope(SCOPES.calendar);
  }

  private cal() {
    if (!this.connected()) throw new Error("Google Calendar isn't connected yet: double-click Connect Gmail in the app's folder and click Allow (it now covers Calendar too).");
    this.api ??= google.calendar({ version: "v3", auth: this.auth.client() });
    return this.api;
  }

  private async eventColors() {
    if (this.colors) return this.colors;
    const { data } = await this.cal().colors.get();
    this.colors = Object.fromEntries(Object.entries(data.event ?? {}).map(([k, v]) => [k, v.background ?? ""]));
    return this.colors;
  }

  async calendars(): Promise<CalendarInfo[]> {
    const { data } = await this.cal().calendarList.list({ minAccessRole: "reader" });
    return (data.items ?? [])
      .filter((c) => !c.hidden)
      .map((c) => ({ id: c.id!, name: c.summaryOverride || c.summary || c.id!, color: c.backgroundColor ?? "#5b8def", primary: !!c.primary, writable: c.accessRole === "owner" || c.accessRole === "writer" }))
      .sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name));
  }

  private toEvent(calendarId: string, e: calendar_v3.Schema$Event, colors: Record<string, string>, calColor: string): CalEvent {
    const allDay = !!e.start?.date;
    const text = `${e.summary ?? ""} ${e.location ?? ""} ${e.description ?? ""}`;
    return {
      id: e.id!,
      calendarId,
      title: e.summary || "(no title)",
      start: allDay ? e.start!.date! : e.start?.dateTime ?? "",
      end: allDay ? e.end!.date! : e.end?.dateTime ?? "",
      allDay,
      location: e.location ?? undefined,
      description: e.description ?? undefined,
      color: (e.colorId && colors[e.colorId]) || calColor,
      link: e.htmlLink ?? undefined,
      meet: e.hangoutLink ?? undefined,
      attendees: (e.attendees ?? []).filter((a) => !a.self).map((a) => ({ email: a.email!, name: a.displayName ?? undefined, response: a.responseStatus ?? undefined })),
      recurringId: e.recurringEventId ?? undefined,
      myResponse: e.attendees?.find((a) => a.self)?.responseStatus ?? undefined,
    };
  }

  async events(o: { start: string; end: string; calendarIds?: string[]; q?: string }): Promise<CalEvent[]> {
    const cals = await this.calendars();
    const ids = o.calendarIds?.length ? o.calendarIds : cals.map((c) => c.id);
    const colors = await this.eventColors().catch(() => ({}));
    const lists = await Promise.all(
      ids.map(async (id) => {
        const { data } = await this.cal().events.list({ calendarId: id, timeMin: o.start, timeMax: o.end, singleEvents: true, orderBy: "startTime", maxResults: 500, q: o.q || undefined }).catch(() => ({ data: { items: [] as calendar_v3.Schema$Event[] } }));
        const color = cals.find((c) => c.id === id)?.color ?? "#5b8def";
        return (data.items ?? []).filter((e) => e.status !== "cancelled").map((e) => this.toEvent(id, e, colors, color));
      }),
    );
    return lists.flat().sort((a, b) => a.start.localeCompare(b.start));
  }

  private body(e: Partial<EventInput>): calendar_v3.Schema$Event {
    const b: calendar_v3.Schema$Event = {};
    if (e.title !== undefined) b.summary = e.title;
    if (e.location !== undefined) b.location = e.location;
    if (e.description !== undefined) b.description = e.description;
    if (e.start !== undefined) b.start = e.allDay ? { date: e.start.slice(0, 10) } : { dateTime: e.start, timeZone: this.tz };
    if (e.end !== undefined) b.end = e.allDay ? { date: e.end.slice(0, 10) } : { dateTime: e.end, timeZone: this.tz };
    if (e.attendees) b.attendees = e.attendees.map((email) => ({ email }));
    if (e.reminderMinutes !== undefined) b.reminders = { useDefault: false, overrides: [{ method: "popup", minutes: e.reminderMinutes }] };
    return b;
  }

  async create(e: EventInput): Promise<CalEvent> {
    const calendarId = e.calendarId || "primary";
    const { data } = await this.cal().events.insert({ calendarId, requestBody: this.body(e), sendUpdates: e.attendees?.length ? "all" : "none" });
    return this.toEvent(calendarId, data, await this.eventColors().catch(() => ({})), "#5b8def");
  }

  async update(calendarId: string, id: string, e: Partial<EventInput>): Promise<CalEvent> {
    const { data } = await this.cal().events.patch({ calendarId, eventId: id, requestBody: this.body(e), sendUpdates: "none" });
    return this.toEvent(calendarId, data, await this.eventColors().catch(() => ({})), "#5b8def");
  }

  async remove(calendarId: string, id: string): Promise<void> {
    await this.cal().events.delete({ calendarId, eventId: id, sendUpdates: "none" });
  }

  async busy(o: { start: string; end: string; calendarIds?: string[] }) {
    const ids = o.calendarIds?.length ? o.calendarIds : ["primary"];
    const { data } = await this.cal().freebusy.query({ requestBody: { timeMin: o.start, timeMax: o.end, items: ids.map((id) => ({ id })) } });
    return Object.values(data.calendars ?? {}).flatMap((c) => (c.busy ?? []).map((b) => ({ start: b.start!, end: b.end! })));
  }
}

/** A calendar on disk with a few made-up events this week, so the tab works without Google. */
export class MockCalendar implements CalendarClient {
  readonly kind = "mock" as const;
  private file: string;
  constructor(stateDir: string) {
    this.file = path.join(stateDir, "mock-calendar.json");
  }
  connected() {
    return true;
  }
  private load(): CalEvent[] {
    if (existsSync(this.file)) return JSON.parse(readFileSync(this.file, "utf8"));
    const day = (offset: number, h: number, m = 0) => {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      d.setHours(h, m, 0, 0);
      return d.toISOString();
    };
    return [
      { id: "e1", calendarId: "primary", title: "Grow session (A.R.)", start: day(0, 10), end: day(0, 10, 50), allDay: false, location: "https://zoom.us/j/000000", color: "#7c79c4" },
      { id: "e2", calendarId: "primary", title: "Free consult: Priya Example", start: day(2, 12), end: day(2, 12, 30), allDay: false, location: "https://zoom.us/j/000001", color: "#4241a0" },
      { id: "e3", calendarId: "primary", title: "Music therapy group, Sunrise Recovery (example)", start: day(1, 15), end: day(1, 16, 30), allDay: false, location: "1600 Example St, Denver, CO 80202", color: "#e6ad55" },
      { id: "e4", calendarId: "team", title: "Team check-in with Kristin and Frankie", start: day(0, 13), end: day(0, 13, 30), allDay: false, color: "#6fc394" },
    ];
  }
  private save(e: CalEvent[]) {
    mkdirSync(path.dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(e, null, 2));
  }
  async calendars() {
    return [
      { id: "primary", name: "Marlys Woods", color: "#4241a0", primary: true, writable: true },
      { id: "team", name: "Get In Tune team (test)", color: "#6fc394", primary: false, writable: true },
    ];
  }
  async events(o: { start: string; end: string; calendarIds?: string[]; q?: string }) {
    return this.load().filter((e) => e.end > o.start && e.start < o.end && (!o.calendarIds?.length || o.calendarIds.includes(e.calendarId)) && (!o.q || e.title.toLowerCase().includes(o.q.toLowerCase())));
  }
  async create(e: EventInput) {
    const ev: CalEvent = { id: `e${Date.now().toString(36)}`, calendarId: e.calendarId || "primary", title: e.title, start: e.start, end: e.end, allDay: !!e.allDay, location: e.location, description: e.description, color: "#7aa7ff" };
    this.save([...this.load(), ev]);
    return ev;
  }
  async update(calendarId: string, id: string, e: Partial<EventInput>) {
    const all = this.load();
    const ev = all.find((x) => x.id === id && x.calendarId === calendarId);
    if (!ev) throw new Error("No such event");
    Object.assign(ev, Object.fromEntries(Object.entries({ title: e.title, start: e.start, end: e.end, allDay: e.allDay, location: e.location, description: e.description }).filter(([, v]) => v !== undefined)));
    this.save(all);
    return ev;
  }
  async remove(calendarId: string, id: string) {
    this.save(this.load().filter((x) => !(x.id === id && x.calendarId === calendarId)));
  }
  async busy(o: { start: string; end: string }) {
    return (await this.events(o)).filter((e) => !e.allDay).map((e) => ({ start: e.start, end: e.end }));
  }
}

export function makeCalendar(cfg: Config): CalendarClient {
  if (cfg.gmail.driver !== "google" && cfg.mode !== "live") return new MockCalendar(cfg.stateDir);
  // On her Mac (live) it's always her real calendar, which says "not connected" until she runs Connect Gmail:
  // practice events would look real on her dashboard. With Outlook connected, her Outlook calendar shows too.
  const google = new GoogleCalendar(new GoogleAuth({ clientId: cfg.gmail.clientId, clientSecret: cfg.gmail.clientSecret, tokenFile: cfg.gmail.tokenFile, address: cfg.gmail.address }));
  if (cfg.outlook.driver !== "microsoft") return google;
  const o = cfg.outlook;
  return new CombinedCalendar(google, new OutlookCalendar(new GraphMail({ clientId: o.clientId, tenant: o.tenant, tokenFile: o.tokenFile, mailboxes: o.mailboxes })));
}

/** Open slots of at least `minutes` between `dayStart` and `dayEnd` hours (local), on the days in range. */
export function freeSlots(busy: { start: string; end: string }[], o: { from: Date; days: number; minutes: number; dayStart?: number; dayEnd?: number }) {
  const out: { start: string; end: string }[] = [];
  const blocks = busy.map((b) => [Date.parse(b.start), Date.parse(b.end)] as const).sort((a, b) => a[0] - b[0]);
  for (let d = 0; d < o.days; d++) {
    const day = new Date(o.from);
    day.setDate(day.getDate() + d);
    if ([0, 6].includes(day.getDay())) continue; // weekdays
    const start = new Date(day);
    start.setHours(o.dayStart ?? 7, 0, 0, 0);
    const end = new Date(day);
    end.setHours(o.dayEnd ?? 17, 0, 0, 0);
    let t = Math.max(start.getTime(), d === 0 ? o.from.getTime() : 0); // not before "from" (callers pass now)
    for (const [bs, be] of blocks) {
      if (be <= t || bs >= end.getTime()) continue;
      if (bs - t >= o.minutes * 60000) out.push({ start: new Date(t).toISOString(), end: new Date(bs).toISOString() });
      t = Math.max(t, be);
    }
    if (end.getTime() - t >= o.minutes * 60000) out.push({ start: new Date(t).toISOString(), end: end.toISOString() });
  }
  return out;
}

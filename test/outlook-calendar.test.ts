import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MockCalendar } from "../src/connectors/calendar/index.js";
import { GraphMail } from "../src/connectors/outlook/index.js";
import { CombinedCalendar, OutlookCalendar } from "../src/connectors/outlook/calendar.js";
import { planPrompt } from "../src/workflows/handoff.js";
import { testHub } from "./helpers.js";

function fakeGraph(events: any[]) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "oc-"));
  const tokenFile = path.join(dir, "t.json");
  writeFileSync(tokenFile, JSON.stringify({ access_token: "a", refresh_token: "r", expires_at: Date.now() + 3600e3 }));
  const urls: string[] = [];
  const fake = (async (url: string) => {
    urls.push(url);
    if (url.includes("/me/calendars?")) return new Response(JSON.stringify({ value: [{ id: "c1", name: "Calendar", hexColor: "#123456", isDefaultCalendar: true }] }));
    return new Response(JSON.stringify({ value: events }));
  }) as typeof fetch;
  return { g: new GraphMail({ clientId: "x", tenant: "t", tokenFile, mailboxes: [] }, fake), urls };
}

describe("her Outlook calendar (read-only)", () => {
  it("reads events in UTC and marks client sessions private", async () => {
    const { g, urls } = fakeGraph([
      { id: "e1", subject: "Session with Jordan Rivera", start: { dateTime: "2026-11-10T17:00:00.0000000" }, end: { dateTime: "2026-11-10T17:50:00.0000000" }, organizer: { emailAddress: { address: "noreply@growtherapy.com" } }, webLink: "https://outlook/e1" },
      { id: "e2", subject: "Coffee with Kris", start: { dateTime: "2026-11-10T20:00:00.0000000" }, end: { dateTime: "2026-11-10T21:00:00.0000000" }, location: { displayName: "Corner cafe" } },
    ]);
    const cal = new OutlookCalendar(g);
    const ev = await cal.events({ start: "2026-11-10T00:00:00Z", end: "2026-11-11T00:00:00Z" });
    expect(ev.map((e) => [e.title, e.start, e.private, e.calendarId])).toEqual([
      ["Session with Jordan Rivera", "2026-11-10T17:00:00.000Z", true, "outlook:c1"],
      ["Coffee with Kris", "2026-11-10T20:00:00.000Z", false, "outlook:c1"],
    ]);
    expect(urls.some((u) => u.includes("/me/calendars/c1/calendarView"))).toBe(true);
    await expect(cal.create({ title: "x", start: "", end: "" })).rejects.toThrow(/read-only/);
  });

  it("shows Outlook next to the other calendar, and new events go to the writable one", async () => {
    const { g } = fakeGraph([{ id: "e1", subject: "Grow session", start: { dateTime: "2031-11-10T17:00:00" }, end: { dateTime: "2031-11-10T18:00:00" } }]);
    const google = new MockCalendar(mkdtempSync(path.join(os.tmpdir(), "gc-")));
    const both = new CombinedCalendar(google, new OutlookCalendar(g));
    const made = await both.create({ title: "Consult", start: "2031-11-10T19:00:00.000Z", end: "2031-11-10T19:30:00.000Z" });
    expect(made.calendarId).toBe("primary");
    const ev = await both.events({ start: "2031-11-10T00:00:00Z", end: "2031-11-11T00:00:00Z" });
    expect(ev.map((e) => e.title)).toEqual(["Grow session", "Consult"]);
    expect((await both.calendars()).some((c) => c.id === "outlook:c1" && !c.writable)).toBe(true);
    await expect(both.update("outlook:c1", "e1", { title: "x" })).rejects.toThrow(/read-only/);
  });

  it("never puts a private client session into the Plan my day request", async () => {
    const { hub } = testHub();
    const day0 = new Date();
    day0.setHours(12, 0, 0, 0);
    hub.calendar.events = async () => [{ id: "s", calendarId: "outlook:c1", title: "Session with Jordan Rivera", start: day0.toISOString(), end: day0.toISOString(), allDay: false, private: true, source: "outlook" }];
    const p = await planPrompt(hub);
    expect(p).toContain("Client session (details private)");
    expect(p).not.toContain("Jordan");
  });
});

import { looksLikeClientSession } from "../src/connectors/outlook/calendar.js";

describe("which calendar events are client sessions", () => {
  const me = "marlys@getintunemusictherapy.com Marlys Woods (Get In Tune Music Therapy)";
  it("doesn't count her own business name as a client sign", () => {
    expect(looksLikeClientSession({ subject: "Team check-in with Kristin and Frankie", organizer: me })).toBe(false);
    expect(looksLikeClientSession({ subject: "Coffee with Kris", location: "Corner cafe", organizer: me })).toBe(false);
    expect(looksLikeClientSession({ subject: "Get In Tune Music Therapy: workshop prep", organizer: me })).toBe(false);
    expect(looksLikeClientSession({ subject: "Group supervision", location: "https://zoom.us/j/1", organizer: me })).toBe(false);
  });
  it("still catches Grow sessions and client appointments", () => {
    expect(looksLikeClientSession({ subject: "Session", organizer: "noreply@growtherapy.com Grow Therapy" })).toBe(true);
    expect(looksLikeClientSession({ subject: "Grow: J.R.", organizer: me })).toBe(true);
    expect(looksLikeClientSession({ subject: "Session with Jordan R.", organizer: me })).toBe(true);
    expect(looksLikeClientSession({ subject: "Intake call", organizer: me })).toBe(true);
    expect(looksLikeClientSession({ subject: "Telehealth appointment", organizer: me })).toBe(true);
  });
});

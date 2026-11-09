import { describe, expect, it } from "vitest";
import type { CalEvent } from "../src/connectors/calendar/index.js";
import { routable, SPARE_MINUTES, travelFor } from "../src/workflows/travel.js";
import { MockTravel } from "../src/connectors/travel/index.js";
import { testHub } from "./helpers.js";

const ev = (id: string, start: string, end: string, location?: string): CalEvent => ({ id, calendarId: "primary", title: id, start, end, allDay: false, location });

describe("drive times for calendar events", () => {
  it("times in-person appointments, chaining straight from one to the next", async () => {
    const { hub } = testHub();
    hub.cfg.travel.start = "100 Home St, Denver, CO";
    const legs = await travelFor(hub, [
      ev("Sunrise Recovery group", "2026-11-09T09:00:00-07:00", "2026-11-09T10:00:00-07:00", "1071 Acapulco Ct, Colorado Springs, CO 80910"),
      ev("zoom", "2026-11-09T10:30:00-07:00", "2026-11-09T11:00:00-07:00", "https://zoom.us/j/123"),
      ev("next", "2026-11-09T10:20:00-07:00", "2026-11-09T11:00:00-07:00", "123 Main Street, Denver, CO"),
      { ...ev("team", "2026-11-09T12:00:00-07:00", "2026-11-09T13:00:00-07:00", "1071 Acapulco Ct, Colorado Springs, CO"), calendarId: "team" },
    ], { calendars: new Set(["primary"]) });
    expect(Object.keys(legs).sort()).toEqual(["Sunrise Recovery group", "next"]);
    const calls = (hub.travel as MockTravel).calls;
    expect(calls[0]).toEqual({ from: "100 Home St, Denver, CO", to: "1071 Acapulco Ct, Colorado Springs, CO 80910" });
    expect(calls[1].from).toBe("1071 Acapulco Ct, Colorado Springs, CO 80910");
    const first = legs["Sunrise Recovery group"];
    expect(first.fromLabel).toBe("home");
    expect(legs.next.fromLabel).toBe("Sunrise Recovery group");
    const leave = new Date("2026-11-09T09:00:00-07:00").getTime() - (first.minutes + SPARE_MINUTES) * 60_000;
    expect(first.leaveBy).toBe(new Date(leave).toISOString());
    expect(legs.next.late).toBeGreaterThan(0); // 20 minutes between them isn't enough
    expect(legs.next.mapsUrl).toContain("google.com/maps/dir");
  });

  it("starts each day from home again", async () => {
    const { hub } = testHub();
    hub.cfg.travel.start = "100 Home St, Denver, CO";
    const legs = await travelFor(hub, [
      ev("mon", "2026-11-09T09:00:00-07:00", "2026-11-09T10:00:00-07:00", "1071 Acapulco Ct, Colorado Springs, CO"),
      ev("tue", "2026-11-10T09:00:00-07:00", "2026-11-10T10:00:00-07:00", "123 Main St, Denver, CO"),
    ]);
    expect(legs.tue.fromLabel).toBe("home");
  });

  it("knows Denver's weekday rush hours", async () => {
    const { isRushHour } = await import("../src/connectors/travel/index.js");
    expect(isRushHour(new Date("2026-11-09T07:30:00-07:00"))).toBe(true); // Mon 7:30 AM
    expect(isRushHour(new Date("2026-11-09T11:00:00-07:00"))).toBe(false);
    expect(isRushHour(new Date("2026-11-09T17:15:00-07:00"))).toBe(true);
    expect(isRushHour(new Date("2026-11-07T07:30:00-07:00"))).toBe(false); // Saturday
  });

  it("only routes real places", () => {
    expect(routable("123 Main St, Denver, CO")).toBe(true);
    expect(routable("https://meet.google.com/abc")).toBe(false);
    expect(routable("Phone")).toBe(false);
    expect(routable("")).toBe(false);
  });
});

describe("travel connectors", () => {
  it("uses OpenStreetMap without a key, padding for traffic", async () => {
    const { OsmTravel, RUSH_PAD, TRAFFIC_PAD } = await import("../src/connectors/travel/index.js");
    const { mkdtempSync } = await import("node:fs");
    const os = await import("node:os");
    const real = globalThis.fetch;
    globalThis.fetch = (async (url: string) =>
      new Response(String(url).includes("nominatim") ? JSON.stringify([{ lat: "39.7", lon: "-104.9" }]) : JSON.stringify({ code: "Ok", routes: [{ duration: 1200, distance: 16093 }] }), { status: 200 })) as any;
    try {
      const d = await new OsmTravel(mkdtempSync(`${os.tmpdir()}/trv-`)).drive("A St 1, Denver", "B St 2, Denver");
      expect(d).toEqual({ minutes: Math.round((1200 * TRAFFIC_PAD) / 60), miles: 10, rush: false });
      const rush = await new OsmTravel(mkdtempSync(`${os.tmpdir()}/trv-`)).drive("A St 1, Denver", "B St 2, Denver", new Date("2026-11-09T07:45:00-07:00"));
      expect(rush).toEqual({ minutes: Math.round((1200 * RUSH_PAD) / 60), miles: 10, rush: true });
    } finally {
      globalThis.fetch = real;
    }
  }, 10_000);
});

describe("addresses", () => {
  it("asks for an address without the suite when the full one isn't found", async () => {
    const { addressVariants } = await import("../src/connectors/travel/index.js");
    const v = addressVariants("169 Inverness Dr W Ste 120, Englewood, CO 80112");
    expect(v[1]).toBe("169 Inverness Dr W, Englewood, CO 80112");
    expect(v.at(-1)).toBe("Englewood, CO 80112");
  });

  it("says why an event got no drive time", async () => {
    const { hub } = testHub();
    const why: Record<string, string> = {};
    await travelFor(hub, [ev("visit", "2026-11-09T12:00:00-07:00", "2026-11-09T13:00:00-07:00", "4500 Lunch Pl, Denver, CO"), { ...ev("team", "2026-11-09T14:00:00-07:00", "2026-11-09T15:00:00-07:00", "1 Main St, Denver, CO"), calendarId: "team" }], { calendars: new Set(["primary"]), why });
    expect(why.visit).toMatch(/HUB_DAY_START_ADDRESS/);
    expect(why.team).toMatch(/shared calendar/);
  });
});

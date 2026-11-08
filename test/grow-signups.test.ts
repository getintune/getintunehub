import { describe, expect, it } from "vitest";
import { clientInitials, dismissGrow, growAlerts, growKind } from "../src/workflows/grow.js";
import { acceptSignup, dismissSignup, eventFromSubject, parseSignup, signupSuggestions } from "../src/workflows/signups.js";
import { testHub } from "./helpers.js";

const grow = (subject: string, preview = "") => ({ from: { name: "Grow Therapy", address: "notifications@growtherapy.com" }, subject, preview });

describe("Grow Therapy alerts (only the four kinds she asked for)", () => {
  it("sorts Grow email into new client, schedule change, new message and to-dos, and ignores the rest", () => {
    expect(growKind(grow("You have a new client"))).toBe("new-client");
    expect(growKind(grow("Appointment rescheduled"))).toBe("schedule");
    expect(growKind(grow("You have a new message"))).toBe("message");
    expect(growKind(grow("Action required: re-credentialing with Aetna"))).toBe("action");
    expect(growKind(grow("November provider newsletter"))).toBeNull();
    expect(growKind({ from: { name: "Kristin", address: "kristin@example.com" }, subject: "new client?", preview: "" })).toBeNull();
  });

  it("keeps initials only, never a full name", () => {
    expect(clientInitials("matched with a new client, Jordan Rivera. Their first session")).toBe("J.R.");
    expect(clientInitials("A.R. has rescheduled their session")).toBe("A.R.");
    expect(clientInitials("You have a new secure message")).toBeUndefined();
  });

  it("shows practice alerts with no subject, preview or name kept, and can dismiss them", async () => {
    const { hub } = testHub();
    const a = await growAlerts(hub);
    expect(a.map((x) => x.title)).toEqual(["New client: J.R.", "Session time changed: A.R.", "New message in Grow", "Grow needs you to do something"]);
    expect(JSON.stringify(a)).not.toMatch(/Jordan|Rivera|Aetna|subject|preview/);
    dismissGrow(hub, a[0].id);
    expect((await growAlerts(hub)).length).toBe(3);
  });
});

describe("workshop sign-ups from Wix and Eventbrite emails", () => {
  it("reads the name and email from the registration email", () => {
    expect(parseSignup("You have a new order!\nAttendee: Nora Example\nEmail: nora@example.com")).toEqual({ name: "Nora Example", email: "nora@example.com" });
    expect(parseSignup("Felix Madeup just registered for Suddenly Untethered. felix@example.com")).toEqual({ name: "Felix Madeup", email: "felix@example.com" });
    expect(parseSignup("no emails here")).toBeNull();
    expect(eventFromSubject("New Order for Suddenly Untethered: The Surprising Growing Pains of Living Your Dream")).toBe("Suddenly Untethered");
    expect(eventFromSubject("New registration: Suddenly Untethered")).toBe("Suddenly Untethered");
  });

  it("suggests new sign-ups (not people already on the list), and adds one when she clicks Add", async () => {
    const { hub } = testHub();
    const s = await signupSuggestions(hub);
    expect(s.map((x) => [x.name, x.email, x.source, x.event])).toEqual([
      ["Nora Example", "nora@example.com", "Eventbrite", "Suddenly Untethered (Nov 13)"],
      ["Felix Madeup", "felix@example.com", "Website (Wix)", "Suddenly Untethered (Nov 13)"],
    ]); // Maya is already on the list
    const e = acceptSignup(hub, s[0]);
    expect(e).toMatchObject({ program: "workshop", name: "Nora Example", stage: "Signed up", extra: { source: "Eventbrite" } });
    dismissSignup(hub, s[1].messageId);
    expect(await signupSuggestions(hub)).toEqual([]);
    expect(hub.lists.list("workshop")).toHaveLength(5);
  });

  it("names the workshop from the email when the list is still empty", async () => {
    const { hub } = testHub();
    for (const e of hub.lists.list("workshop")) hub.lists.remove(e.id);
    const s = await signupSuggestions(hub);
    expect(s.map((x) => x.event)).toEqual(["Suddenly Untethered", "Suddenly Untethered", "Suddenly Untethered"]);
  });
});

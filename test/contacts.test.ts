import { describe, expect, it } from "vitest";
import { allContacts, findContacts, flushContacts, noteMessages, signaturePhones } from "../src/workflows/contacts.js";
import { testHub } from "./helpers.js";

const msg = (from: string, to: string[], body: string, cc: string[] = []) => ({ id: "m", from, to, cc, date: "2026-11-05T16:00:00Z", subject: "S", body, attachments: [] });

describe("contacts list", () => {
  it("logs everyone on an email, skipping her own addresses and no-reply senders", () => {
    const { hub } = testHub();
    noteMessages(hub, [msg("Alex Example <alex@example.com>", ["marlys@getintunemusictherapy.com", "getintunemusictherapy@gmail.com"], "Hi\n\nAlex Example\nCell: 303-555-0142", ["Doe, Jane <jane@example.com>"]), msg("Wix <no-reply@wix.com>", ["marlys@getintunemusictherapy.com"], "Receipt")]);
    const all = allContacts(hub);
    expect(all.map((p) => p.name).sort()).toEqual(["Alex Example", "Jane Doe"]);
    const alex = all.find((p) => p.name === "Alex Example")!;
    expect(alex.phones).toEqual([{ number: "(303) 555-0142", label: "mobile", from: "email" }]);
    expect(alex.emailCount).toBe(1);
  });

  it("shows which of her lists a person is on, and finds them by list", async () => {
    const { hub } = testHub();
    noteMessages(hub, [msg("Priya Example <Priya@example.com>", ["marlys@getintunemusictherapy.com"], "See you Thursday\n\nPriya\n+1 720 555 0101")]);
    const [p] = await findContacts(hub, "coaching");
    expect(p).toMatchObject({ name: "Priya Example", lists: [{ id: "c1", program: "coaching", list: "Coaching clients", stage: "Free consult booked" }] });
    expect(await findContacts(hub, "555-0101")).toHaveLength(1);
    expect(await findContacts(hub, "workshop")).toHaveLength(0);
    flushContacts(hub);
  });

  it("reads phone numbers out of a signature, not the quoted reply", () => {
    expect(signaturePhones("Thanks\n\nSam\nO: (720) 555-0199 | F: 720-555-0100\n\nOn Mon, Bob wrote:\n> call 303-555-9999").map((p) => p.number)).toEqual(["7205550199"]);
  });
});

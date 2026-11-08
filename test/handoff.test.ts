import { describe, expect, it } from "vitest";
import { askPrompt, personPrompt, planPrompt, replyPrompt } from "../src/workflows/handoff.js";
import { testHub } from "./helpers.js";

describe("Do this in Claude", () => {
  it("writes a plan-my-day request with her lists, sign-ups and calendar, and no therapy client names", async () => {
    const { hub } = testHub();
    const p = await planPrompt(hub);
    expect(p).toContain("I'm Marlys Woods (Get In Tune)");
    expect(p).toContain("Tom Sample (Coaching clients, Consult done): Send the coaching program details");
    expect(p).toContain("Suddenly Untethered (Nov 13): 4 so far");
    expect(p).toContain("Today's calendar:");
    expect(p).toContain("plus 1 therapy admin item");
    expect(p).not.toContain("K.L.");
    expect(p).toContain("- New client: J.R.");
    expect(p).not.toMatch(/Jordan|Rivera|Aetna/);
    expect(p).toMatch(/drafts only/);
  });

  it("writes a request about one person, but never a therapy client", () => {
    const { hub } = testHub();
    const p = personPrompt(hub, hub.lists.get("c2"));
    expect(p).toContain("Tom Sample <tom@example.com>");
    expect(p).toContain("wants to start in December");
    expect(() => personPrompt(hub, hub.lists.get("t1"))).toThrow(/Grow Therapy/);
  });

  it("writes a reply request without the quoted history", () => {
    const { hub } = testHub();
    const p = replyPrompt(hub, { subject: "Free consult", from: "Priya <priya@example.com>", date: "Nov 6", body: "Is Tuesday good?\n\nOn Mon, Marlys wrote:\n> old text" });
    expect(p).toContain("Is Tuesday good?");
    expect(p).not.toContain("old text");
    expect(askPrompt(hub, " How many sign-ups? ")).toContain("How many sign-ups?");
  });
});

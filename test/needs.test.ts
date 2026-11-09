import { describe, expect, it } from "vitest";
import { listCounts, needs } from "../src/workflows/needs.js";
import { testHub } from "./helpers.js";

describe("what needs her", () => {
  it("lists next steps due today or overdue first, then people waiting too long", () => {
    const { hub } = testHub();
    const n = needs(hub);
    // From the practice data: Tom's overdue next step, then today's (K.L., Sunrise), then nobody waiting too long yet.
    expect(n[0]).toMatchObject({ kind: "next", id: "c2", title: "Send the coaching program details", days: 1 });
    expect(n.filter((x) => x.kind === "next").map((x) => x.id).sort()).toEqual(["c2", "f1", "t3"]);
    expect(n.some((x) => x.id === "c1")).toBe(false); // consult is in 2 days: not yet
  });

  it("nudges about someone left at a stage, unless a next step is planned", () => {
    const { hub } = testHub();
    const e = hub.lists.add("coaching", { name: "New Person", email: "new@example.com" });
    const later = new Date(Date.now() + 3 * 864e5);
    expect(needs(hub, later).find((x) => x.id === e.id)).toMatchObject({ kind: "waiting", title: "Reply and offer a free consult" });
    hub.lists.update(e.id, { nextStep: "Call", nextDate: "2099-01-01" });
    expect(needs(hub, later).find((x) => x.id === e.id)).toBeUndefined();
  });

  it("counts workshop sign-ups by where they came from", () => {
    const { hub } = testHub();
    const c = listCounts(hub);
    expect(c.workshops[0]).toMatchObject({ event: "Suddenly Untethered (Nov 13)", total: 4 });
    expect(c.workshops[0].bySource[0]).toEqual({ source: "Website (Wix)", count: 2 });
    expect(c.workshops[0].newToday).toBeGreaterThanOrEqual(1);
    expect(c.lists.find((l) => l.id === "therapy")).toMatchObject({ total: 3, open: 3 });
  });
});

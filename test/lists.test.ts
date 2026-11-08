import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HUB_ROOT } from "../src/core/config.js";
import { LocalLists, MockLists, PROGRAMS, toInitials } from "../src/connectors/lists/index.js";

const tmp = () => mkdtempSync(path.join(os.tmpdir(), "lists-"));

describe("her lists", () => {
  it("has the six lists she asked for", () => {
    expect(PROGRAMS.map((p) => p.id)).toEqual(["therapy", "coaching", "workshop", "trainees", "supervision", "facilities"]);
    for (const p of PROGRAMS) for (const d of p.done) expect(p.stages).toContain(d);
  });

  it("adds, moves, notes and removes people, and keeps a backup", () => {
    const dir = tmp();
    const l = new LocalLists(dir);
    const a = l.add("coaching", { name: "Priya Example", email: "priya@example.com", extra: { location: "Lisbon", bogus: "x" } as any });
    expect(a.stage).toBe("Inquiry");
    expect(a.extra).toEqual({ location: "Lisbon" });
    const b = l.update(a.id, { stage: "Free consult booked", nextStep: "Consult", nextDate: "2026-11-12" });
    expect(b.stage).toBe("Free consult booked");
    expect(b.stageSince >= a.stageSince).toBe(true);
    expect(() => l.update(a.id, { stage: "Nope" })).toThrow(/isn't a stage/);
    l.addNote(a.id, "Wants to start in December");
    expect(l.find("december").map((e) => e.id)).toEqual([a.id]);
    expect(l.find("lisbon", "workshop")).toEqual([]);
    expect(existsSync(path.join(dir, "lists.backup.json"))).toBe(true);
    l.remove(a.id);
    expect(l.list()).toEqual([]);
  });

  it("keeps only initials for therapy clients, never email or phone (HIPAA)", () => {
    const l = new LocalLists(tmp());
    const e = l.add("therapy", { name: "Jane Quinn Doe", email: "jane@example.com", phone: "555-1234" });
    expect(e).toMatchObject({ name: "J.Q.D.", email: "", phone: "" });
    expect(l.update(e.id, { name: "k l", email: "x@y.z" })).toMatchObject({ name: "K.L.", email: "" });
    expect(toInitials("A.R.")).toBe("A.R.");
  });

  it("starts practice mode with made-up people that look current", () => {
    const state = tmp();
    const l = new MockLists(state, path.join(HUB_ROOT, "fixtures", "lists.json"));
    expect(l.kind).toBe("mock");
    expect(l.list("workshop")).toHaveLength(4);
    expect(l.list("therapy").every((e) => /^([A-Z]\.)+$/.test(e.name) && !e.email)).toBe(true);
    expect(Date.parse(l.get("w4").createdAt)).toBeGreaterThan(Date.now() - 864e5);
    // Saved in the mock folder, not her data folder.
    expect(JSON.parse(readFileSync(path.join(state, "mock-lists", "lists.json"), "utf8")).entries.length).toBeGreaterThan(5);
  });
});

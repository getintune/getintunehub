import { describe, expect, it } from "vitest";
import { costSummary, featureOn, featureSettings, recordCost, setFeature } from "../src/agent/costs.js";
import { enabled as summariesOn } from "../src/agent/mailSummary.js";
import { MockGemini } from "../src/connectors/gemini/index.js";
import { testHub } from "./helpers.js";

describe("agent use (Gemini free tier)", () => {
  it("keeps every background feature off until there's a Gemini key, and off to start even then", () => {
    const { hub } = testHub();
    expect(hub.cfg.geminiApiKey).toBe("");
    expect(featureOn(hub, "summaries")).toBe(false);
    hub.gemini = new MockGemini();
    expect(featureSettings(hub)).toEqual({ summaries: false, emailTasks: false, morningBrief: false });
    expect(summariesOn(hub)).toBe(false);
    setFeature(hub, "summaries", true);
    setFeature(hub, "morningBrief", true);
    expect(featureOn(hub, "summaries")).toBe(true);
    expect(summariesOn(hub)).toBe(true);
    expect(featureOn(hub, "morningBrief")).toBe(true);
    expect(() => setFeature(hub, "nope" as any, true)).toThrow();
  });

  it("counts runs and text today and this month, at $0.00 on the free tier", () => {
    const { hub } = testHub();
    const now = new Date("2026-11-20T18:00:00Z");
    recordCost(hub, "summaries", { tokens: { input: 900, output: 40 } }, "flash-lite", now);
    recordCost(hub, "brief", { tokens: { input: 5000, output: 600 } }, "flash", now);
    recordCost(hub, "ask", { tokens: { input: 2000, output: 300 } }, "flash", new Date("2026-11-03T18:00:00Z"));
    recordCost(hub, "ask", { tokens: { input: 1, output: 1 } }, "flash", new Date("2026-10-30T18:00:00Z")); // last month
    recordCost(hub, "ask", {}, "flash", now); // nothing used: not recorded
    const c = costSummary(hub, now);
    expect(c).toMatchObject({ today: 0, month: 0, runs: 3, runsToday: 2, tokens: 8840, provider: "Google Gemini (free tier)" });
    expect(c.byUse.map((x) => x.label)).toEqual(["Ask", "Daily brief", "Email summaries"]);
  });

  it("uses the lighter model for routine work and the main one only for Ask and the brief", async () => {
    const { readFileSync } = await import("node:fs");
    const src = (f: string) => readFileSync(new URL(`../src/agent/${f}`, import.meta.url), "utf8");
    expect(src("mailSummary.ts")).toContain("model: hub.cfg.fastModel");
    expect(src("emailTasks.ts")).toContain("model: hub.cfg.fastModel");
    expect(src("emailTasks.ts")).not.toContain("model: hub.cfg.model");
    expect(src("run.ts")).toContain("model: hub.cfg.model");
  });
});

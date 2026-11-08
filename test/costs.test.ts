import { describe, expect, it } from "vitest";
import { costSummary, featureOn, featureSettings, recordCost, setFeature } from "../src/agent/costs.js";
import { enabled as summariesOn } from "../src/agent/mailSummary.js";
import { testHub } from "./helpers.js";

describe("Claude costs", () => {
  it("keeps every background feature off until there's an API key", () => {
    const { hub } = testHub();
    expect(hub.cfg.anthropicApiKey).toBe("");
    expect(featureOn(hub, "summaries")).toBe(false);
    expect(featureOn(hub, "morningBrief")).toBe(false);
    hub.cfg.anthropicApiKey = "sk-ant-test";
    expect(featureOn(hub, "summaries")).toBe(true);
    expect(summariesOn(hub)).toBe(true);
  });

  it("has a switch for each background feature, with tasks-from-email off to start", () => {
    const { hub } = testHub();
    hub.cfg.anthropicApiKey = "sk-ant-test";
    expect(featureSettings(hub)).toEqual({ summaries: true, emailTasks: false, morningBrief: true });
    setFeature(hub, "summaries", false);
    setFeature(hub, "emailTasks", true);
    expect(featureOn(hub, "summaries")).toBe(false);
    expect(featureOn(hub, "emailTasks")).toBe(true);
    expect(() => setFeature(hub, "nope" as any, true)).toThrow();
  });

  it("adds up what Claude cost today and this month, by what it was for", () => {
    const { hub } = testHub();
    const now = new Date("2026-11-20T18:00:00Z");
    recordCost(hub, "summaries", { total_cost_usd: 0.002 }, "fast", now);
    recordCost(hub, "brief", { total_cost_usd: 0.12 }, "big", now);
    recordCost(hub, "ask", { total_cost_usd: 0.05 }, "big", new Date("2026-11-03T18:00:00Z"));
    recordCost(hub, "ask", { total_cost_usd: 9 }, "big", new Date("2026-10-30T18:00:00Z")); // last month
    recordCost(hub, "ask", { subtype: "error" }, "big", now); // no cost reported: not recorded
    const c = costSummary(hub, now);
    expect(c.today).toBeCloseTo(0.122);
    expect(c.month).toBeCloseTo(0.172);
    expect(c.runs).toBe(3);
    expect(c.byUse.map((x) => x.label)).toEqual(["Ask Claude", "Daily brief", "Email summaries"]);
  });

  it("uses the fast model for routine work and the bigger one only for Ask and the brief", async () => {
    const { readFileSync } = await import("node:fs");
    const src = (f: string) => readFileSync(new URL(`../src/agent/${f}`, import.meta.url), "utf8");
    expect(src("mailSummary.ts")).toContain("model: hub.cfg.fastModel");
    expect(src("emailTasks.ts")).toContain("model: hub.cfg.fastModel");
    expect(src("emailTasks.ts")).not.toContain("model: hub.cfg.model");
  });
});

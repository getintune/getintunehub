import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/core/config.js";
import { makeHub } from "../src/hub.js";
import { describeModel, modelChoices, pickChoices, setModel } from "../src/agent/models.js";

describe("Gemini model menu", () => {
  it("offers flash, flash-lite and pro models, newest first, and keeps the current one", () => {
    const c = pickChoices(["models/gemini-2.5-flash", "models/gemini-3.5-flash-lite", "models/gemini-3.5-flash", "models/text-embedding-004", "models/gemini-3.5-flash-preview-tts"], "gemini-3-pro");
    expect(c.map((x) => x.id)).toEqual(["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3-pro", "gemini-2.5-flash"]);
    expect(describeModel("gemini-3.5-flash-lite")).toMatch(/Gemini 3.5 Flash-Lite/);
  });

  it("lists what Google offers and switches the model right away, saving it", async () => {
    const hub = makeHub(loadConfig({ HUB_MODE: "mock" }, "/tmp/hub-models"));
    expect((await modelChoices(hub)).map((x) => x.id)).toContain("gemini-3.5-pro");
    const saved: Record<string, string>[] = [];
    expect(await setModel(hub, "gemini-2.5-flash", (v) => saved.push(v))).toBe("gemini-2.5-flash");
    expect(hub.cfg.model).toBe("gemini-2.5-flash");
    expect(saved).toEqual([{ HUB_MODEL: "gemini-2.5-flash" }]);
  });

  it("refuses anything that isn't a Gemini model name", async () => {
    const hub = makeHub(loadConfig({ HUB_MODE: "mock" }, "/tmp/hub-models"));
    for (const bad of ["claude-opus-5-5", "gemini-x\nGEMINI_API_KEY=y", ""]) await expect(setModel(hub, bad, () => {})).rejects.toThrow(/Gemini model/);
    expect(hub.cfg.model).toBe("gemini-3.5-flash");
  });
});

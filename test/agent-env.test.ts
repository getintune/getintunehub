import { afterEach, describe, expect, it } from "vitest";
import { agentEndpoint, geminiKey } from "../src/agent/env.js";
import { loadConfig } from "../src/core/config.js";
import { makeGemini } from "../src/connectors/gemini/index.js";
import { testHub } from "./helpers.js";

const keep = { ...process.env };
afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in keep)) delete process.env[k];
  Object.assign(process.env, keep);
});

describe("where the app's agent requests go (Gemini)", () => {
  it("uses GEMINI_API_KEY from .env, and Google's Gemini API", () => {
    delete process.env.HUB_GEMINI_BASE_URL;
    const cfg = loadConfig({ HUB_MODE: "mock", GEMINI_API_KEY: "AIza-test", ANTHROPIC_API_KEY: "sk-ant-ignored" }, "/tmp/hub-agent");
    expect(cfg.geminiApiKey).toBe("AIza-test");
    expect(cfg.model).toBe("gemini-3.5-flash");
    expect(makeGemini(cfg).connected()).toBe(true);
    expect(agentEndpoint()).toBe("https://generativelanguage.googleapis.com");
    const { hub } = testHub();
    hub.cfg.geminiApiKey = "AIza-x";
    expect(geminiKey(hub)).toBe("AIza-x");
  });

  it("is off without a key (the Claude buttons hand off instead), and an endpoint is used only when .env asks", () => {
    const cfg = loadConfig({ HUB_MODE: "mock" }, "/tmp/hub-agent");
    expect(cfg.geminiApiKey).toBe("");
    expect(makeGemini(cfg).connected()).toBe(false);
    process.env.HUB_GEMINI_BASE_URL = "https://my-proxy.example";
    expect(agentEndpoint()).toBe("https://my-proxy.example");
  });
});

describe("an older .env from before the switch", () => {
  it("ignores Claude model names and uses Gemini's", () => {
    const cfg = loadConfig({ HUB_MODE: "mock", HUB_MODEL: "claude-opus-5-5", HUB_FAST_MODEL: "claude-haiku-5-5" }, "/tmp/hub-agent");
    expect(cfg.model).toBe("gemini-3.5-flash");
    expect(cfg.fastModel).toBe("gemini-3.5-flash-lite");
    expect(loadConfig({ HUB_MODE: "mock", HUB_MODEL: "gemini-2.5-pro" }, "/tmp/hub-agent").model).toBe("gemini-2.5-pro");
  });
});

import { LiveGemini, replacementModel } from "../src/connectors/gemini/index.js";

describe("when Google retires a model", () => {
  it("uses the replacement Google names, else the newest of the same kind", () => {
    const err = 'models/gemini-2.5-flash-lite is no longer available to new users. Please update your code to use models/gemini-3.5-flash-lite for the latest features';
    expect(replacementModel("gemini-2.5-flash-lite", err, [])).toBe("gemini-3.5-flash-lite");
    const listed = ["models/gemini-3.0-flash", "models/gemini-3.5-flash", "models/gemini-3.5-flash-lite", "models/gemini-3.5-pro", "models/embedding-001"];
    expect(replacementModel("gemini-2.5-flash", "404 NOT_FOUND", listed)).toBe("gemini-3.5-flash");
    expect(replacementModel("gemini-2.5-flash-lite", "404 NOT_FOUND", listed)).toBe("gemini-3.5-flash-lite");
    expect(replacementModel("gemini-2.5-flash", "404", [])).toBeNull();
  });

  it("switches to it on its own and keeps going", async () => {
    const asked: string[] = [];
    const sdk = {
      models: {
        async generateContent(p: any) {
          asked.push(p.model);
          if (p.model === "gemini-2.5-flash-lite") throw new Error('{"error":{"code":404,"message":"This model models/gemini-2.5-flash-lite is no longer available to new users. Please update your code to use models/gemini-3.5-flash-lite","status":"NOT_FOUND"}}');
          return { text: "ready", candidates: [{ content: { role: "model", parts: [{ text: "ready" }] } }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 1 } };
        },
        async list() {
          return (async function* () {})();
        },
      },
    };
    const g = new LiveGemini("key", "", sdk);
    const r = await g.generate({ model: "gemini-2.5-flash-lite", system: "x", contents: [{ role: "user", parts: [{ text: "hi" }] }] });
    expect(r).toMatchObject({ text: "ready", model: "gemini-3.5-flash-lite" });
    await g.generate({ model: "gemini-2.5-flash-lite", system: "x", contents: [{ role: "user", parts: [{ text: "hi" }] }] });
    expect(asked).toEqual(["gemini-2.5-flash-lite", "gemini-3.5-flash-lite", "gemini-3.5-flash-lite"]); // remembered
  });
});

import { GeminiLimitError, quotaInfo } from "../src/connectors/gemini/index.js";

describe("Gemini's free limits", () => {
  const perMinute = '{"error":{"code":429,"message":"You exceeded your current quota","status":"RESOURCE_EXHAUSTED","details":[{"violations":[{"quotaId":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier"}]},{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"27s"}]}}';
  const perDay = '{"error":{"code":429,"message":"You exceeded your current quota","status":"RESOURCE_EXHAUSTED","details":[{"violations":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]}]}}';

  it("tells the per-minute limit from the daily one, and reads how long to wait", () => {
    expect(quotaInfo(perMinute)).toEqual({ daily: false, retrySeconds: 27 });
    expect(quotaInfo(perDay).daily).toBe(true);
  });

  it("waits out the per-minute limit and carries on; stops with a clear message on the daily one", async () => {
    const waited: number[] = [];
    let calls = 0;
    const ok = { text: "done", candidates: [{ content: { role: "model", parts: [{ text: "done" }] } }] };
    const sdk = (fail: string, times: number) => ({ models: { async generateContent() { calls++; if (calls <= times) throw new Error(fail); return ok; }, async list() { return (async function* () {})(); } } });
    const req = { model: "m", system: "s", contents: [{ role: "user" as const, parts: [{ text: "hi" }] }], onWait: (s: number) => waited.push(s) };
    const g = new LiveGemini("k", "", sdk(perMinute, 2), async () => {});
    expect((await g.generate(req)).text).toBe("done");
    expect(waited).toEqual([27, 27]);
    calls = 0;
    const d = new LiveGemini("k", "", sdk(perDay, 1), async () => {});
    const err = await d.generate(req).catch((e) => e);
    expect(err).toBeInstanceOf(GeminiLimitError);
    expect(err.daily).toBe(true);
    expect(err.message).toMatch(/Plan my day in Claude/);
  });
});

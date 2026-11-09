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
    expect(cfg.model).toBe("gemini-2.5-flash");
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
    expect(cfg.model).toBe("gemini-2.5-flash");
    expect(cfg.fastModel).toBe("gemini-2.5-flash-lite");
    expect(loadConfig({ HUB_MODE: "mock", HUB_MODEL: "gemini-2.5-pro" }, "/tmp/hub-agent").model).toBe("gemini-2.5-pro");
  });
});

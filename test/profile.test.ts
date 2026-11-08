import { describe, expect, it } from "vitest";
import { loadConfig, TIME_ZONE } from "../src/core/config.js";

describe("profile settings", () => {
  it("defaults to Marlys and Get In Tune on Mountain Time", () => {
    const c = loadConfig({ HUB_MODE: "mock" }, "/tmp/hub-profile");
    expect(c.profile).toMatchObject({ owner: "Marlys Woods", first: "Marlys", business: "Get In Tune", appName: "Get In Tune Hub", timeZone: "America/Denver" });
    expect(TIME_ZONE).toBe("America/Denver");
  });

  it("takes everything from .env, and ignores a time zone that doesn't exist", () => {
    const c = loadConfig({ HUB_MODE: "mock", HUB_OWNER_NAME: "Sam Lee", HUB_BUSINESS_NAME: "Studio", HUB_APP_NAME: "Studio Hub", HUB_TIME_ZONE: "America/New_York", HUB_OWNER_EMAIL: "sam@example.com" }, "/tmp/hub-profile");
    expect(c.profile).toMatchObject({ owner: "Sam Lee", first: "Sam", business: "Studio", appName: "Studio Hub", email: "sam@example.com", timeZone: "America/New_York" });
    expect(TIME_ZONE).toBe("America/New_York");
    expect(loadConfig({ HUB_MODE: "mock", HUB_TIME_ZONE: "Mars/Olympus" }, "/tmp/hub-profile").profile.timeZone).toBe("America/Denver");
    expect(TIME_ZONE).toBe("America/Denver");
  });
});

import { renderPage } from "../src/server/page.js";
import { systemPrompt } from "../src/agent/run.js";
import { DEFAULT_PROFILE } from "../src/core/config.js";
import { testHub } from "./helpers.js";

describe("her name in the app", () => {
  it("fills the page's placeholders, escaped", () => {
    const html = renderPage("<title>{{APP_NAME}}</title><b>{{INITIAL}}</b><i>{{OWNER}}</i>{{UNKNOWN}}", { ...DEFAULT_PROFILE, owner: "A <b> & C" });
    expect(html).toBe("<title>Get In Tune Hub</title><b>M</b><i>A &lt;b&gt; &amp; C</i>{{UNKNOWN}}");
  });

  it("tells Claude who it works for, with no trace of Keystone or Hunter", () => {
    const { hub } = testHub();
    const p = systemPrompt(hub);
    expect(p).toContain("Marlys Woods's assistant inside Get In Tune Hub");
    expect(p).toContain("America/Denver");
    expect(p).not.toMatch(/Hunter|Keystone|Homebase|estimat/i);
    expect(p).toContain("Workshop sign-ups (workshop)");
    expect(p).toContain("initials only");
  });
});

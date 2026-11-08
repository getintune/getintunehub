import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HUB_ROOT, loadConfig } from "../src/core/config.js";
import { GraphMail, MockWorkMail } from "../src/connectors/outlook/index.js";

describe("work email (Outlook)", () => {
  it("reads marlys@ and info@ by default, from practice mail until connected", () => {
    const c = loadConfig({ HUB_MODE: "live" }, "/tmp/hub-outlook");
    expect(c.outlook).toMatchObject({ driver: "mock", tenant: "organizations", mailboxes: ["marlys@getintunemusictherapy.com", "info@getintunemusictherapy.com"] });
    expect(loadConfig({ HUB_MODE: "live", MS_CLIENT_ID: "abc" }, "/tmp/hub-outlook").outlook.driver).toBe("microsoft");
  });

  it("lists, searches and reads practice mail per mailbox", async () => {
    const boxes = ["marlys@getintunemusictherapy.com", "info@getintunemusictherapy.com"];
    const m = new MockWorkMail(path.join(HUB_ROOT, "fixtures", "outlook.json"), boxes);
    const info = await m.list({ mailbox: boxes[1] });
    expect(info[0].subject).toBe("You have a new client"); // newest first
    expect(info.every((x) => x.mailbox === boxes[1] && !("body" in x))).toBe(true);
    expect((await m.list({ mailbox: boxes[0] })).map((x) => x.id)).toEqual(["o10", "o11"]);
    expect((await m.list({ mailbox: boxes[1], q: "zoom" })).map((x) => x.id)).toEqual(["o9"]);
    expect((await m.get(boxes[1], "o9")).body).toContain("slides doc");
  });

  it("asks Microsoft Graph for one mailbox's inbox, read-only, refreshing the sign-in when needed", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ms-"));
    const tokenFile = path.join(dir, "t.json");
    writeFileSync(tokenFile, JSON.stringify({ access_token: "old", refresh_token: "r1", expires_at: 0 }));
    const calls: { url: string; body?: string; auth?: string }[] = [];
    const fake = (async (url: string, init?: any) => {
      calls.push({ url, body: init?.body?.toString(), auth: init?.headers?.Authorization });
      if (url.includes("/oauth2/v2.0/token")) return new Response(JSON.stringify({ access_token: "new", expires_in: 3600 }));
      return new Response(JSON.stringify({ value: [{ id: "m1", subject: "Hi", from: { emailAddress: { name: "Ann", address: "Ann@Example.com" } }, toRecipients: [], receivedDateTime: "2026-11-08T10:00:00Z", bodyPreview: "hello", isRead: false, webLink: "https://outlook/x" }] }));
    }) as typeof fetch;
    const g = new GraphMail({ clientId: "cid", tenant: "organizations", tokenFile, mailboxes: ["info@x.com"] }, fake);
    const list = await g.list({ mailbox: "info@x.com" });
    expect(list[0]).toMatchObject({ id: "m1", from: { name: "Ann", address: "ann@example.com" }, unread: true, webLink: "https://outlook/x" });
    expect(calls[0].body).toContain("grant_type=refresh_token");
    expect(calls[1].url).toContain("/users/info%40x.com/mailFolders/inbox/messages");
    expect(calls[1].auth).toBe("Bearer new");
    // The scopes only read mail: nothing that could send, move or delete.
    expect(calls[0].body).toContain("Mail.Read");
    expect(calls[0].body).not.toMatch(/Mail\.Send|Mail\.ReadWrite/);
  });
});

describe("on her Mac before connecting", () => {
  it("shows nothing made-up: Outlook, Motion and the calendar just say they're not connected", async () => {
    const { makeHub } = await import("../src/hub.js");
    const hub = makeHub(loadConfig({ HUB_MODE: "live" }, mkdtempSync(path.join(os.tmpdir(), "live-"))));
    expect(hub.outlook.connected()).toBe(false);
    await expect(hub.outlook.list({ mailbox: hub.outlook.mailboxes()[0] })).rejects.toThrow(/Connect Outlook/);
    expect(hub.motion.connected()).toBe(false);
    await expect(hub.motion.tasks()).rejects.toThrow(/Connect Motion/);
    expect(hub.calendar.connected()).toBe(false);
    expect(hub.lists.kind).toBe("local");
    expect(hub.lists.list()).toEqual([]);
  });
});

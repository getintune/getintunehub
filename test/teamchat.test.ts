import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/core/config.js";
import { makeHub } from "../src/hub.js";
import { chatNotice, dismissTeamMessage, teamMessages } from "../src/workflows/teamchat.js";
import { listCounts, setWorkshopOver } from "../src/workflows/needs.js";

const t = (from: string, subject: string, snippet = "Can you check the task?") => ({ id: "x1", from, subject, snippet, date: "2026-11-16T15:00:00Z", messageCount: 1 });
const hubIn = (env: Record<string, string>) => makeHub(loadConfig(env, mkdtempSync(path.join(tmpdir(), "hub-chat-"))));

describe("Team messages from Google Chat emails", () => {
  it("reads who wrote and where from the notification email", () => {
    expect(chatNotice(t("Kristin Example (via Google Chat) <chat-noreply@google.com>", "Kristin Example sent you a message"))).toMatchObject({ who: "Kristin Example", preview: "Can you check the task?", link: "https://mail.google.com/mail/u/0/#all/x1" });
    expect(chatNotice(t("Google Chat <chat-noreply@google.com>", "Frankie Example mentioned you in Content team"))).toMatchObject({ who: "Frankie Example", where: "Content team" });
    expect(chatNotice(t("Google Chat <chat-noreply@google.com>", "Unread messages in Team Get In Tune"))).toMatchObject({ who: "Team Get In Tune" });
    expect(chatNotice(t("Priya Example <priya@example.com>", "Free consult"))).toBeNull();
  });

  it("shows practice messages in practice mode, and Done hides one", async () => {
    const hub = hubIn({ HUB_MODE: "mock" });
    const first = await teamMessages(hub);
    expect(first.connected).toBe(true);
    expect(first.messages.length).toBe(2);
    dismissTeamMessage(hub, first.messages[0].id);
    expect((await teamMessages(hub)).messages.length).toBe(1);
  });

  it("says Gmail isn't connected (no practice messages) on her Mac before Connect Gmail", async () => {
    const hub = hubIn({ HUB_MODE: "live" });
    expect(await teamMessages(hub)).toEqual({ connected: false, messages: [] });
  });

  it("searches only Chat's notification emails from the last week", async () => {
    const hub = hubIn({ HUB_MODE: "mock" });
    const asked: string[] = [];
    (hub as any).gmail = { kind: "google", search: async (q: string) => (asked.push(q), [t("Google Chat <chat-noreply@google.com>", "Kristin Example sent you a message")]) };
    expect((await teamMessages(hub)).messages[0].who).toBe("Kristin Example");
    expect(asked).toEqual(["from:chat-noreply@google.com newer_than:7d"]);
  });
});

describe("Workshop's over", () => {
  it("takes the workshop off Today and Plan my day, and keeps the people on the list", () => {
    const hub = hubIn({ HUB_MODE: "mock" });
    hub.lists.add("workshop", { name: "Nora Example", extra: { event: "Practice Workshop", source: "Eventbrite" } } as any);
    const before = listCounts(hub);
    const w = before.workshops[0];
    expect(w).toBeTruthy();
    setWorkshopOver(hub, w.event);
    const after = listCounts(hub);
    expect(after.workshops.map((x) => x.event)).not.toContain(w.event);
    expect(after.pastWorkshops).toContain(w.event);
    expect(after.lists.find((l) => l.id === "workshop")!.total).toBe(before.lists.find((l) => l.id === "workshop")!.total);
    setWorkshopOver(hub, w.event, false);
    expect(listCounts(hub).workshops.map((x) => x.event)).toContain(w.event);
  });
});

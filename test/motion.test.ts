import { describe, expect, it } from "vitest";
import { LiveMotion } from "../src/connectors/motion/index.js";
import { addToMotion, motionTeam, motionToday } from "../src/workflows/motion.js";
import { testHub } from "./helpers.js";

describe("Motion", () => {
  it("shows what Motion scheduled for her today, in order, plus anything overdue", async () => {
    const { hub } = testHub();
    const now = new Date();
    now.setHours(8, 0, 0, 0);
    const t = await motionToday(hub, now);
    expect(t.scheduled.map((x) => x.name)).toEqual(["Post the workshop reminder on Instagram", "Review Frankie's countdown posts", "Workshop slides: final run-through", "Send Tom the coaching program details"]);
    expect(t.scheduled.every((x) => x.mine)).toBe(true);
  });

  it("shows Kristin's and Frankie's tasks for the week, not hers", async () => {
    const { hub } = testHub();
    const team = await motionTeam(hub);
    expect(team.map((p) => p.person)).toEqual(["Frankie Example", "Kristin Example"]);
    expect(team.find((p) => p.person === "Kristin Example")!.tasks.map((x) => x.name)).toContain("Add Eventbrite sign-ups to the Wix list");
  });

  it("adds a task only after she says yes, with her edited name", async () => {
    const yes = testHub(true).hub;
    const t = await addToMotion(yes, { name: "Reply to Kristin", dueDate: "2026-11-10" });
    expect(t).toMatchObject({ name: "Reply to Kristin", mine: true });
    expect((await yes.motion.tasks()).some((x) => x.name === "Reply to Kristin")).toBe(true);
    const no = testHub(false).hub;
    expect(await addToMotion(no, { name: "Nope" })).toBeNull();
    expect((await no.motion.tasks()).some((x) => x.name === "Nope")).toBe(false);
  });

  it("talks to Motion's API with her key, and lets Motion schedule new tasks", async () => {
    const calls: { url: string; method: string; body?: any; key?: string }[] = [];
    const fake = (async (url: string, init: any) => {
      calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : undefined, key: init.headers["X-API-Key"] });
      if (url.endsWith("/users/me")) return new Response(JSON.stringify({ id: "u1" }));
      if (url.endsWith("/workspaces")) return new Response(JSON.stringify({ workspaces: [{ id: "w1" }] }));
      if (init.method === "POST") return new Response(JSON.stringify({ id: "t9", name: "New", assignees: [{ id: "u1", name: "Marlys" }] }));
      return new Response(JSON.stringify({ tasks: [{ id: "t1", name: "Mine", scheduledStart: "2026-11-09T16:00:00Z", assignees: [{ id: "u1", name: "Marlys" }], status: { name: "Todo" } }, { id: "t2", name: "Done one", completed: true, assignees: [] }], meta: {} }));
    }) as typeof fetch;
    const m = new LiveMotion({ apiKey: "k", workspaceId: "" }, fake);
    const ts = await m.tasks();
    expect(ts.map((t) => [t.name, t.mine])).toEqual([["Mine", true]]);
    expect(calls.find((c) => c.url.includes("/tasks?"))!.url).toContain("assigneeId=u1");
    expect(calls.every((c) => c.key === "k")).toBe(true);
    await m.create({ name: "New", dueDate: "2026-11-12" });
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.body).toMatchObject({ name: "New", workspaceId: "w1", assigneeId: "u1", autoScheduled: { deadlineType: "SOFT" } });
    // The app never edits, moves or deletes Motion tasks.
    expect(calls.some((c) => ["PATCH", "PUT", "DELETE"].includes(c.method))).toBe(false);
  });
});

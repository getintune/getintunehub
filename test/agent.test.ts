import { describe, expect, it } from "vitest";
import { ask, systemPrompt, type AgentEvent } from "../src/agent/run.js";
import { functionDeclarations, hubTools } from "../src/agent/tools.js";
import { MockGemini } from "../src/connectors/gemini/index.js";
import { testHub } from "./helpers.js";

describe("the app's agent on Gemini", () => {
  it("gives Gemini her tools as function declarations, with no way to send email", () => {
    const { hub } = testHub();
    const decls = functionDeclarations(hubTools(hub));
    const names = decls.map((d) => d.name);
    expect(names).toEqual(expect.arrayContaining(["lists_find", "lists_add", "lists_update", "gmail_create_draft", "calendar_events", "calendar_create_event", "tasks_create", "contacts_find", "needs_me"]));
    expect(names.some((n) => /send/i.test(n))).toBe(false);
    const draft = decls.find((d) => d.name === "gmail_create_draft")!.parametersJsonSchema as any;
    expect(draft.type).toBe("object");
    expect(draft.required).toEqual(expect.arrayContaining(["to", "subject", "body"]));
  });

  it("runs the tool loop, streams each step, and keeps the rules in the system prompt", async () => {
    const { hub } = testHub();
    hub.gemini = new MockGemini([
      () => ({ calls: [{ id: "1", name: "lists_counts", args: {} }] }),
      (r) => {
        const answer = r.contents.at(-1)!.parts[0].functionResponse!;
        expect(answer.name).toBe("lists_counts");
        expect(JSON.stringify(answer.response)).toContain("Suddenly Untethered (Nov 13)");
        return { text: "You have 4 workshop sign-ups." };
      },
    ]);
    const steps: AgentEvent[] = [];
    const text = await ask(hub, "How many workshop sign-ups do I have?", { onMessage: (e) => steps.push(e) });
    expect(text).toBe("You have 4 workshop sign-ups.");
    expect(steps).toEqual([{ type: "tool", name: "lists_counts", input: {} }]);
    const sys = (hub.gemini as MockGemini).requests[0].system;
    expect(sys).toBe(systemPrompt(hub));
    expect(sys).toMatch(/DRAFT/);
    expect(sys).toMatch(/You cannot send email/);
    expect(sys).toMatch(/initials only/);
  });

  it("asks her before changing anything, and does nothing when she says no", async () => {
    const { hub } = testHub(false); // she answers No
    hub.gemini = new MockGemini([
      () => ({ calls: [{ name: "lists_add", args: { program: "coaching", name: "New Person" } }] }),
      (r) => ({ text: String((r.contents.at(-1)!.parts[0].functionResponse!.response as any).result) }),
    ]);
    const before = hub.lists.list("coaching").length;
    expect(await ask(hub, "Add New Person to coaching")).toMatch(/declined/);
    expect(hub.lists.list("coaching").length).toBe(before);
  });

  it("never shows Gemini a therapy client's notes", async () => {
    const { hub } = testHub();
    hub.lists.update("t1", { nextStep: "x" });
    hub.lists.addNote("t1", "PRIVATE-NOTE-7Q3 (must never leave the app)");
    hub.gemini = new MockGemini([() => ({ calls: [{ name: "lists_find", args: { program: "therapy" } }] }), () => ({ text: "done" })]);
    await ask(hub, "Who are my therapy clients?");
    const sent = JSON.stringify((hub.gemini as MockGemini).requests);
    expect(sent).toContain("A.R.");
    expect(sent).not.toContain("PRIVATE-NOTE-7Q3");
  });

  it("explains when the agent is off", async () => {
    const { hub } = testHub();
    await expect(ask(hub, "hi")).rejects.toThrow(/GEMINI_API_KEY/);
  });
});

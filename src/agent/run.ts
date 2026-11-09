import { mkdirSync } from "node:fs";
import type { GeminiContent } from "../connectors/gemini/index.js";
import type { Hub } from "../hub.js";
import { recordCost } from "./costs.js";
import { functionDeclarations, hubTools } from "./tools.js";

/** What the agent is doing, for the page's live progress (each tool call, and its text as it goes). */
export type AgentEvent = { type: "tool"; name: string; input: Record<string, unknown> } | { type: "text"; text: string };

export function systemPrompt(hub: Hub): string {
  const p = hub.cfg.profile;
  const me = p.first;
  const lists = hub.lists.programs().map((x) => `  - ${x.name} (${x.id}): ${x.stages.join(" > ")}${x.hint ? `. ${x.hint}` : ""}`).join("\n");
  return `You are ${p.owner}'s assistant inside ${p.appName}, her own app for running ${p.business} (email, calendar, tasks and her client lists in one place). ${p.about}. All times are in ${p.timeZone}.

How ${p.appName} is organized:
- Her lists, one per program (lists_*). Each person has a stage, contact details, notes and a next step with a date:
${lists}
- What needs her right now: needs_me. Counts per list and workshop sign-ups by source: lists_counts.
- Email: every email you write is a Gmail DRAFT (gmail_create_draft). You cannot send email. ${me} sends drafts herself.
- Calendar: calendar_* (read events, find free time, book / move / delete; changes ask ${me} first).
- Tasks: tasks_* (due dates only, no times).
- Contacts: contacts_find (everyone from her email, and which lists they're on).

Privacy: ${me} is a licensed therapist. Therapy clients (Grow Therapy) are kept by initials only, and their clinical details stay in Grow. Never write a therapy client's full name, diagnosis or session content anywhere, and don't put therapy clients in emails. Coaching and workshops are coaching, not therapy.

Ask before anything that changes something; the app's tools also ask ${me} themselves. Keep replies short and plain: ${me} reads them between client sessions.`;
}

/** The most model turns one request may take (each turn can call several tools). */
export const MAX_TURNS = 12;

/**
 * Runs one request through the app's agent: Google Gemini with the app's tools (function calling). Gemini asks for a
 * tool, the app runs it (tools that change anything ask her first through hub.approver), and the answer goes back,
 * until Gemini replies in words. Email is drafts only: there is no send tool. `use` labels the run for the meter.
 */
export async function ask(hub: Hub, prompt: string, opts: { onMessage?: (e: AgentEvent) => void; use?: "ask" | "brief" } = {}): Promise<string> {
  if (!hub.gemini.connected()) throw new Error("The app's agent is off: add GEMINI_API_KEY to the .env file in the app's folder.");
  mkdirSync(hub.cfg.stateDir, { recursive: true });
  const tools = hubTools(hub);
  const byName = new Map(tools.map((t) => [t.name, t]));
  const decls = functionDeclarations(tools);
  const contents: GeminiContent[] = [{ role: "user", parts: [{ text: prompt }] }];
  const usage = { input: 0, output: 0 };
  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const r = await hub.gemini.generate({ model: hub.cfg.model, system: systemPrompt(hub), contents, tools: decls });
      usage.input += r.usage.input;
      usage.output += r.usage.output;
      contents.push(r.content);
      if (r.text.trim() && r.calls.length) {
        hub.say(r.text);
        opts.onMessage?.({ type: "text", text: r.text });
      }
      if (!r.calls.length) return r.text.trim() || "(no answer)";
      const answers = [];
      for (const c of r.calls) {
        opts.onMessage?.({ type: "tool", name: c.name, input: c.args });
        hub.say(`  → ${describeTool(c.name, c.args)}`);
        const t = byName.get(c.name);
        const result = t ? await t.run(c.args) : { error: `There's no tool called ${c.name}.` };
        answers.push({ functionResponse: { id: c.id, name: c.name, response: { result: result ?? null } } });
      }
      contents.push({ role: "user", parts: answers });
    }
    return "I stopped there: that took more steps than I allow in one go. Ask again with a smaller request.";
  } finally {
    recordCost(hub, opts.use ?? "ask", { tokens: usage }, hub.cfg.model);
  }
}

/** One line for each step the agent takes, shown while it works ("Looking at your lists", "Drafting an email"). */
export function describeTool(name: string, input: Record<string, unknown>): string {
  const short = name;
  const steps: Record<string, string> = {
    lists_find: "Looking at your lists",
    lists_counts: "Counting your lists",
    lists_add: "Adding someone to a list",
    lists_update: "Updating someone on a list",
    lists_add_note: "Adding a note",
    needs_me: "Checking what needs you",
    contacts_find: "Looking up a contact",
    gmail_search: "Searching your email",
    gmail_read_thread: "Reading an email",
    gmail_create_draft: `Drafting an email${input.subject ? `: "${String(input.subject)}"` : ""}`,
    calendar_events: "Looking at your calendar",
    calendar_free_time: "Finding free time",
    calendar_create_event: "Adding a calendar event",
    calendar_update_event: "Changing a calendar event",
    calendar_delete_event: "Removing a calendar event",
    tasks_list: "Looking at your tasks",
    tasks_create: "Adding a task",
    tasks_update: "Updating a task",
    TodoWrite: "Planning the steps",
  };
  return steps[short] ?? short.replace(/_/g, " ");
}

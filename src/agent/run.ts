import { query, type Options, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { claudeEnv } from "./env.js";
import { mkdirSync } from "node:fs";
import type { Hub } from "../hub.js";
import { makeGuard } from "./guard.js";
import { hubTools, SERVER } from "./tools.js";

export function systemPrompt(hub: Hub): string {
  const p = hub.cfg.profile;
  const me = p.first;
  const lists = hub.lists.programs().map((x) => `  - ${x.name} (${x.id}): ${x.stages.join(" > ")}${x.hint ? `. ${x.hint}` : ""}`).join("\n");
  return `You are ${p.owner}'s assistant inside ${p.appName}, her own app for running ${p.business} (email, calendar, tasks and her client lists in one place). ${p.about}. All times are in ${p.timeZone}.

How ${p.appName} is organized:
- Her lists, one per program (mcp__hub__lists_*). Each person has a stage, contact details, notes and a next step with a date:
${lists}
- What needs her right now: mcp__hub__needs_me. Counts per list and workshop sign-ups by source: mcp__hub__lists_counts.
- Email: every email you write is a Gmail DRAFT (mcp__hub__gmail_create_draft). You cannot send email. ${me} sends drafts herself.
- Calendar: mcp__hub__calendar_* (read events, find free time, book / move / delete; changes ask ${me} first).
- Tasks: mcp__hub__tasks_* (due dates only, no times).
- Contacts: mcp__hub__contacts_find (everyone from her email, and which lists they're on).

Privacy: ${me} is a licensed therapist. Therapy clients (Grow Therapy) are kept by initials only, and their clinical details stay in Grow. Never write a therapy client's full name, diagnosis or session content anywhere, and don't put therapy clients in emails. Coaching and workshops are coaching, not therapy.

Ask before anything that changes something; the app's tools also ask ${me} themselves. Keep replies short and plain: ${me} reads them between client sessions.`;
}

export function agentOptions(hub: Hub, extra: Partial<Options> = {}): Options {
  return {
    cwd: hub.cfg.stateDir,
    settingSources: [],
    model: hub.cfg.model,
    mcpServers: { [SERVER]: hubTools(hub) },
    canUseTool: makeGuard(hub),
    permissionMode: "default",
    systemPrompt: { type: "preset", preset: "claude_code", append: systemPrompt(hub) },
    env: claudeEnv(hub),
    ...extra,
  };
}

/** Runs one request through the agent, printing its progress. Returns the final text. */
export async function ask(hub: Hub, prompt: string, opts: { onMessage?: (m: SDKMessage) => void } = {}): Promise<string> {
  if (!hub.cfg.anthropicApiKey) throw new Error("No Anthropic API key: add ANTHROPIC_API_KEY to the .env file in the app's folder.");
  mkdirSync(hub.cfg.stateDir, { recursive: true });
  let final = "";
  for await (const m of query({ prompt, options: agentOptions(hub) })) {
    opts.onMessage?.(m);
    if (m.type === "assistant") {
      for (const b of m.message.content) {
        if (b.type === "text" && b.text.trim()) hub.say(b.text);
        if (b.type === "tool_use") hub.say(`  → ${b.name.replace(`mcp__${SERVER}__`, "")} ${summarize(b.input)}`);
      }
    } else if (m.type === "result") {
      if (m.subtype === "success") final = m.result;
      else throw new Error(`Agent stopped: ${m.subtype}`);
    }
  }
  return final;
}

function summarize(input: unknown): string {
  const s = JSON.stringify(input);
  return s.length > 140 ? `${s.slice(0, 140)}…` : s;
}

/** One line for each step Claude takes, shown while it works ("Looking at your lists", "Drafting an email"). */
export function describeTool(name: string, input: Record<string, unknown>): string {
  const short = name.replace(`mcp__${SERVER}__`, "");
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

import { z } from "zod";
import type { FunctionDeclaration } from "../connectors/gemini/index.js";
import { createGeneratedDraft } from "../workflows/generated.js";
import type { Entry } from "../connectors/lists/index.js";
import type { Hub } from "../hub.js";
import { findContacts } from "../workflows/contacts.js";
import { TIME_ZONE } from "../core/config.js";

/** One tool the agent can call: its name, what it's for, its arguments (zod) and what it does. */
export interface AgentTool {
  name: string;
  description: string;
  schema: z.ZodObject<z.ZodRawShape>;
  run(args: Record<string, unknown>): Promise<unknown>;
}

const wrap = <A>(fn: (a: A) => Promise<unknown>) => async (a: A): Promise<unknown> => {
  try {
    return await fn(a);
  } catch (e) {
    return { error: (e as Error).message ?? String(e) };
  }
};
function tool<S extends z.ZodRawShape>(name: string, description: string, shape: S, run: (a: z.infer<z.ZodObject<S>>) => Promise<unknown>): AgentTool {
  const schema = z.object(shape);
  return { name, description, schema: schema as unknown as z.ZodObject<z.ZodRawShape>, run: async (raw) => {
    const parsed = schema.safeParse(raw ?? {});
    if (!parsed.success) return { error: `Wrong arguments for ${name}: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}` };
    return run(parsed.data);
  } };
}

/** The tools as Gemini function declarations (JSON Schema from the zod shapes). */
export function functionDeclarations(tools: AgentTool[]): FunctionDeclaration[] {
  return tools.map((t) => {
    const js = z.toJSONSchema(t.schema, { io: "input" }) as Record<string, unknown>;
    delete js.$schema;
    return { name: t.name, description: t.description, parametersJsonSchema: js };
  });
}

/**
 * What the agent sees of a person on her lists. On an initials-only list (therapy clients) the agent gets the initials,
 * stage and next step only: never notes, which could hold health information.
 */
export function entryForAgent(hub: Hub, e: Entry) {
  const p = hub.lists.program(e.program);
  const base = { id: e.id, list: p.name, program: e.program, name: e.name, stage: e.stage, stageSince: e.stageSince.slice(0, 10), nextStep: e.nextStep || undefined, nextDate: e.nextDate || undefined };
  if (p.initialsOnly) return { ...base, note: "Initials only (therapy client). Clinical details stay in Grow Therapy." };
  return { ...base, email: e.email || undefined, phone: e.phone || undefined, ...Object.fromEntries(p.fields.filter((f) => e.extra[f.key]).map((f) => [f.label, e.extra[f.key]])), notes: e.notes.slice(-5).map((n) => `${n.at.slice(0, 10)}: ${n.text}`) };
}

/**
 * The app's tools for the agent (Gemini). Every one that changes something (her lists, calendar, tasks) asks her first through
 * hub.approver inside the handler, so they're safe no matter how the agent calls them. There is no "send email" tool:
 * the agent only makes drafts.
 */
export function hubTools(hub: Hub): AgentTool[] {
  const me = hub.cfg.profile.first;
  const programIds = hub.lists.programs().map((p) => p.id) as [string, ...string[]];
  const program = z.enum(programIds).describe(hub.lists.programs().map((p) => `${p.id} = ${p.name}`).join("; "));
  const lists = hub.lists.programs().map((p) => `${p.id} (${p.name}; stages: ${p.stages.join(" > ")}${p.fields.length ? `; fields: ${p.fields.map((f) => f.key).join(", ")}` : ""})`).join("\n");

  const tools = [
    // ---------------------------------------------------------------- her lists
    tool(
      "lists_find",
      `Find people on ${me}'s lists by name, email, notes or a field (e.g. "Eventbrite", "Lisbon"). Leave query empty to get everyone on a list. Her lists:\n${lists}`,
      { query: z.string().default(""), program: program.optional() },
      wrap(async ({ query, program: p }) => {
        const found = hub.lists.find(query, p);
        return found.length ? found.slice(0, 40).map((e) => entryForAgent(hub, e)) : { found: 0, note: "Nobody on the lists matches." };
      }),
    ),
    tool(
      "lists_counts",
      "How many people are on each list, by stage (and for workshop sign-ups, by workshop and by where they signed up).",
      {},
      wrap(async () => {
        const { listCounts } = await import("../workflows/needs.js");
        return listCounts(hub);
      }),
    ),
    tool(
      "lists_add",
      `Add someone to one of ${me}'s lists (asks her first). For therapy clients use initials only. extra holds the list's own fields by key.`,
      { program, name: z.string(), email: z.string().optional(), phone: z.string().optional(), stage: z.string().optional(), nextStep: z.string().optional(), nextDate: z.string().optional().describe("YYYY-MM-DD"), extra: z.record(z.string(), z.string()).optional() },
      wrap(async ({ program: p, ...d }) => {
        const prog = hub.lists.program(p);
        if (!(await hub.approver.confirm(`Add ${d.name} to ${prog.name}?`, [d.stage ? `Stage: ${d.stage}` : `Stage: ${prog.stages[0]}`, d.email ?? "", d.nextStep ? `Next: ${d.nextStep}${d.nextDate ? ` (${d.nextDate})` : ""}` : ""].filter(Boolean)))) return `${me} declined; nothing added.`;
        return entryForAgent(hub, hub.lists.add(p, d));
      }),
    ),
    tool(
      "lists_update",
      `Change someone on ${me}'s lists: move their stage, set the next step and date, or fix their details (asks her first). Use the id from lists_find.`,
      { id: z.string(), stage: z.string().optional(), nextStep: z.string().optional(), nextDate: z.string().optional().describe("YYYY-MM-DD, or empty to clear"), name: z.string().optional(), email: z.string().optional(), phone: z.string().optional(), extra: z.record(z.string(), z.string()).optional() },
      wrap(async ({ id, ...patch }) => {
        const cur = hub.lists.get(id);
        const lines = Object.entries(patch).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`);
        if (!(await hub.approver.confirm(`Change ${cur.name} on ${hub.lists.program(cur.program).name}?`, lines))) return `${me} declined; nothing changed.`;
        return entryForAgent(hub, hub.lists.update(id, patch));
      }),
    ),
    tool(
      "lists_add_note",
      `Add a short note to someone on ${me}'s lists (asks her first). Not for therapy clients: their notes stay in Grow Therapy.`,
      { id: z.string(), text: z.string() },
      wrap(async ({ id, text }) => {
        const cur = hub.lists.get(id);
        if (hub.lists.program(cur.program).initialsOnly) return "Notes on therapy clients stay in Grow Therapy, not here. Nothing added.";
        if (!(await hub.approver.confirm(`Add this note to ${cur.name}?`, [text]))) return `${me} declined; nothing added.`;
        return entryForAgent(hub, hub.lists.addNote(id, text));
      }),
    ),

    // ---------------------------------------------------------------- contacts and Gmail (drafts only)
    tool(
      "contacts_find",
      `Look up people in ${me}'s contacts (everyone from her email, with emails and phones, and which of her lists they're on). Search by name, email, phone or list name. Use this whenever ${me} asks for someone's contact info or who to email.`,
      { query: z.string().describe('e.g. "Priya", "@example.com", "workshop"') },
      wrap(async ({ query }) => {
        const people = await findContacts(hub, query, { limit: 12 });
        return people.length ? people.map((p) => ({ name: p.name, emails: p.emails, phones: p.phones.map((x) => `${x.number}${x.label ? ` (${x.label})` : ""}`), lists: (p.lists ?? []).map((l) => `${l.list}: ${l.stage}`), lastEmailAt: p.lastEmailAt })) : { found: 0, note: "Nobody matches in the contacts." };
      }),
    ),
    tool("gmail_search", "Search the Gmail inbox (Gmail search syntax).", { query: z.string(), max: z.number().int().default(10) }, wrap(async ({ query, max }) => hub.gmail.search(query, max))),
    tool("gmail_read_thread", "Read every message in a Gmail thread.", { threadId: z.string() }, wrap(async ({ threadId }) => hub.gmail.getThread(threadId))),
    tool(
      "gmail_create_draft",
      `Create a Gmail DRAFT (never sent; ${me} reviews and sends it herself). To reply in a thread, pass threadId (the draft goes into that conversation). Write in ${me}'s warm, plain voice; her Gmail signature is added, so don't add one. Attachments are local file paths.`,
      {
        to: z.array(z.string()).min(1),
        cc: z.array(z.string()).default([]),
        subject: z.string(),
        body: z.string(),
        attachments: z.array(z.string()).default([]),
        threadId: z.string().optional().describe("to draft a reply inside an existing thread"),
      },
      wrap(async (a) => {
        let inReplyTo: string | undefined;
        if (a.threadId) inReplyTo = (await hub.gmail.getThread(a.threadId).catch(() => null))?.messages.at(-1)?.messageIdHeader;
        const ref = await createGeneratedDraft(hub, { to: a.to, cc: a.cc, bcc: [], subject: a.subject, body: a.body, attachments: a.attachments, threadId: a.threadId, inReplyTo });
        return { draftId: ref.id, threadId: ref.threadId, note: `Draft created in Gmail. ${me} reviews and sends it.` };
      }),
    ),

    // ---------------------------------------------------------------- calendar
    tool(
      "calendar_events",
      `${me}'s calendar events between two times (ISO), all calendars unless calendarIds is given.`,
      { start: z.string(), end: z.string(), q: z.string().optional() },
      wrap(async ({ start, end, q }) => hub.calendar.events({ start, end, q })),
    ),
    tool(
      "calendar_free_time",
      `Open weekday time (7am-5pm her time) of at least \`minutes\` over the next \`days\` days, from ${me}'s calendar.`,
      { days: z.number().int().min(1).max(21).default(5), minutes: z.number().int().min(15).default(60) },
      wrap(async ({ days, minutes }) => {
        const { freeSlots } = await import("../connectors/calendar/index.js");
        const from = new Date();
        const busy = await hub.calendar.busy({ start: from.toISOString(), end: new Date(from.getTime() + (days + 2) * 864e5).toISOString() });
        return freeSlots(busy, { from, days, minutes });
      }),
    ),
    tool(
      "calendar_create_event",
      `Put an event on ${me}'s calendar (asks her first). Times are ISO with her UTC offset (${hub.cfg.profile.timeZone}). attendees get an invite.`,
      { title: z.string(), start: z.string(), end: z.string(), allDay: z.boolean().optional(), location: z.string().optional(), description: z.string().optional(), attendees: z.array(z.string()).optional(), reminderMinutes: z.number().int().optional(), calendarId: z.string().optional() },
      wrap(async (a) => {
        const when = a.allDay ? a.start.slice(0, 10) : new Date(a.start).toLocaleString("en-US", { timeZone: TIME_ZONE, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
        if (!(await hub.approver.confirm(`Add "${a.title}" to your calendar?`, [when, a.location ?? "", a.attendees?.length ? `Invites: ${a.attendees.join(", ")}` : ""].filter(Boolean)))) return `${me} declined; nothing added.`;
        return hub.calendar.create(a);
      }),
    ),
    tool(
      "calendar_update_event",
      `Move or change an event on ${me}'s calendar (asks her first).`,
      { calendarId: z.string(), eventId: z.string(), title: z.string().optional(), start: z.string().optional(), end: z.string().optional(), location: z.string().optional(), description: z.string().optional() },
      wrap(async ({ calendarId, eventId, ...e }) => {
        if (!(await hub.approver.confirm(`Change this calendar event?`, Object.entries(e).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}: ${v}`)))) return `${me} declined; nothing changed.`;
        return hub.calendar.update(calendarId, eventId, e);
      }),
    ),
    tool(
      "calendar_delete_event",
      `Delete an event from ${me}'s calendar (asks her first).`,
      { calendarId: z.string(), eventId: z.string(), title: z.string().describe(`the event's title, shown to ${me}`) },
      wrap(async ({ calendarId, eventId, title }) => {
        if (!(await hub.approver.confirm(`Delete "${title}" from your calendar?`))) return `${me} declined; nothing deleted.`;
        await hub.calendar.remove(calendarId, eventId);
        return "Deleted.";
      }),
    ),

    // ---------------------------------------------------------------- tasks
    tool(
      "tasks_list",
      `${me}'s tasks (open ones; completed too if asked), optionally only those due between two dates (YYYY-MM-DD).`,
      { dueMin: z.string().optional(), dueMax: z.string().optional(), showCompleted: z.boolean().default(false) },
      wrap(async ({ dueMin, dueMax, showCompleted }) => hub.tasks.tasks({ dueMin, dueMax, showCompleted })),
    ),
    tool(
      "tasks_create",
      `Add a task for ${me} (asks her first). due is a date, YYYY-MM-DD.`,
      { title: z.string(), due: z.string().optional(), notes: z.string().optional(), listId: z.string().optional() },
      wrap(async (a) => {
        if (!(await hub.approver.confirm(`Add this task?`, [a.title, a.due ? `Due ${a.due}` : "No due date", a.notes ?? ""].filter(Boolean)))) return `${me} declined; nothing added.`;
        return hub.tasks.create(a);
      }),
    ),
    tool(
      "tasks_update",
      `Change a task: retitle, move its due date, or mark it done / not done (asks ${me} first).`,
      { listId: z.string(), taskId: z.string(), title: z.string().optional(), due: z.string().nullable().optional(), notes: z.string().optional(), completed: z.boolean().optional() },
      wrap(async ({ listId, taskId, ...t }) => {
        if (!(await hub.approver.confirm(`Change this task?`, Object.entries(t).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}: ${v}`)))) return `${me} declined; nothing changed.`;
        return hub.tasks.update(listId, taskId, t);
      }),
    ),

    // ---------------------------------------------------------------- what needs her
    tool(
      "needs_me",
      `Everything on ${me}'s plate right now from her lists: next steps due or overdue, people waiting too long at a stage, and new workshop sign-ups.`,
      {},
      wrap(async () => (await import("../workflows/needs.js")).needs(hub)),
    ),
  ];
  return tools;
}

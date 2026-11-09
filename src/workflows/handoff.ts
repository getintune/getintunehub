import { TIME_ZONE } from "../core/config.js";
import type { Entry } from "../connectors/lists/index.js";
import type { Hub } from "../hub.js";
import { listCounts, needs } from "./needs.js";

/**
 * "Do this in Claude": instead of calling Claude itself (which needs a paid API key), the app writes the request
 * out, with what it knows, and opens it in Marlys's own Claude app, where her subscription covers it and her
 * Gmail, Calendar and Microsoft 365 connectors let Claude read her mail and calendar. She presses Enter there.
 *
 * Privacy: therapy clients never go into these requests (they're initials only anyway), and the requests always
 * say drafts only, nothing sent.
 */

const today = (now: Date) => now.toLocaleDateString("en-US", { timeZone: TIME_ZONE, weekday: "long", month: "long", day: "numeric", year: "numeric" });

function intro(hub: Hub) {
  const p = hub.cfg.profile;
  return `I'm ${p.owner} (${p.business}). ${p.about}. My time zone is ${p.timeZone}.`;
}

const RULES = `Rules: make email replies as drafts only (never send anything). Therapy clients are confidential: don't name them or put anything about them in emails or drafts.`;

/** Plan my day: what the app knows (lists, sign-ups, today's calendar and tasks) plus what Claude should check. */
export async function planPrompt(hub: Hub, now = new Date()): Promise<string> {
  const n = needs(hub, now).filter((x) => x.program !== "therapy");
  const therapy = needs(hub, now).filter((x) => x.program === "therapy").length;
  const { workshops } = listCounts(hub, now);
  const lines: string[] = [`${intro(hub)} Today is ${today(now)}. Please plan my day.`, ""];
  lines.push("From my app, things on my lists that need me:");
  lines.push(...(n.length ? n.map((x) => `- ${x.name} (${x.list}, ${x.stage}): ${x.title}${x.kind === "next" ? (x.days > 0 ? `, ${x.days} day${x.days === 1 ? "" : "s"} overdue` : ", due today") : `, waiting ${x.days} days`}`) : ["- nothing"]));
  if (therapy) lines.push(`- plus ${therapy} therapy admin item${therapy === 1 ? "" : "s"} (check Grow Therapy)`);
  const { growAlerts } = await import("./grow.js");
  const grow = await growAlerts(hub, 3, now).catch(() => []);
  if (grow.length) lines.push("", "Grow Therapy (from info@, initials only; details stay in Grow):", ...grow.map((g) => `- ${g.title}`));
  if (workshops.length) lines.push("", `Workshop sign-ups: ${workshops.map((w) => `${w.event}: ${w.total} so far (${w.newToday} new in the last day; ${w.bySource.map((s) => `${s.source} ${s.count}`).join(", ")})`).join("; ")}.`);
  if (hub.calendar.connected()) {
    const d0 = new Date(now), d1 = new Date(now);
    d0.setHours(0, 0, 0, 0);
    d1.setHours(24, 0, 0, 0);
    const ev = await hub.calendar.events({ start: d0.toISOString(), end: d1.toISOString() }).catch(() => []);
    const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TIME_ZONE });
    lines.push("", "Today's calendar:", ...(ev.length ? ev.map((e) => `- ${e.allDay ? "all day" : hm(e.start)}: ${e.private ? "Client session (details private)" : e.title}`) : ["- nothing booked"]));
  } else lines.push("", "Check my calendar for today.");
  try {
    const { motionToday } = await import("./motion.js");
    const m = await motionToday(hub, now);
    const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TIME_ZONE });
    if (m.scheduled.length || m.overdue.length)
      lines.push("", "My Motion tasks today (Motion schedules them; don't move them):", ...m.scheduled.map((t) => `- ${hm(t.scheduledStart!)}: ${t.name}`), ...m.overdue.map((t) => `- overdue: ${t.name}`));
  } catch {
    /* Motion not reachable: the brief goes on without it */
  }
  lines.push(
    "",
    "Also look at my email from the last 2 days (Outlook work email and Gmail) for anything waiting on my reply, especially from my team (Kristin, Frankie). Leave Grow Therapy emails out: those are listed above.",
    "",
    "Then give me a short brief: one line on today at a glance, then a numbered list of what to do in order (most urgent first), then today's appointments. Offer to draft the most important replies.",
    RULES,
  );
  return lines.join("\n");
}

/** Help with one person on her lists: who they are, where they stand, and what to do next. */
export function personPrompt(hub: Hub, e: Entry, ask?: string): string {
  const p = hub.lists.program(e.program);
  if (p.initialsOnly) throw new Error("Therapy clients stay out of Claude requests. Use Grow Therapy for them.");
  const extra = p.fields.filter((f) => e.extra[f.key]).map((f) => `${f.label}: ${e.extra[f.key]}`);
  return [
    intro(hub),
    "",
    `This is about ${e.name}${e.email ? ` <${e.email}>` : ""}, on my "${p.name}" list. Stage: ${e.stage}.${e.nextStep ? ` Next step: ${e.nextStep}${e.nextDate ? ` (by ${e.nextDate})` : ""}.` : ""}`,
    ...(extra.length ? [extra.join(". ") + "."] : []),
    ...(e.notes.length ? ["My notes:", ...e.notes.slice(-5).map((n) => `- ${n.at.slice(0, 10)}: ${n.text}`)] : []),
    "",
    ask ?? `Look at my recent email with ${e.name.split(" ")[0]}${e.email ? ` (${e.email})` : ""} and tell me the next step. If an email is needed, draft it in my voice: warm, plain and short.`,
    RULES,
  ].join("\n");
}

/** Draft a reply to an email thread she has open. */
export function replyPrompt(hub: Hub, t: { subject: string; from: string; date: string; body: string }): string {
  return [
    intro(hub),
    "",
    `Please find this email in my inbox and draft my reply in the same thread (save it as a draft, don't send):`,
    `From: ${t.from}`,
    `Date: ${t.date}`,
    `Subject: ${t.subject}`,
    "",
    t.body.replace(/\r/g, "").split(/\n(?:On .+wrote:|-{2,}\s*(?:Original|Forwarded) Message)/)[0].trim().slice(0, 1500),
    "",
    "Write it in my voice: warm, plain and short.",
    RULES,
  ].join("\n");
}

/** Anything she types in the Ask box, with a line about who she is. */
export function askPrompt(hub: Hub, text: string): string {
  return `${intro(hub)}\n\n${text.trim()}\n\n${RULES}`;
}

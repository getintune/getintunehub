import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { WorkMessage } from "../connectors/outlook/index.js";
import type { Hub } from "../hub.js";

/**
 * Workshop sign-ups from the "new registration" emails Wix and Eventbrite send to info@. Each new one becomes a
 * suggestion on the dashboard ("Add Nora Example to the workshop list?"); nothing is added until she clicks Add.
 * People already on the workshop list (same email) are skipped.
 */
export interface SignupSuggestion {
  messageId: string;
  name: string;
  email: string;
  source: "Website (Wix)" | "Eventbrite";
  /** The workshop it's for: the newest workshop on her list. */
  event: string;
  at: string;
}

export function signupSource(m: Pick<WorkMessage, "from" | "subject">): SignupSuggestion["source"] | null {
  const from = `${m.from.address} ${m.from.name}`;
  if (!/registration|registered|new order|rsvp|ticket|signed up/i.test(m.subject)) return null;
  if (/eventbrite/i.test(from)) return "Eventbrite";
  if (/wix/i.test(from)) return "Website (Wix)";
  return null;
}

/** Name and email of the person who signed up, from the email's text (not the sender's or her own address). */
export function parseSignup(text: string, ignore: string[] = []): { name: string; email: string } | null {
  const skip = (e: string) => ignore.includes(e) || /no-?reply|eventbrite|wix\.com|getintune/i.test(e);
  const emails = [...text.matchAll(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g)].map((x) => x[0].toLowerCase()).filter((e) => !skip(e));
  if (!emails.length) return null;
  const named =
    text.match(/(?:Attendee|Name|Guest|Buyer)[ \t]*:[ \t]*([A-Z][\p{L}'’-]+(?:[ \t]+[A-Z][\p{L}'’-]+){0,3})/u) ??
    text.match(/([A-Z][\p{L}'’-]+(?:[ \t]+[A-Z][\p{L}'’-]+){1,3})[ \t]+(?:just[ \t]+)?(?:registered|signed up|has registered)/u);
  return { name: named?.[1]?.trim() ?? emails[0].split("@")[0], email: emails[0] };
}

/** The workshop a registration email is for: "New Order for Suddenly Untethered: The ..." -> "Suddenly Untethered". */
export function eventFromSubject(subject: string): string {
  const m = subject.match(/(?:\bfor|registration:|registered:|rsvp:)\s*(.+?)(?:\s*[:–—|-]\s|$)/i);
  return m?.[1]?.trim() ?? "";
}

const stateFile = (hub: Hub) => path.join(hub.cfg.stateDir, "signups-dismissed.json");
const dismissed = (hub: Hub): Record<string, string> => {
  try {
    return existsSync(stateFile(hub)) ? JSON.parse(readFileSync(stateFile(hub), "utf8")) : {};
  } catch {
    return {};
  }
};
export function dismissSignup(hub: Hub, messageId: string) {
  const d = dismissed(hub);
  d[messageId] = new Date().toISOString();
  mkdirSync(hub.cfg.stateDir, { recursive: true });
  writeFileSync(stateFile(hub), JSON.stringify(d));
}

/** New sign-ups from the last `days` days of info@ (two months: catches everyone since marketing began), not on the workshop list yet and not dismissed. */
export async function signupSuggestions(hub: Hub, days = 60, now = new Date()): Promise<SignupSuggestion[]> {
  const boxes = hub.outlook.mailboxes();
  const box = boxes.find((b) => b.startsWith("info@")) ?? boxes[0];
  if (!box || !hub.outlook.connected()) return [];
  const workshop = hub.lists.list("workshop");
  const have = new Set(workshop.map((e) => e.email.toLowerCase()).filter(Boolean));
  const newest = [...workshop].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.extra.event;
  const d = dismissed(hub);
  const out: SignupSuggestion[] = [];
  const since = new Date(now.getTime() - days * 864e5).toISOString();
  for (const m of await hub.outlook.since(box, since, 100)) {
    const source = signupSource(m);
    if (!source || d[m.id]) continue;
    const full = m.body ?? (await hub.outlook.get(box, m.id).catch(() => m)).body ?? m.preview;
    const p = parseSignup(`${m.subject}\n${full}`, boxes);
    if (!p || have.has(p.email) || out.some((x) => x.email === p.email)) continue;
    // The list's own name for the workshop when the email names the same one, so they count together.
    const named = eventFromSubject(m.subject);
    const event = newest && (!named || newest.toLowerCase().startsWith(named.toLowerCase())) ? newest : named || newest || "Workshop";
    out.push({ messageId: m.id, ...p, source, event, at: m.receivedAt });
  }
  return out;
}

/** Adds a suggested sign-up to the workshop list (she clicked Add). */
export function acceptSignup(hub: Hub, s: Pick<SignupSuggestion, "messageId" | "name" | "email" | "source" | "event">) {
  const e = hub.lists.add("workshop", { name: s.name, email: s.email, stage: "Signed up", extra: { event: s.event, source: s.source, paid: "Yes" } });
  dismissSignup(hub, s.messageId);
  return e;
}

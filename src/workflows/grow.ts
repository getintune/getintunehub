import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { WorkMessage } from "../connectors/outlook/index.js";
import type { Hub } from "../hub.js";

/**
 * Grow Therapy alerts from the info@ mailbox. Marlys's rule (HIPAA, 2026-11-07): the app may only tell her about
 *   1. a new client, shown by initials only,
 *   2. a client changing a session time,
 *   3. a new message waiting in Grow,
 *   4. Grow itself asking her to do something (re-credentialing, paperwork, ...).
 * Nothing else. An alert keeps no subject, preview or full name: only the kind, initials when the email gives a
 * name, when it came, and the link to open it in Outlook (where the details stay). Other Grow email (newsletters,
 * marketing) is ignored.
 */
export type GrowKind = "new-client" | "schedule" | "message" | "action";

export interface GrowAlert {
  id: string;
  kind: GrowKind;
  /** e.g. "New client: J.R." */
  title: string;
  initials?: string;
  at: string;
  webLink: string;
}

export const GROW_LABELS: Record<GrowKind, string> = {
  "new-client": "New client",
  schedule: "Session time changed",
  message: "New message in Grow",
  action: "Grow needs you to do something",
};

export const isGrow = (m: Pick<WorkMessage, "from">) => /growtherapy|grow therapy/i.test(`${m.from.address} ${m.from.name}`);

/** Which of the four kinds an email is, or null (not one of hers to know about). Checked most specific first. */
export function growKind(m: Pick<WorkMessage, "from" | "subject" | "preview">): GrowKind | null {
  if (!isGrow(m)) return null;
  const t = `${m.subject}\n${m.preview}`;
  if (/newsletter|webinar|ce course|unsubscribe from (our )?marketing/i.test(m.subject)) return null;
  if (/\bnew client\b|matched with a new|new referral|booked (their|a) first (session|appointment)/i.test(t)) return "new-client";
  if (/reschedul|cancel+ed (their|a|the) (session|appointment)|session (time )?(changed|moved)|appointment (time )?(changed|moved)|time change/i.test(t)) return "schedule";
  if (/new (secure )?message|sent you a message|unread message/i.test(t)) return "message";
  if (/action (required|needed)|re-?credential|credentialing|attest|expir|complete your|update your|verify|sign (the|your)|license|caqh|missing (info|document)/i.test(t)) return "action";
  return null;
}

/** Initials of a client the email names ("client, Jordan Rivera." -> "J.R."); already-initials kept (A.R.). */
export function clientInitials(text: string): string | undefined {
  const already = text.match(/\b([A-Z])\.\s?([A-Z])\.(?=\s|$|,)/);
  if (already) return `${already[1]}.${already[2]}.`;
  const named = text.match(/(?:new client|client|with)[,:]?[ \t]+([A-Z][a-z'’-]+)[ \t]+([A-Z])[a-z'’-]*\b/);
  return named ? `${named[1][0]}.${named[2]}.` : undefined;
}

const stateFile = (hub: Hub) => path.join(hub.cfg.stateDir, "grow-dismissed.json");
const dismissed = (hub: Hub): Record<string, string> => {
  try {
    return existsSync(stateFile(hub)) ? JSON.parse(readFileSync(stateFile(hub), "utf8")) : {};
  } catch {
    return {};
  }
};
export function dismissGrow(hub: Hub, id: string) {
  const d = dismissed(hub);
  d[id] = new Date().toISOString();
  mkdirSync(hub.cfg.stateDir, { recursive: true });
  writeFileSync(stateFile(hub), JSON.stringify(d));
}

export function toAlert(m: WorkMessage): GrowAlert | null {
  const kind = growKind(m);
  if (!kind) return null;
  const initials = kind === "new-client" || kind === "schedule" ? clientInitials(`${m.subject}\n${m.preview}`) : undefined;
  return { id: m.id, kind, title: `${GROW_LABELS[kind]}${initials ? `: ${initials}` : ""}`, initials, at: m.receivedAt, webLink: m.webLink };
}

/** Grow alerts from the last `days` days in the info@ mailbox (the second mailbox, else the first), not yet dismissed. */
export async function growAlerts(hub: Hub, days = 7, now = new Date()): Promise<GrowAlert[]> {
  const boxes = hub.outlook.mailboxes();
  const box = boxes.find((b) => b.startsWith("info@")) ?? boxes[0];
  if (!box || !hub.outlook.connected()) return [];
  const since = new Date(now.getTime() - days * 864e5).toISOString();
  const d = dismissed(hub);
  return (await hub.outlook.since(box, since, 100)).map(toAlert).filter((a): a is GrowAlert => !!a && !d[a.id]);
}

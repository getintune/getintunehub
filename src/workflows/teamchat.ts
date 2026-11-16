import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ThreadSummary } from "../connectors/gmail/index.js";
import type { Hub } from "../hub.js";
import { friendlyGoogleError } from "../connectors/google/auth.js";

/**
 * Team messages from Google Chat. Marlys's Chat is on a personal @gmail.com account, which Google's Chat API doesn't
 * serve, so the app reads the email notifications Chat sends to her Gmail for messages she hasn't read (she turned
 * them on, 2026-11-16). Read-only: the app never posts in Chat. Shown on her Mac only; not sent to Gemini.
 */
export const CHAT_URL = "https://mail.google.com/chat/u/0/";

export interface TeamMessage {
  id: string;
  /** Who wrote ("Kristin Example"), or the space's name. */
  who: string;
  /** The space or group, when the email names one. */
  where?: string;
  preview: string;
  at: string;
  /** The notification email in Gmail (it has the link into the conversation). */
  link: string;
}

export const isChatNotice = (t: Pick<ThreadSummary, "from" | "subject">) => /chat-noreply@google\.com|google chat/i.test(t.from);

/** Who wrote and where, from the notification's sender name and subject. */
export function chatNotice(t: ThreadSummary): TeamMessage | null {
  if (!isChatNotice(t)) return null;
  const name = t.from.replace(/<[^>]*>/, "").replace(/["']/g, "").replace(/\((via )?google chat\)/i, "").trim();
  const s = t.subject.trim();
  const sent = s.match(/^(.+?) (?:sent you a message|sent a message|messaged you|mentioned you|replied)(?: in (.+))?$/i);
  const unread = s.match(/(?:unread|new) messages? (?:in|from) (.+)$/i);
  const who = sent?.[1] ?? (name && !/^google chat$/i.test(name) ? name : unread?.[1] ?? "Google Chat");
  const where = sent?.[2] ?? (unread && unread[1] !== who ? unread[1] : undefined);
  return { id: t.id, who: who.trim(), ...(where ? { where: where.trim() } : {}), preview: t.snippet.trim().slice(0, 200), at: t.date, link: `https://mail.google.com/mail/u/0/#all/${t.id}` };
}

const PRACTICE: ThreadSummary[] = [
  { id: "chat-practice-1", from: "Kristin Example (via Google Chat) <chat-noreply@google.com>", subject: "Kristin Example sent you a message", date: new Date(Date.now() - 2 * 3600e3).toISOString(), snippet: "Quick question on the newsletter task: do you want the workshop photos in this week's or next week's?", messageCount: 1 },
  { id: "chat-practice-2", from: "Google Chat <chat-noreply@google.com>", subject: "Frankie Example mentioned you in Content team", date: new Date(Date.now() - 20 * 3600e3).toISOString(), snippet: "@Marlys can you look at the reel draft before Thursday?", messageCount: 1 },
];

const stateFile = (hub: Hub) => path.join(hub.cfg.stateDir, "teamchat-dismissed.json");
const dismissed = (hub: Hub): Record<string, string> => {
  try {
    return existsSync(stateFile(hub)) ? JSON.parse(readFileSync(stateFile(hub), "utf8")) : {};
  } catch {
    return {};
  }
};
export function dismissTeamMessage(hub: Hub, id: string) {
  const d = dismissed(hub);
  d[id] = new Date().toISOString();
  mkdirSync(hub.cfg.stateDir, { recursive: true });
  writeFileSync(stateFile(hub), JSON.stringify(d));
}

/** The last week's Chat notifications she hasn't cleared. `connected` is false when Gmail isn't connected yet. */
export async function teamMessages(hub: Hub): Promise<{ connected: boolean; messages: TeamMessage[] }> {
  const practice = hub.gmail.kind === "mock";
  if (practice && hub.cfg.mode !== "mock") return { connected: false, messages: [] };
  const threads = practice
    ? PRACTICE
    : await hub.gmail.search("from:chat-noreply@google.com newer_than:7d", 15).catch((e) => {
        throw new Error(friendlyGoogleError(String((e as Error).message ?? e)));
      });
  const gone = dismissed(hub);
  const messages = threads.map(chatNotice).filter((m): m is TeamMessage => !!m && !gone[m.id]);
  return { connected: true, messages: messages.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)) };
}

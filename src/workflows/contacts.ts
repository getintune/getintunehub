import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Message } from "../connectors/gmail/types.js";
import type { Hub } from "../hub.js";
import { isAutomated } from "./mailkind.js";

/**
 * The owner's contacts, built up on their own: every person who shows up on an email the app reads (from, to, cc).
 * Each person fills out as more turns up: phones from email signatures, when they last emailed. Which of her lists
 * they're on (coaching client, workshop sign-up, ...) is looked up from the lists when they're shown. Kept in
 * .hub/contacts.json.
 */
export interface Person {
  id: string; // the first email seen, lowercased
  name: string;
  emails: string[];
  phones: { number: string; label?: string; from: "email" | "list" }[];
  title?: string;
  company?: string;
  /** Her lists this person is on (filled in when shown, never stored). */
  lists?: { id: string; program: string; list: string; stage: string }[];
  emailCount: number;
  firstSeen: string;
  lastSeen: string;
  lastEmailAt?: string;
}

interface Store {
  people: Record<string, Person>;
}

const file = (hub: Hub) => path.join(hub.cfg.stateDir, "contacts.json");
let cache: { dir: string; s: Store } | null = null;
let dirty: NodeJS.Timeout | null = null;

function load(hub: Hub): Store {
  if (cache?.dir === hub.cfg.stateDir) return cache.s;
  let s: Store = { people: {} };
  try {
    if (existsSync(file(hub))) s = JSON.parse(readFileSync(file(hub), "utf8"));
  } catch {
    // start over
  }
  cache = { dir: hub.cfg.stateDir, s };
  return s;
}
function save(hub: Hub, now = false) {
  const write = () => {
    mkdirSync(hub.cfg.stateDir, { recursive: true });
    writeFileSync(file(hub), JSON.stringify(load(hub), null, 1));
    dirty = null;
  };
  if (now) return write();
  if (!dirty) {
    dirty = setTimeout(write, 1500);
    dirty.unref?.();
  }
}
export function flushContacts(hub: Hub) {
  if (dirty) clearTimeout(dirty);
  save(hub, true);
}

const addr = (s: string) => s.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0]?.toLowerCase() ?? "";
const nameOf = (s: string) => s.replace(/<.*>/, "").replace(/["']/g, "").trim();
const digits = (p: string) => p.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
export const fmtPhone = (p: string) => {
  const d = digits(p);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p.trim();
};
const titleCase = (n: string) => (n === n.toUpperCase() || n === n.toLowerCase() ? n.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : n);
/** "Doe, Jane" -> "Jane Doe". */
const cleanName = (n: string) => {
  const s = nameOf(n);
  if (!s || s.includes("@")) return "";
  const m = s.match(/^([^,]+),\s*([^,]+)$/);
  return titleCase(m ? `${m[2]} ${m[1]}` : s);
};

/** Addresses that aren't people worth keeping: the owner's own addresses and no-reply senders. */
function skip(hub: Hub, email: string, display = "") {
  const mine = [hub.cfg.gmail.address, hub.cfg.profile.email].map((a) => a.toLowerCase());
  return !email || mine.includes(email) || isAutomated(display ? `${display} <${email}>` : email, "", "");
}

function find(s: Store, o: { email?: string }): Person | undefined {
  if (o.email) {
    const e = o.email.toLowerCase();
    const hit = s.people[e] ?? Object.values(s.people).find((p) => p.emails.includes(e));
    if (hit) return hit;
  }
  return undefined;
}

function upsert(hub: Hub, o: { email?: string; name?: string; at?: string }): Person | null {
  const s = load(hub);
  const email = o.email?.toLowerCase();
  if (!email) return null;
  const now = o.at ?? new Date().toISOString();
  let p = find(s, { email });
  if (!p) {
    p = { id: email, name: "", emails: [], phones: [], emailCount: 0, firstSeen: now, lastSeen: now };
    s.people[p.id] = p;
  }
  if (email && !p.emails.includes(email)) p.emails.push(email);
  const n = o.name ? cleanName(o.name) : "";
  // Keep the fullest name seen (a real name beats "jsmith" and one-word names).
  if (n && (!p.name || (n.split(" ").length > p.name.split(" ").length && n.length > p.name.length))) p.name = n;
  if (now > p.lastSeen) p.lastSeen = now;
  return p;
}

function addPhone(p: Person, number: string, from: Person["phones"][number]["from"], label?: string) {
  const d = digits(number);
  if (d.length < 10 || /^0+$/.test(d)) return;
  const have = p.phones.find((x) => digits(x.number) === d);
  if (have) {
    if (label && !have.label) have.label = label;
    return;
  }
  p.phones.push({ number: fmtPhone(number), label, from });
}

/** Everyone on these emails. The sender's signature is read for a phone number. */
export function noteMessages(hub: Hub, messages: Message[]) {
  for (const m of messages) {
    const people = [m.from, ...m.to, ...m.cc, ...(m.bcc ?? [])];
    for (const x of people) {
      const e = addr(x);
      if (skip(hub, e, nameOf(x))) continue;
      const p = upsert(hub, { email: e, name: nameOf(x), at: m.date || undefined });
      if (p && x === m.from) {
        p.emailCount++;
        if (!p.lastEmailAt || m.date > p.lastEmailAt) p.lastEmailAt = m.date;
        for (const ph of signaturePhones(m.body)) addPhone(p, ph.number, "email", ph.label);
      }
    }
  }
  save(hub);
}

/** Just the senders and recipients of a list of threads (no bodies). */
export function noteAddresses(hub: Hub, list: { from: string; at?: string }[]) {
  for (const x of list) {
    for (const part of x.from.split(/,(?![^<]*>)/)) {
      const e = addr(part);
      if (!skip(hub, e, nameOf(part))) upsert(hub, { email: e, name: nameOf(part), at: x.at });
    }
  }
  save(hub);
}

/** Phone numbers in an email's signature (the last lines before any quoted reply). */
export function signaturePhones(body: string): { number: string; label?: string }[] {
  const main = String(body ?? "").replace(/\r/g, "").split(/\n(?:On .+wrote:|-{2,}\s*(?:Original|Forwarded) Message|From: .+\n(?:Sent|Date):)/)[0];
  const tail = main.split("\n").slice(-15).join("\n");
  const out: { number: string; label?: string }[] = [];
  // "O: (720) 555-0199 | F: 720-555-0100": each part of a line gets its own label, so a fax is left out.
  for (const line of tail.split(/\n|\s[|•·]\s|\s{3,}|\t/)) {
    for (const m of line.matchAll(/(?:\+?1[\s.-]?)?\(?\b(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})\b/g)) {
      const label = /\b(fax|f)\b\s*[:.]/i.test(line) || /\bfax\b/i.test(line) ? "fax" : /\b(cell|mobile|mob|c)\b\s*[:.]?/i.test(line) ? "mobile" : /\b(office|o|direct|d|work|main|tel|phone|p)\b\s*[:.]?/i.test(line) ? "office" : undefined;
      if (label === "fax") continue;
      out.push({ number: `${m[1]}${m[2]}${m[3]}`, label });
    }
  }
  return out.slice(0, 3);
}

export function allContacts(hub: Hub): Person[] {
  return Object.values(load(hub).people).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
}

/** Which of her lists a person is on, matched by email (initials-only lists never have emails, so never match). */
export function withLists(hub: Hub, p: Person): Person {
  const emails = new Set(p.emails);
  const on = hub.lists.list().filter((e) => e.email && emails.has(e.email.toLowerCase()));
  return { ...p, lists: on.map((e) => ({ id: e.id, program: e.program, list: hub.lists.program(e.program).name, stage: e.stage })) };
}

/** Finds people by name, email, company, phone, or a list they're on ("workshop", "coaching"). */
export async function findContacts(hub: Hub, q: string, o: { limit?: number } = {}): Promise<Person[]> {
  const query = q.trim();
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const qd = digits(query);
  const all = allContacts(hub).map((p) => withLists(hub, p));
  const hay = (p: Person) => [p.name, ...p.emails, p.company, p.title, ...(p.lists ?? []).flatMap((l) => [l.list, l.program, l.stage]), ...p.phones.map((x) => digits(x.number))].join(" ").toLowerCase();
  const list = all.filter((p) => !words.length || words.every((w) => hay(p).includes(w)) || (qd.length >= 4 && p.phones.some((x) => digits(x.number).includes(qd))));
  // Best first: name starts with the query, then people on her lists, then most recent.
  const score = (p: Person) => (words.length && p.name.toLowerCase().split(" ").some((n) => n.startsWith(words[0])) ? 2 : 0) + (p.lists?.length ? 1 : 0);
  return list.sort((a, b) => score(b) - score(a) || b.lastSeen.localeCompare(a.lastSeen)).slice(0, o.limit ?? 200);
}

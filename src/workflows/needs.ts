import type { Entry } from "../connectors/lists/index.js";
import { TIME_ZONE } from "../core/config.js";
import type { Hub } from "../hub.js";

/** One thing on her plate, from her lists. */
export interface Need {
  kind: "next" | "waiting";
  id: string;
  program: string;
  list: string;
  name: string;
  stage: string;
  /** What to do, in a few words. */
  title: string;
  /** Days overdue (next) or days at this stage (waiting). */
  days: number;
  /** YYYY-MM-DD the next step was due, for "next". */
  due?: string;
}

/**
 * People sitting at a stage longer than this get a nudge, with what to do. Lists or stages not here never nag.
 * Workshop follow-ups aren't here: Kristin's Wix emails send those.
 */
export const WAITING: Record<string, Record<string, { days: number; title: string }>> = {
  therapy: { "New client": { days: 2, title: "Check the new client's intake in Grow" } },
  coaching: {
    Inquiry: { days: 2, title: "Reply and offer a free consult" },
    "Consult done": { days: 3, title: "Follow up after the free consult" },
  },
  trainees: { Interested: { days: 3, title: "Answer and invite them to register" } },
  facilities: {
    Lead: { days: 5, title: "Reach out" },
    "Proposal sent": { days: 7, title: "Check in about the proposal" },
  },
};

const dayIn = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TIME_ZONE });
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);

/** What needs her today, most overdue first: next steps due today or before, then people waiting too long. */
export function needs(hub: Hub, now = new Date()): Need[] {
  const today = dayIn(now);
  const out: Need[] = [];
  for (const e of hub.lists.list()) {
    const p = hub.lists.program(e.program);
    if (p.done.includes(e.stage)) continue;
    const base = { id: e.id, program: e.program, list: p.name, name: e.name, stage: e.stage };
    if (e.nextDate && e.nextDate <= today) {
      out.push({ ...base, kind: "next", title: e.nextStep || "Next step", days: daysBetween(e.nextDate, today), due: e.nextDate });
      continue;
    }
    if (e.nextDate) continue; // she's already planned the next step
    const rule = WAITING[e.program]?.[e.stage];
    const at = daysBetween(dayIn(new Date(e.stageSince)), today);
    if (rule && at >= rule.days) out.push({ ...base, kind: "waiting", title: rule.title, days: at });
  }
  return out.sort((a, b) => (a.kind === b.kind ? b.days - a.days : a.kind === "next" ? -1 : 1));
}

export interface ListCount {
  id: string;
  name: string;
  word: string;
  total: number;
  open: number;
  byStage: { stage: string; count: number }[];
}

export interface WorkshopCount {
  event: string;
  total: number;
  /** Signed up in the last 24 hours. */
  newToday: number;
  bySource: { source: string; count: number }[];
}

/** Counts per list and stage, and workshop sign-ups per workshop and by where they signed up. */
export function listCounts(hub: Hub, now = new Date()): { lists: ListCount[]; workshops: WorkshopCount[] } {
  const all = hub.lists.list();
  const lists = hub.lists.programs().map((p) => {
    const es = all.filter((e) => e.program === p.id);
    return { id: p.id, name: p.name, word: p.word, total: es.length, open: es.filter((e) => !p.done.includes(e.stage)).length, byStage: p.stages.map((stage) => ({ stage, count: es.filter((e) => e.stage === stage).length })) };
  });
  const byEvent = new Map<string, Entry[]>();
  for (const e of all.filter((x) => x.program === "workshop")) {
    const k = e.extra.event || "Workshop";
    byEvent.set(k, [...(byEvent.get(k) ?? []), e]);
  }
  const workshops = [...byEvent.entries()].map(([event, es]) => {
    const src = new Map<string, number>();
    for (const e of es) src.set(e.extra.source || "Not recorded", (src.get(e.extra.source || "Not recorded") ?? 0) + 1);
    return {
      event,
      total: es.length,
      newToday: es.filter((e) => now.getTime() - Date.parse(e.createdAt) < 864e5).length,
      bySource: [...src.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
    };
  });
  return { lists, workshops: workshops.sort((a, b) => b.total - a.total) };
}

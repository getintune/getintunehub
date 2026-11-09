import type { MotionTask, NewMotionTask } from "../connectors/motion/index.js";
import { confirmText } from "../core/approval.js";
import { TIME_ZONE } from "../core/config.js";
import type { Hub } from "../hub.js";

const day = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("en-CA", { timeZone: TIME_ZONE });

/**
 * Her Motion day: what Motion has scheduled for today (in time order), then anything past its deadline that Motion
 * hasn't fitted in today. Motion decides the times; this only reads them.
 */
export async function motionToday(hub: Hub, now = new Date()): Promise<{ scheduled: MotionTask[]; overdue: MotionTask[] }> {
  const today = day(now.toISOString());
  const mine = await hub.motion.tasks();
  const scheduled = mine.filter((t) => t.scheduledStart && day(t.scheduledStart) === today).sort((a, b) => a.scheduledStart!.localeCompare(b.scheduledStart!));
  const overdue = mine.filter((t) => !scheduled.includes(t) && t.dueDate && day(t.dueDate) < today);
  return { scheduled, overdue };
}

/** The team's open tasks for the next week (not hers), by person: to see what Kristin and Frankie have on. */
export async function motionTeam(hub: Hub, now = new Date(), days = 7): Promise<{ person: string; tasks: MotionTask[] }[]> {
  const until = day(new Date(now.getTime() + days * 864e5).toISOString());
  const all = (await hub.motion.tasks({ team: true })).filter((t) => !t.mine);
  const soon = all.filter((t) => { const d = t.scheduledStart ?? t.dueDate; return !d || day(d) <= until; });
  const people = new Map<string, MotionTask[]>();
  for (const t of soon) for (const p of t.assignees.length ? t.assignees : ["Unassigned"]) people.set(p, [...(people.get(p) ?? []), t]);
  return [...people.entries()]
    .map(([person, tasks]) => ({ person, tasks: tasks.sort((a, b) => (a.scheduledStart ?? a.dueDate ?? "9").localeCompare(b.scheduledStart ?? b.dueDate ?? "9")) }))
    .sort((a, b) => a.person.localeCompare(b.person));
}

/**
 * Adds a task to her Motion after she says Yes (she can edit the name on the card). Motion then fits it into her
 * schedule. Returns null when she says no.
 */
export async function addToMotion(hub: Hub, t: NewMotionTask): Promise<MotionTask | null> {
  const name = await confirmText(hub.approver, "Add this task to Motion? Motion will fit it into your schedule.", [t.dueDate ? `Due ${t.dueDate}` : "No deadline", `About ${t.duration ?? 30} minutes`], t.name);
  if (name === null || !name.trim()) return null;
  return hub.motion.create({ ...t, name: name.trim() });
}

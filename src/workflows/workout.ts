import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { TIME_ZONE } from "../core/config.js";
import type { Hub } from "../hub.js";

/**
 * Today's workout, as Bevel planned it. Bevel has no way for other apps to read its plans, so she types or pastes it
 * into the dashboard box; it then goes into Plan my day, and she can send it to Motion to get a time slot.
 * One per day: a new day starts empty.
 */
export interface Workout {
  date: string;
  text: string;
  minutes?: number;
}

const file = (hub: Hub) => path.join(hub.cfg.stateDir, "workout.json");
const today = (now = new Date()) => now.toLocaleDateString("en-CA", { timeZone: TIME_ZONE });

/** The workout saved for today, or null. */
export function todaysWorkout(hub: Hub, now = new Date()): Workout | null {
  try {
    const w = existsSync(file(hub)) ? (JSON.parse(readFileSync(file(hub), "utf8")) as Workout) : null;
    return w && w.date === today(now) && w.text.trim() ? w : null;
  } catch {
    return null;
  }
}

/** Saves (or clears, with empty text) today's workout. Minutes are read from the text when not given ("40 min"). */
export function saveWorkout(hub: Hub, text: string, minutes?: number, now = new Date()): Workout | null {
  const t = text.replace(/\s+/g, " ").trim().slice(0, 300);
  mkdirSync(hub.cfg.stateDir, { recursive: true });
  if (!t) {
    writeFileSync(file(hub), JSON.stringify({ date: today(now), text: "" }));
    return null;
  }
  const found = t.match(/(\d{1,3})\s*(?:min|mins|minutes)\b/i) ?? t.match(/(\d(?:\.\d)?)\s*(?:h|hr|hrs|hours?)\b/i);
  const m = minutes ?? (found ? (/h/i.test(found[0]) ? Math.round(parseFloat(found[1]) * 60) : Number(found[1])) : undefined);
  const w: Workout = { date: today(now), text: t, ...(m ? { minutes: m } : {}) };
  writeFileSync(file(hub), JSON.stringify(w));
  return w;
}

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { TIME_ZONE } from "../core/config.js";
import type { Hub } from "../hub.js";

/**
 * Keeping the app's Claude costs low and visible. Claude inside the app is billed per use to her Anthropic API key
 * (with a monthly cap she sets at console.anthropic.com → Limits). Every Claude run is recorded here with its cost
 * (the SDK's `total_cost_usd`), and each background feature has an on/off switch on the dashboard.
 */

/** Background features: Claude runs on its own for these, so each can be switched off. */
export const FEATURES = {
  summaries: { label: "One-line email summaries", hint: "A short line under each email in the Gmail tab. Uses the fast, cheap model.", default: true, env: "HUB_MAIL_SUMMARIES" },
  emailTasks: { label: "Tasks from new email", hint: "Claude reads new email and adds a task when someone asks you for something. Uses the fast model.", default: false, env: "HUB_EMAIL_TASKS" },
  morningBrief: { label: "Morning brief", hint: "Plans your day on its own at 7 AM on weekdays. Uses the bigger model, about one run a day.", default: true, env: "HUB_BRIEF_TIME" },
} as const;
export type Feature = keyof typeof FEATURES;

/** What a Claude run was for, for the cost meter. */
export type Use = "ask" | "brief" | Exclude<Feature, "morningBrief">;
export const USE_LABELS: Record<Use, string> = { ask: "Ask Claude", brief: "Daily brief", summaries: "Email summaries", emailTasks: "Tasks from email" };

const settingsFile = (hub: Hub) => path.join(hub.cfg.stateDir, "settings.json");
const costsFile = (hub: Hub) => path.join(hub.cfg.stateDir, "claude-costs.json");

function readJson<T>(file: string, fallback: T): T {
  try {
    return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(file: string, data: unknown) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2));
}

/** The switches as she set them (missing ones use their default). */
export function featureSettings(hub: Hub): Record<Feature, boolean> {
  const saved = readJson<{ features?: Partial<Record<Feature, boolean>> }>(settingsFile(hub), {}).features ?? {};
  return Object.fromEntries((Object.keys(FEATURES) as Feature[]).map((f) => [f, saved[f] ?? FEATURES[f].default])) as Record<Feature, boolean>;
}

/** Is this background feature on? Off when there's no API key, when switched off on the dashboard, or when .env says "off". */
export function featureOn(hub: Hub, f: Feature): boolean {
  if (!hub.cfg.anthropicApiKey) return false;
  if ((process.env[FEATURES[f].env] ?? "").trim().toLowerCase() === "off") return false;
  return featureSettings(hub)[f];
}

export function setFeature(hub: Hub, f: Feature, on: boolean) {
  if (!(f in FEATURES)) throw new Error(`No such setting: ${f}`);
  const s = readJson<{ features?: Partial<Record<Feature, boolean>> }>(settingsFile(hub), {});
  writeJson(settingsFile(hub), { ...s, features: { ...(s.features ?? {}), [f]: on } });
}

interface CostRow {
  at: string;
  use: Use;
  usd: number;
  model?: string;
}

/** Records one Claude run's cost. Call it with the SDK's result message. */
export function recordCost(hub: Hub, use: Use, result: { total_cost_usd?: number } | unknown, model?: string, now = new Date()) {
  const usd = Number((result as { total_cost_usd?: number })?.total_cost_usd ?? 0);
  if (!Number.isFinite(usd) || usd <= 0) return;
  const rows = readJson<CostRow[]>(costsFile(hub), []);
  rows.push({ at: now.toISOString(), use, usd, model });
  // Keep about a year of runs; the meter only needs this month.
  writeJson(costsFile(hub), rows.slice(-20000));
}

const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TIME_ZONE });

/** Spending today and this month (her time zone), with this month split by what it was for. */
export function costSummary(hub: Hub, now = new Date()) {
  const rows = readJson<CostRow[]>(costsFile(hub), []);
  const today = day(now), month = today.slice(0, 7);
  const inMonth = rows.filter((r) => day(new Date(r.at)).slice(0, 7) === month);
  const sum = (rs: CostRow[]) => Math.round(rs.reduce((t, r) => t + r.usd, 0) * 10000) / 10000;
  const byUse = (Object.keys(USE_LABELS) as Use[])
    .map((u) => ({ use: u, label: USE_LABELS[u], usd: sum(inMonth.filter((r) => r.use === u)), runs: inMonth.filter((r) => r.use === u).length }))
    .filter((x) => x.runs);
  return { today: sum(inMonth.filter((r) => day(new Date(r.at)) === today)), month: sum(inMonth), runs: inMonth.length, byUse };
}

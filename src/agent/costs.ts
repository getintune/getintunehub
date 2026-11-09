import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { TIME_ZONE } from "../core/config.js";
import type { Hub } from "../hub.js";

/**
 * The app's agent runs on Google Gemini's free tier (GEMINI_API_KEY), so runs cost $0.00. Each run is still recorded
 * (what it was for, and how much text went in and out) so she can see how much it's used against the free limits,
 * and each background feature has an on/off switch on the dashboard. They start OFF: on the free tier Google may
 * use what's sent to improve its products, so she switches on only what she's comfortable sending.
 */

/** Background features: Claude runs on its own for these, so each can be switched off. */
export const FEATURES = {
  summaries: { label: "One-line email summaries", hint: "A short line under each email in the Gmail tab. Sends each email's text to Gemini.", default: false, env: "HUB_MAIL_SUMMARIES" },
  emailTasks: { label: "Tasks from new email", hint: "Gemini reads new Gmail and adds a task when someone asks you for something.", default: false, env: "HUB_EMAIL_TASKS" },
  morningBrief: { label: "Morning brief", hint: "Plans your day on its own at 7 AM on weekdays (about one run a day).", default: false, env: "HUB_BRIEF_TIME" },
} as const;
export type Feature = keyof typeof FEATURES;

/** What a Claude run was for, for the cost meter. */
export type Use = "ask" | "brief" | Exclude<Feature, "morningBrief">;
export const USE_LABELS: Record<Use, string> = { ask: "Ask", brief: "Daily brief", summaries: "Email summaries", emailTasks: "Tasks from email" };

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

/** Is this background feature on? Off when there's no Gemini key, when switched off on the dashboard, or when .env says "off". */
export function featureOn(hub: Hub, f: Feature): boolean {
  if (!hub.gemini.connected()) return false;
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
  /** Always 0 on Gemini's free tier. */
  usd: number;
  tokens?: { input: number; output: number };
  model?: string;
}

/** Records one agent run: what it was for and how much text went in and out. Free tier: $0.00. */
export function recordCost(hub: Hub, use: Use, run: { tokens?: { input: number; output: number }; usd?: number }, model?: string, now = new Date()) {
  const tokens = run.tokens ?? { input: 0, output: 0 };
  if (!tokens.input && !tokens.output && !run.usd) return;
  const rows = readJson<CostRow[]>(costsFile(hub), []);
  rows.push({ at: now.toISOString(), use, usd: run.usd ?? 0, tokens, model });
  // Keep about a year of runs; the meter only needs this month.
  writeJson(costsFile(hub), rows.slice(-20000));
}

const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TIME_ZONE });

/** Use today and this month (her time zone): runs, text in/out, and cost ($0.00 on the free tier), split by what it was for. */
export function costSummary(hub: Hub, now = new Date()) {
  const rows = readJson<CostRow[]>(costsFile(hub), []);
  const today = day(now), month = today.slice(0, 7);
  const inMonth = rows.filter((r) => day(new Date(r.at)).slice(0, 7) === month);
  const inToday = inMonth.filter((r) => day(new Date(r.at)) === today);
  const sum = (rs: CostRow[]) => Math.round(rs.reduce((t, r) => t + (r.usd || 0), 0) * 10000) / 10000;
  const tok = (rs: CostRow[]) => rs.reduce((t, r) => t + (r.tokens?.input ?? 0) + (r.tokens?.output ?? 0), 0);
  const byUse = (Object.keys(USE_LABELS) as Use[])
    .map((u) => { const rs = inMonth.filter((r) => r.use === u); return { use: u, label: USE_LABELS[u], usd: sum(rs), runs: rs.length, tokens: tok(rs) }; })
    .filter((x) => x.runs);
  return { today: sum(inToday), month: sum(inMonth), runs: inMonth.length, runsToday: inToday.length, tokens: tok(inMonth), byUse, provider: "Google Gemini (free tier)" };
}

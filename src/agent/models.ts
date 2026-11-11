import type { Hub } from "../hub.js";
import { geminiModel } from "../core/config.js";

/**
 * Which Gemini model the app's agent uses (Ask, Plan my day). Marlys picks it in the Gemini card; it's saved to .env
 * on her Mac (HUB_MODEL) and used right away, no restart.
 */
export interface ModelChoice {
  id: string;
  label: string;
}

/** What each kind of model is good for, in plain words. */
export function describeModel(id: string): string {
  const v = id.match(/gemini-([\d.]+)/)?.[1] ?? "";
  const kind = /-flash-lite$/.test(id) ? "Flash-Lite (fastest, least busy, simpler answers)" : /-flash$/.test(id) ? "Flash (the usual)" : /-pro$/.test(id) ? "Pro (smartest, small free limit)" : id;
  return v ? `Gemini ${v} ${kind}` : kind;
}

/** Text models worth offering: plain gemini-N(.N)-flash / -flash-lite / -pro, newest first. */
export function pickChoices(names: string[], current: string): ModelChoice[] {
  const ids = new Set(names.map((n) => n.replace(/^models\//, "")).filter((n) => /^gemini-\d+(\.\d+)?-(flash|flash-lite|pro)$/.test(n)));
  ids.add(current);
  const rank = (n: string) => (/-flash$/.test(n) ? 0 : /-flash-lite$/.test(n) ? 1 : 2);
  return [...ids]
    .sort((a, b) => parseFloat(b.slice(7)) - parseFloat(a.slice(7)) || rank(a) - rank(b))
    .slice(0, 9)
    .map((id) => ({ id, label: describeModel(id) }));
}

export async function modelChoices(hub: Hub): Promise<ModelChoice[]> {
  const names = (await hub.gemini.models?.().catch(() => [] as string[])) ?? [];
  const fallback = ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite"];
  return pickChoices(names.length ? names : fallback, hub.cfg.model);
}

/** Switch the main model now and remember it on her Mac. Returns the model used. */
export async function setModel(hub: Hub, model: string, save: (vars: Record<string, string>) => void): Promise<string> {
  const m = String(model ?? "").trim();
  if (geminiModel(m, "") !== m || !/^[\w.-]+$/.test(m)) throw new Error("That isn't a Gemini model name.");
  hub.cfg.model = m;
  save({ HUB_MODEL: m });
  return m;
}

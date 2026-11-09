import type { Hub } from "../hub.js";

/**
 * Where the app's own agent sends its requests: Google's Gemini API, with the key from GEMINI_API_KEY in the app's
 * .env (never uploaded). HUB_GEMINI_BASE_URL in .env points it somewhere else only when she chooses to.
 */
export function agentEndpoint(): string {
  return process.env.HUB_GEMINI_BASE_URL?.trim() || "https://generativelanguage.googleapis.com";
}

/** The key the agent uses: GEMINI_API_KEY from the app's .env (blank = agent off). */
export function geminiKey(hub: Hub): string {
  return hub.cfg.geminiApiKey;
}

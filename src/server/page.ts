import type { Profile } from "../core/config.js";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Fills the page's placeholders with the owner's profile: {{APP_NAME}}, {{BUSINESS}}, {{OWNER}}, {{FIRST}},
 * {{INITIAL}}, {{EMAIL}}, plus any `extra` (e.g. {{GMAIL}}). Values are HTML-escaped, so a name from .env can't break the page.
 */
export function renderPage(html: string, p: Profile, extra: Record<string, string> = {}): string {
  const v: Record<string, string> = {
    APP_NAME: p.appName,
    BUSINESS: p.business,
    OWNER: p.owner,
    FIRST: p.first,
    INITIAL: (p.first || p.owner || "?").slice(0, 1).toUpperCase(),
    EMAIL: p.email,
    ...extra,
  };
  return html.replace(/\{\{([A-Z_]+)\}\}/g, (m, k: string) => (k in v ? esc(v[k]) : m));
}

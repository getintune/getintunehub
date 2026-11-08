import type { IncomingMessage } from "node:http";

/**
 * Only the app's own page may use the app. Her browser also has other websites open, and any of them could try to
 * send requests to 127.0.0.1:4317 (adding people to her lists, reading her mail through the page's routes, or a
 * trick called DNS rebinding). Three checks stop that:
 * - the address typed in the browser must be this computer (127.0.0.1 or localhost), not some other name;
 * - a request from a web page must come from the app's own page (its Origin);
 * - anything that changes something must be sent as JSON, which other sites can't do without the browser asking
 *   the app first (and the app never says yes).
 */
export function requestAllowed(req: Pick<IncomingMessage, "method" | "headers">, port: number): { ok: true } | { ok: false; why: string } {
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const host = String(req.headers.host ?? "").toLowerCase();
  if (!hosts.has(host)) return { ok: false, why: "This app only answers at http://127.0.0.1." };
  const origin = req.headers.origin;
  if (origin && !hosts.has(origin.toLowerCase().replace(/^https?:\/\//, ""))) return { ok: false, why: "Only the app's own page can do that." };
  const method = (req.method ?? "GET").toUpperCase();
  if (["POST", "PATCH", "PUT", "DELETE"].includes(method)) {
    const type = String(req.headers["content-type"] ?? "").toLowerCase();
    if (!type.startsWith("application/json")) return { ok: false, why: "Only the app's own page can do that." };
  }
  return { ok: true };
}

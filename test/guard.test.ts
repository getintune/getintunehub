import { describe, expect, it } from "vitest";
import { requestAllowed } from "../src/server/guard.js";

const req = (method: string, headers: Record<string, string>) => ({ method, headers });

describe("only the app's own page can use the app", () => {
  it("lets the app's page in", () => {
    expect(requestAllowed(req("GET", { host: "127.0.0.1:4317" }), 4317).ok).toBe(true);
    expect(requestAllowed(req("POST", { host: "127.0.0.1:4317", origin: "http://127.0.0.1:4317", "content-type": "application/json" }), 4317).ok).toBe(true);
    expect(requestAllowed(req("PATCH", { host: "localhost:4317", origin: "http://localhost:4317", "content-type": "application/json; charset=utf-8" }), 4317).ok).toBe(true);
  });

  it("turns away other websites and look-alike addresses", () => {
    expect(requestAllowed(req("POST", { host: "127.0.0.1:4317", origin: "https://evil.example", "content-type": "application/json" }), 4317).ok).toBe(false);
    expect(requestAllowed(req("POST", { host: "127.0.0.1:4317", "content-type": "text/plain" }), 4317).ok).toBe(false); // a form post from another site
    expect(requestAllowed(req("GET", { host: "evil.example:4317" }), 4317).ok).toBe(false); // DNS rebinding
    expect(requestAllowed(req("GET", {}), 4317).ok).toBe(false);
  });
});

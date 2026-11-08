import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { HUB_ROOT } from "../src/core/config.js";

describe("the page", () => {
  const html = readFileSync(`${HUB_ROOT}/src/server/ui.html`, "utf8");

  it("has a script with no syntax errors", () => {
    const i = html.indexOf("<script>\n"), j = html.lastIndexOf("</script>");
    expect(() => new vm.Script(html.slice(i + 8, j))).not.toThrow();
  });

  it("opens Claude in her own app when the app has no API key", () => {
    expect(html).toContain("https://claude.ai/new?q=");
    expect(html).toContain('if (!status.agent) return handoff({ kind: "ask", text: prompt });');
  });
});

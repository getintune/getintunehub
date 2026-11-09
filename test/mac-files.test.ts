import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HUB_ROOT } from "../src/core/config.js";

const file = (n: string) => path.join(HUB_ROOT, n);

describe("Mac setup and start files", () => {
  for (const n of ["Setup Get In Tune Hub.command", "Start Get In Tune Hub.command", "Connect Gmail.command", "Connect Outlook.command", "Connect Motion.command", "Connect Gemini.command"]) {
    it(`${n} can be double-clicked`, () => {
      expect(statSync(file(n)).mode & 0o111).not.toBe(0);
      expect(readFileSync(file(n), "utf8").startsWith("#!/bin/bash\n")).toBe(true);
    });
  }

  it("setup downloads her repo and starts the app on the right port", () => {
    expect(readFileSync(file("Setup Get In Tune Hub.command"), "utf8")).toContain("https://github.com/getintune/getintunehub.git");
    expect(readFileSync(file("Start Get In Tune Hub.command"), "utf8")).toContain("http://127.0.0.1:4317");
  });

  it("setup installs what's missing itself, and the start file updates the app each time", () => {
    const setup = readFileSync(file("Setup Get In Tune Hub.command"), "utf8");
    expect(setup).toContain("https://nodejs.org/dist/index.json");
    expect(setup).toContain("git-credential-manager");
    expect(setup).toContain("plan B");
    const start = readFileSync(file("Start Get In Tune Hub.command"), "utf8");
    expect(start).toMatch(/checkout -- package-lock\.json.*git pull --ff-only/);
  });
});

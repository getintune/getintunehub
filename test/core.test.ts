import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildMime, encodeHeader } from "../src/connectors/gmail/mime.js";
import { isAutomated } from "../src/workflows/mailkind.js";

const tmp = () => mkdtempSync(path.join(os.tmpdir(), "core-"));

describe("gmail mime", () => {
  it("has BCC, encoded subject and real attachments", () => {
    const dir = tmp();
    mkdirSync(dir, { recursive: true });
    const pdf = path.join(dir, "Workshop handout.pdf");
    writeFileSync(pdf, "%PDF-1.4 test");
    const raw = buildMime({ from: "Marlys <m@example.com>", to: ["a@b.com"], bcc: ["kristin@example.com"], subject: "Suddenly Untethered – your handout", body: "Hi Ana,\n\nAttached.", attachments: [pdf], messageId: "<x@y>", signatureHtml: "Marlys<br>Get In Tune" });
    expect(raw).toContain("Bcc: kristin@example.com");
    expect(raw).toContain(`Subject: ${encodeHeader("Suddenly Untethered – your handout")}`);
    expect(raw).toContain('filename="Workshop handout.pdf"');
    expect(raw).toContain(Buffer.from("%PDF-1.4 test").toString("base64"));
  });
});


describe("automatic emails", () => {
  it("spots no-reply senders and receipts, not people", () => {
    expect(isAutomated("no-reply@wix.com", "", "New order")).toBe(true);
    expect(isAutomated("a@b.com", "", "Your receipt from Get In Tune")).toBe(true);
    expect(isAutomated("kristin@getintunemusictherapy.com", "Kristin", "Workshop flyer")).toBe(false);
  });
});

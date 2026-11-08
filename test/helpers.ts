import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { FixedApprover } from "../src/core/approval.js";
import { HUB_ROOT, loadConfig } from "../src/core/config.js";
import { MockLists } from "../src/connectors/lists/index.js";
import { MockGmail } from "../src/connectors/gmail/mock.js";
import { MockCalendar } from "../src/connectors/calendar/index.js";
import { MockTasks } from "../src/connectors/tasks/index.js";
import { MockTravel } from "../src/connectors/travel/index.js";
import { MockWorkMail } from "../src/connectors/outlook/index.js";
import type { Hub } from "../src/hub.js";

/** A whole Hub on mocks and practice data, in a fresh temp folder. `answer` is how every Yes/No card is answered. */
export function testHub(answer = true) {
  const root = mkdtempSync(path.join(os.tmpdir(), "hub-test-"));
  const cfg = loadConfig({ HUB_MODE: "mock" }, root);
  const gmail = new MockGmail(cfg.stateDir);
  const approver = new FixedApprover(answer);
  const said: string[] = [];
  const hub: Hub = {
    cfg,
    lists: new MockLists(cfg.stateDir, path.join(HUB_ROOT, "fixtures", "lists.json")),
    outlook: new MockWorkMail(path.join(HUB_ROOT, "fixtures", "outlook.json"), cfg.outlook.mailboxes),
    gmail,
    calendar: new MockCalendar(cfg.stateDir),
    tasks: new MockTasks(cfg.stateDir),
    travel: new MockTravel(),
    approver,
    say: (m) => said.push(m),
  };
  return { hub, gmail, approver, said, root };
}

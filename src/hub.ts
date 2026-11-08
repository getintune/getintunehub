import { claudeEndpoint, ignoredRedirects } from "./agent/env.js";
import { makeTravel, type TravelClient } from "./connectors/travel/index.js";
import path from "node:path";
import { CliApprover, type Approver } from "./core/approval.js";
import { loadConfig, type Config } from "./core/config.js";
import { makeGmail, type MailClient } from "./connectors/gmail/index.js";
import { makeCalendar, type CalendarClient } from "./connectors/calendar/index.js";
import { makeTasks, type TasksClient } from "./connectors/tasks/index.js";
import { makeLists, type ListsClient } from "./connectors/lists/index.js";
import { makeWorkMail, type WorkMailClient } from "./connectors/outlook/index.js";

/** Everything a workflow or agent tool needs, in one place. Tests build one from mocks. */
export interface Hub {
  cfg: Config;
  /** Her lists: one per program (therapy, coaching, workshop, ...). */
  lists: ListsClient;
  /** Work email (Outlook / Microsoft 365), read-only. */
  outlook: WorkMailClient;
  gmail: MailClient;
  calendar: CalendarClient;
  tasks: TasksClient;
  travel: TravelClient;
  approver: Approver;
  say: (msg: string) => void;
}

export function makeHub(cfg: Config = loadConfig(), approver: Approver = new CliApprover()): Hub {
  return {
    cfg,
    lists: makeLists(cfg),
    outlook: makeWorkMail(cfg),
    gmail: makeGmail(cfg),
    calendar: makeCalendar(cfg),
    tasks: makeTasks(cfg),
    travel: makeTravel(cfg),
    approver,
    say: (m) => console.log(m),
  };
}

export function describe(hub: Hub): string[] {
  const c = hub.cfg;
  return [
    `mode        ${c.mode}`,
    `for         ${c.profile.owner}, ${c.profile.business} (${c.profile.timeZone})`,
    `lists       ${hub.lists.kind === "mock" ? "practice data" : path.join(c.dataDir, "lists.json")}`,
    `claude      ${c.anthropicApiKey ? `on (${c.model}), requests go to ${claudeEndpoint()}` : "off (no Anthropic API key in .env)"}${ignoredRedirects().length ? `  (ignoring ${ignoredRedirects().map((r) => r.name).join(", ")} set on this computer)` : ""}`,
    `outlook     ${hub.outlook.kind === "mock" ? "practice mail" : `${hub.cfg.outlook.mailboxes.join(", ")}${hub.outlook.connected() ? "" : "  (!) not signed in: Connect Outlook"}`}`,
    `gmail       ${hub.gmail.kind}${hub.gmail.kind === "mock" ? `  (drafts go to ${path.join(c.stateDir, "outbox")})` : ` ${c.gmail.address}`}`,
    `calendar    ${hub.calendar.kind}${hub.calendar.kind === "google" && !hub.calendar.connected() ? "  (!) reconnect Google to add Calendar" : ""}`,
    `tasks       ${hub.tasks.kind}${hub.tasks.kind === "google" && !hub.tasks.connected() ? "  (!) reconnect Google to add Tasks" : ""}`,
  ];
}

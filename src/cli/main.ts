#!/usr/bin/env node
import { Command } from "commander";
import { FixedApprover } from "../core/approval.js";
import { loadConfig } from "../core/config.js";
import { describe, makeHub, type Hub } from "../hub.js";

/** Small command-line helpers behind the Mac files (setup's check, Connect Gmail). The app itself is the page. */
const program = new Command("hub").description("Get In Tune Hub").option("--yes", "answer yes to every confirmation (careful)");

function hub(): Hub {
  return makeHub(loadConfig(), program.opts().yes ? new FixedApprover(true) : undefined);
}

program
  .command("doctor")
  .description("Show how the app is set up and which connections are live or practice")
  .action(() => {
    for (const l of describe(hub())) console.log(l);
  });

program
  .command("lists [list]")
  .description("Show who's on her lists (or one list: therapy, coaching, workshop, trainees, supervision, facilities)")
  .action((list?: string) => {
    const h = hub();
    for (const p of h.lists.programs().filter((x) => !list || x.id === list)) {
      const es = h.lists.list(p.id);
      console.log(`\n${p.name} (${es.length})`);
      for (const e of es) console.log(`  ${e.name.padEnd(28)} ${e.stage}${e.nextStep ? `  · next: ${e.nextStep}${e.nextDate ? ` (${e.nextDate})` : ""}` : ""}`);
    }
  });

program
  .command("ask <request...>")
  .description('Ask Claude, e.g. hub ask "how many workshop sign-ups do I have?"')
  .action(async (words: string[]) => {
    const { ask } = await import("../agent/run.js");
    await ask(hub(), words.join(" "));
  });

const connect = program.command("connect").description("Guided set-up for a connection");
connect.command("gmail").description("Connect Gmail and Google Calendar step by step").action(async () => (await import("./connect.js")).connectGmail());
connect.command("outlook").description("Connect your work email (Outlook, read-only) step by step").action(async () => (await import("./connect.js")).connectOutlook());

program.parseAsync().catch((e) => {
  console.error(`\n${e.message ?? e}`);
  process.exit(1);
});

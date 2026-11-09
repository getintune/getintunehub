import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { loadConfig } from "../core/config.js";
import { GoogleGmail, openBrowser } from "../connectors/gmail/google.js";

/** Guided set-up for Gmail and Outlook: opens the right pages, takes the values, saves them to .env, tests them. */

function envPath() {
  return path.join(loadConfig().hubRoot, ".env");
}

export function setEnv(values: Record<string, string>, file = envPath()) {
  const lines = existsSync(file) ? readFileSync(file, "utf8").split(/\r?\n/) : [];
  for (const [k, v] of Object.entries(values)) {
    const i = lines.findIndex((l) => l.startsWith(`${k}=`));
    if (i >= 0) lines[i] = `${k}=${v}`;
    else lines.push(`${k}=${v}`);
  }
  writeFileSync(file, lines.join("\n").replace(/\n*$/, "\n"));
  for (const [k, v] of Object.entries(values)) process.env[k] = v;
}

async function ask(q: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(q)).trim();
  } finally {
    rl.close();
  }
}

function step(n: number, text: string) {
  console.log(`\n${n}. ${text}`);
}

/** Google's "Download JSON" for a Desktop client lands in Downloads as client_secret_<id>.json. */
function findClientJson(): { id: string; secret: string; file: string } | null {
  const dl = path.join(process.env.HOME || process.env.USERPROFILE || ".", "Downloads");
  if (!existsSync(dl)) return null;
  const files = readdirSync(dl)
    .filter((f) => /^client_secret_.*\.json$/i.test(f))
    .map((f) => path.join(dl, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  for (const file of files) {
    try {
      const j = JSON.parse(readFileSync(file, "utf8"));
      const c = j.installed ?? j.web;
      if (c?.client_id && c?.client_secret) return { id: c.client_id, secret: c.client_secret, file };
    } catch {
      /* not one of Google's files */
    }
  }
  return null;
}

export async function connectGmail() {
  const cfg = loadConfig();
  const app = cfg.profile.appName;
  console.log(`Connecting Gmail (${cfg.gmail.address}) for ${app}'s Gmail tab: reading, drafts, archive/labels, and sending when you press Send.`);
  if (!cfg.gmail.clientId) {
    console.log(`Google needs a one-time 'app' entry for ${app}. Each page opens in your browser; sign in as ${cfg.gmail.address}.`);
    step(1, `Create a project named ${app} (Create).`);
    openBrowser("https://console.cloud.google.com/projectcreate");
    await ask("   Press Enter when it's created... ");
    step(2, `Make sure ${app} is the selected project at the top, then click Enable on the Gmail API.`);
    openBrowser("https://console.cloud.google.com/apis/library/gmail.googleapis.com");
    await ask("   Press Enter when it says API enabled... ");
    step(3, `Click Get started: app name ${app}, your email, Audience = External (a personal Gmail can't pick Internal), your email again, agree, Create.`);
    console.log(`   Then under Audience > Test users, add ${cfg.gmail.address}.`);
    openBrowser("https://console.cloud.google.com/auth/overview");
    await ask("   Press Enter when it's done... ");
    step(4, `Create client: Application type = Desktop app, name ${app}, Create. Then click Download JSON.`);
    openBrowser("https://console.cloud.google.com/auth/clients/create");
    await ask("   Press Enter once the JSON file is downloaded (or if you'd rather paste the ID and secret)... ");

    let creds = findClientJson();
    if (creds) console.log(`   Found ${path.basename(creds.file)} in Downloads.`);
    else {
      const id = await ask("   Paste the Client ID: ");
      const secret = await ask("   Paste the Client secret: ");
      if (!id || !secret) throw new Error("No client ID / secret; run Connect Gmail again when you have them.");
      creds = { id, secret, file: "" };
    }
    setEnv({ GOOGLE_CLIENT_ID: creds.id, GOOGLE_CLIENT_SECRET: creds.secret });
  }

  // Calendar and Tasks are APIs of their own: each needs one Enable click in the same Google project.
  step(5, `Turn on the Google Calendar API and the Google Tasks API: click Enable on each page that opens (check ${app} is the project at the top).`);
  openBrowser("https://console.cloud.google.com/apis/library/calendar-json.googleapis.com");
  openBrowser("https://console.cloud.google.com/apis/library/tasks.googleapis.com");
  await ask("   Press Enter when both say API enabled (or Manage)... ");

  step(6, "Sign in to Google in the browser window that opens and click Allow (Gmail, Calendar and Tasks).");
  const c = loadConfig();
  const gmail = new GoogleGmail({ clientId: c.gmail.clientId, clientSecret: c.gmail.clientSecret, tokenFile: c.gmail.tokenFile, address: c.gmail.address });
  await gmail.login();
  const sent = await gmail.search("in:sent", 1);
  console.log(`\nGmail is connected. Latest sent email: "${sent[0]?.subject ?? "(none)"}".`);
  const { GoogleCalendar } = await import("../connectors/calendar/index.js");
  const { GoogleTasks } = await import("../connectors/tasks/index.js");
  const { GoogleAuth } = await import("../connectors/google/auth.js");
  const auth = new GoogleAuth({ clientId: c.gmail.clientId, clientSecret: c.gmail.clientSecret, tokenFile: c.gmail.tokenFile, address: c.gmail.address });
  try {
    const cals = await new GoogleCalendar(auth).calendars();
    console.log(`Google Calendar is connected (${cals.length} calendar${cals.length === 1 ? "" : "s"}).`);
  } catch (e) {
    console.log(`Google Calendar didn't answer: ${(e as Error).message}\n  If it says the API isn't enabled, enable it (step 5) and run Connect Gmail again.`);
  }
  try {
    const lists = await new GoogleTasks(auth).lists();
    console.log(`Google Tasks is connected (${lists.map((l) => l.title).join(", ")}).`);
  } catch (e) {
    console.log(`Google Tasks didn't answer: ${(e as Error).message}\n  If it says the API isn't enabled, enable it (step 5) and run Connect Gmail again.`);
  }
  console.log(`Restart ${app} (close its window, open it again) to use it.`);
}

/**
 * Outlook (Microsoft 365), read-only: a one-time "app registration" in her own Microsoft 365, then a sign-in
 * with a short code. She's the admin of her Microsoft 365, so she can approve it herself.
 */
export async function connectOutlook() {
  const cfg = loadConfig();
  const app = cfg.profile.appName;
  console.log(`Connecting your work email (${cfg.outlook.mailboxes.join(" and ")}) to ${app}. It only READS mail: it can't send, move or delete anything.`);
  if (!cfg.outlook.clientId) {
    console.log("\nMicrosoft needs a one-time 'app registration'. Each page opens in your browser; sign in with your Microsoft 365 admin account.");
    step(1, `Click "+ New registration". Name: ${app}. Supported account types: "Single tenant only - <your organization>" (older screens call it "Accounts in this organizational directory only"). Leave Redirect URI empty. Click Register.`);
    openBrowser("https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade");
    await ask("   Press Enter when it's registered... ");
    const id = await ask('2. On the page that opened, copy the "Application (client) ID" and paste it here: ');
    const tenant = await ask('3. Copy the "Directory (tenant) ID" and paste it here: ');
    if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f-]{36}$/i.test(tenant)) throw new Error("Those don't look like Microsoft IDs (they look like 1a2b3c4d-....). Run Connect Outlook again and copy them once more.");
    step(4, 'In the menu on the left click "Authentication". Under "Advanced settings", set "Allow public client flows" to Yes, then Save.');
    await ask("   Press Enter when saved... ");
    step(5, 'Click "API permissions" > "+ Add a permission" > Microsoft Graph > Delegated permissions. Tick Mail.Read and Mail.Read.Shared, then "Add permissions". Then click "Grant admin consent for ..." and Yes.');
    await ask("   Press Enter when the permissions show a green tick... ");
    setEnv({ MS_CLIENT_ID: id, MS_TENANT: tenant });
  }
  const c = loadConfig({ ...process.env, MS_CLIENT_ID: cfg.outlook.clientId || loadEnvValue("MS_CLIENT_ID"), MS_TENANT: loadEnvValue("MS_TENANT") || cfg.outlook.tenant, HUB_MODE: "live" });
  const { GraphMail } = await import("../connectors/outlook/index.js");
  const g = new GraphMail({ clientId: c.outlook.clientId, tenant: c.outlook.tenant, tokenFile: c.outlook.tokenFile, mailboxes: c.outlook.mailboxes });
  await g.login((code, url) => {
    console.log(`\n6. Sign in: on the page that opens, type this code: ${code}\n   Then sign in as ${c.outlook.mailboxes[0]} and click Accept.`);
    openBrowser(url);
  });
  for (const mb of c.outlook.mailboxes) {
    try {
      const l = await g.list({ mailbox: mb, max: 1 });
      console.log(`${mb}: connected. Newest email: "${l[0]?.subject ?? "(empty inbox)"}".`);
    } catch (e) {
      console.log(`${mb}: ${(e as Error).message}`);
    }
  }
  console.log(`\nRestart ${app} (close its window, open it again) to use it.`);
}

function loadEnvValue(k: string): string {
  try {
    return readFileSync(envPath(), "utf8").match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim() ?? "";
  } catch {
    return "";
  }
}

/** Motion: paste the API key from Motion's settings; it's tested, then saved to .env on this Mac only. */
export async function connectMotion() {
  const app = loadConfig().profile.appName;
  console.log(`Connecting Motion to ${app}. The app shows what Motion scheduled and adds tasks only when you say Yes. It never moves, edits or deletes Motion tasks.`);
  step(1, 'In Motion (signed in), open Settings, find "API" (it may be under "API & Integrations"), and click "Create API key". Name it ' + app + ", then copy the key.");
  openBrowser("https://app.usemotion.com/web/settings/api");
  const key = await ask("\n2. Paste the key here and press Enter: ");
  if (!key) throw new Error("No key; double-click Connect Motion again when you have it.");
  const { LiveMotion } = await import("../connectors/motion/index.js");
  const tasks = await new LiveMotion({ apiKey: key, workspaceId: "" }).tasks();
  setEnv({ MOTION_API_KEY: key });
  console.log(`\nMotion is connected: you have ${tasks.length} open task${tasks.length === 1 ? "" : "s"}.`);
  console.log(`Restart ${app} (close its window, open it again) to use it.`);
}

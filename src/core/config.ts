import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

export const HUB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export type Mode = "mock" | "live";

/** Who the app is for. Everything that names the owner, the business or the time zone reads it from here. */
export interface Profile {
  /** Full name, e.g. "Marlys Woods". */
  owner: string;
  /** First name, used in prompts and Yes/No cards ("Marlys declined"). */
  first: string;
  /** Business name, e.g. "Get In Tune". */
  business: string;
  /** One sentence about the business, for Claude's prompts. */
  about: string;
  /** Her main work email address. */
  email: string;
  /** IANA time zone for every date and time the app shows or reads. */
  timeZone: string;
  /** The app's name on the page and in messages. */
  appName: string;
}

export const DEFAULT_PROFILE: Profile = {
  owner: "Marlys Woods",
  first: "Marlys",
  business: "Get In Tune",
  about:
    "Get In Tune (Get In Tune Inc.) offers music therapy, therapy and coaching for life's big changes: 1:1 therapy and transition coaching, group therapy, workshops for nomads and expats, training and group supervision for therapists, and music therapy for treatment centers",
  email: "marlys@getintunemusictherapy.com",
  timeZone: "America/Denver",
  appName: "Get In Tune Hub",
};

/** The time zone in use (set by loadConfig from HUB_TIME_ZONE). Read it at call time, not at import time. */
export let TIME_ZONE = DEFAULT_PROFILE.timeZone;

function validTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export interface Config {
  hubRoot: string;
  mode: Mode;
  profile: Profile;
  estimatorDir: string;
  skillDir: string;
  jobsRoot: string;
  python: string;
  anthropicApiKey: string;
  model: string;
  /** A fast, cheaper model for small jobs like one-line email summaries. */
  fastModel: string;
  homebase: { driver: "mock" | "browser" | "api"; url: string; apiToken: string; authFile: string; me: string };
  gmail: { driver: "mock" | "google"; clientId: string; clientSecret: string; address: string; tokenFile: string };
  companycam: { driver: "mock" | "rest"; token: string };
  docusketch: { downloadsDir: string };
  spotify: { clientId: string };
  /** Drive times for calendar events: where the day's driving starts. */
  travel: { start: string };
  /** Where mocks keep their state (mock outbox, mock Homebase writes). */
  stateDir: string;
}

/** Reads .env from the app folder (never committed) and fills in defaults. Mock wherever credentials are missing. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env, root = HUB_ROOT): Config {
  if (env === process.env) dotenv.config({ path: path.join(root, ".env"), quiet: true } as dotenv.DotenvConfigOptions);
  const e = (k: string, d = "") => (env[k] ?? "").trim() || d;
  const mode: Mode = e("HUB_MODE", "live") === "mock" ? "mock" : "live";
  const live = mode === "live";
  const isWin = process.platform === "win32";

  const owner = e("HUB_OWNER_NAME", DEFAULT_PROFILE.owner);
  const tz = e("HUB_TIME_ZONE", DEFAULT_PROFILE.timeZone);
  const profile: Profile = {
    owner,
    first: e("HUB_OWNER_FIRST_NAME", owner.split(/\s+/)[0] || owner),
    business: e("HUB_BUSINESS_NAME", DEFAULT_PROFILE.business),
    about: e("HUB_BUSINESS_ABOUT", DEFAULT_PROFILE.about),
    email: e("HUB_OWNER_EMAIL", DEFAULT_PROFILE.email),
    timeZone: validTimeZone(tz) ? tz : DEFAULT_PROFILE.timeZone,
    appName: e("HUB_APP_NAME", DEFAULT_PROFILE.appName),
  };
  TIME_ZONE = profile.timeZone;

  const estimatorDir = e("ESTIMATOR_DIR", isWin ? "C:\\Games\\Estimator" : path.join(root, "..", "estimator"));
  const skillDir = e("SKILL_DIR", path.join(estimatorDir, "skill", "forefront-estimate"));
  const stateDir = path.join(root, ".hub");

  let anthropicApiKey = e("ANTHROPIC_API_KEY");
  const keyFile = path.join(estimatorDir, "data", "api_key.txt");
  if (!anthropicApiKey && existsSync(keyFile)) anthropicApiKey = readFileSync(keyFile, "utf8").trim();

  const hbDriver = e("HOMEBASE_DRIVER", e("HOMEBASE_API_TOKEN") ? "api" : "browser") as Config["homebase"]["driver"];
  const gmailReady = !!(e("GOOGLE_CLIENT_ID") && e("GOOGLE_CLIENT_SECRET"));
  const ccToken = e("COMPANYCAM_TOKEN");

  return {
    hubRoot: root,
    mode,
    profile,
    estimatorDir,
    skillDir,
    jobsRoot: e("JOBS_ROOT", live ? (isWin ? "C:\\Jobs" : path.join(root, "jobs")) : path.join(stateDir, "jobs")),
    python: e("PYTHON", isWin ? "py" : "python3"),
    anthropicApiKey,
    model: e("HUB_MODEL", "claude-opus-5-5"),
    fastModel: e("HUB_FAST_MODEL", "claude-haiku-5-5"),
    homebase: {
      driver: !live ? "mock" : hbDriver === "api" && !e("HOMEBASE_API_TOKEN") ? "mock" : hbDriver,
      url: e("HOMEBASE_URL", "https://homebase.forefrontteam.com").replace(/\/$/, ""),
      apiToken: e("HOMEBASE_API_TOKEN"),
      authFile: path.join(root, "auth", "homebase.json"),
      me: e("HOMEBASE_ME", owner),
    },
    gmail: {
      driver: live && gmailReady ? "google" : "mock",
      clientId: e("GOOGLE_CLIENT_ID"),
      clientSecret: e("GOOGLE_CLIENT_SECRET"),
      address: e("GMAIL_ADDRESS", "getintunemusictherapy@gmail.com"),
      tokenFile: path.join(root, "auth", "google-token.json"),
    },
    companycam: { driver: live && ccToken ? "rest" : "mock", token: ccToken },
    spotify: { clientId: e("SPOTIFY_CLIENT_ID") },
    travel: { start: e("HUB_DAY_START_ADDRESS", officeAddress(skillDir)) },
    docusketch: { downloadsDir: e("DOWNLOADS_DIR", path.join(env.USERPROFILE || env.HOME || root, "Downloads")) },
    stateDir,
  };
}

/** Forefront's office, from the estimating skill's company.json (where the day's driving starts by default). */
function officeAddress(skillDir: string): string {
  try {
    return JSON.parse(readFileSync(path.join(skillDir, "assets", "company.json"), "utf8")).address ?? "";
  } catch {
    return "";
  }
}

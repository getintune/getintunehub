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
  /** Google Gemini key for the app's own agent (GEMINI_API_KEY). Blank = agent off; Claude buttons hand off instead. */
  geminiApiKey: string;
  model: string;
  /** A fast, lighter model for small jobs like one-line email summaries. */
  fastModel: string;
  gmail: { driver: "mock" | "google"; clientId: string; clientSecret: string; address: string; tokenFile: string };
  /** Work email in Microsoft 365 (read-only): marlys@ and the shared info@ mailbox. */
  outlook: { driver: "mock" | "microsoft"; clientId: string; tenant: string; tokenFile: string; mailboxes: string[] };
  /** Motion (tasks and scheduling): MOTION_API_KEY from Motion → Settings → API. */
  motion: { driver: "mock" | "motion"; apiKey: string; workspaceId: string };
  spotify: { clientId: string };
  /** Drive times for calendar events: where the day's driving starts (HUB_DAY_START_ADDRESS, e.g. home). */
  travel: { start: string };
  /** The app's own working files (practice data, the brief, caches). */
  stateDir: string;
  /** Her own data (the lists): HUB_DATA_DIR, default the app's data/ folder (never uploaded). */
  dataDir: string;
}

/** Reads .env from the app folder (never committed) and fills in defaults. Mock wherever credentials are missing. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env, root = HUB_ROOT): Config {
  if (env === process.env) dotenv.config({ path: path.join(root, ".env"), quiet: true } as dotenv.DotenvConfigOptions);
  const e = (k: string, d = "") => (env[k] ?? "").trim() || d;
  const mode: Mode = e("HUB_MODE", "live") === "mock" ? "mock" : "live";
  const live = mode === "live";

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

  const stateDir = path.join(root, ".hub");

  const geminiApiKey = e("GEMINI_API_KEY");
  const gmailReady = !!(e("GOOGLE_CLIENT_ID") && e("GOOGLE_CLIENT_SECRET"));

  return {
    hubRoot: root,
    mode,
    profile,
    geminiApiKey,
    // An older .env may still name Claude models (from before the switch to Gemini): those are ignored.
    model: geminiModel(e("HUB_MODEL"), "gemini-3.5-flash"),
    fastModel: geminiModel(e("HUB_FAST_MODEL"), "gemini-3.5-flash-lite"),
    gmail: {
      driver: live && gmailReady ? "google" : "mock",
      clientId: e("GOOGLE_CLIENT_ID"),
      clientSecret: e("GOOGLE_CLIENT_SECRET"),
      address: e("GMAIL_ADDRESS", "getintunemusictherapy@gmail.com"),
      tokenFile: path.join(root, "auth", "google-token.json"),
    },
    outlook: {
      driver: live && e("MS_CLIENT_ID") ? "microsoft" : "mock",
      clientId: e("MS_CLIENT_ID"),
      tenant: e("MS_TENANT", "organizations"),
      tokenFile: path.join(root, "auth", "microsoft-token.json"),
      mailboxes: e("OUTLOOK_MAILBOXES", `${profile.email},info@getintunemusictherapy.com`).split(",").map((x) => x.trim().toLowerCase()).filter(Boolean),
    },
    motion: { driver: live && e("MOTION_API_KEY") ? "motion" : "mock", apiKey: e("MOTION_API_KEY"), workspaceId: e("MOTION_WORKSPACE_ID") },
    spotify: { clientId: e("SPOTIFY_CLIENT_ID") },
    travel: { start: e("HUB_DAY_START_ADDRESS") },
    stateDir,
    dataDir: e("HUB_DATA_DIR", path.join(root, "data")),
  };
}

/** A Gemini model name from .env, or the default when it's blank or names some other model (e.g. an old claude-*). */
export function geminiModel(v: string, fallback: string): string {
  return /^(models\/)?gemini-/i.test(v) ? v : fallback;
}

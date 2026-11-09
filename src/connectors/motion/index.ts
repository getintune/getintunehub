import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { TIME_ZONE, type Config } from "../../core/config.js";

/**
 * Motion (usemotion.com): her tasks and her team's (Kristin, Frankie). Motion keeps the schedule: it fits each task
 * into her week and moves it when things change. The app only reads what Motion planned, and hands Motion new tasks
 * (always after she says Yes); it never moves, edits or deletes anything there.
 *
 * Live: Motion's public API with the key from Motion → Settings → API (MOTION_API_KEY in .env, never uploaded).
 * Motion allows only a few calls a minute, so task lists are kept for 2 minutes.
 */
export interface MotionTask {
  id: string;
  name: string;
  /** YYYY-MM-DD (or ISO) deadline, if any. */
  dueDate?: string;
  /** When Motion has it on the schedule (ISO). */
  scheduledStart?: string;
  scheduledEnd?: string;
  /** Minutes. */
  duration?: number;
  completed: boolean;
  status: string;
  assignees: string[];
  /** Assigned to her. */
  mine: boolean;
  link: string;
}

export interface NewMotionTask {
  name: string;
  /** YYYY-MM-DD. */
  dueDate?: string;
  /** Minutes, default 30. */
  duration?: number;
  description?: string;
}

export interface MotionClient {
  readonly kind: "mock" | "motion";
  connected(): boolean;
  /** Open tasks: hers, or everyone's in the workspace (`team`). */
  tasks(o?: { team?: boolean }): Promise<MotionTask[]>;
  /** Adds a task for her; Motion schedules it. Callers ask her first. */
  create(t: NewMotionTask): Promise<MotionTask>;
}

const API = "https://api.usemotion.com/v1";

export class LiveMotion implements MotionClient {
  readonly kind = "motion" as const;
  private cache: { at: number; team: boolean; tasks: MotionTask[] } | null = null;
  private meId = "";
  private workspace = "";
  constructor(private o: { apiKey: string; workspaceId: string }, private fetchFn: typeof fetch = fetch) {
    this.workspace = o.workspaceId;
  }
  connected() {
    return !!this.o.apiKey;
  }

  private async call(p: string, init: { method?: string; body?: unknown } = {}): Promise<any> {
    const r = await this.fetchFn(`${API}${p}`, {
      method: init.method ?? "GET",
      headers: { "X-API-Key": this.o.apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    const j: any = await r.json().catch(() => ({}));
    if (r.status === 401 || r.status === 403) throw new Error("Motion didn't accept the API key. Make a new one in Motion → Settings → API and put it in .env (MOTION_API_KEY).");
    if (r.status === 429) throw new Error("Motion asked us to slow down. It'll refresh in a minute.");
    if (!r.ok) throw new Error(`Motion: ${j.message ?? r.statusText}`);
    return j;
  }

  private async setup() {
    if (!this.meId) this.meId = (await this.call("/users/me")).id;
    if (!this.workspace) {
      const ws = (await this.call("/workspaces")).workspaces ?? [];
      if (!ws.length) throw new Error("Motion has no workspace for this key.");
      this.workspace = ws[0].id;
    }
  }

  async tasks(o: { team?: boolean } = {}) {
    const team = !!o.team;
    if (this.cache && this.cache.team === team && Date.now() - this.cache.at < 120_000) return this.cache.tasks;
    await this.setup();
    const out: MotionTask[] = [];
    let cursor = "";
    for (let page = 0; page < 5; page++) {
      const q = new URLSearchParams({ workspaceId: this.workspace, ...(team ? {} : { assigneeId: this.meId }), ...(cursor ? { cursor } : {}) });
      const j = await this.call(`/tasks?${q}`);
      out.push(...(j.tasks ?? []).map((t: any) => toTask(t, this.meId)));
      cursor = j.meta?.nextCursor ?? "";
      if (!cursor) break;
    }
    const tasks = out.filter((t) => !t.completed);
    this.cache = { at: Date.now(), team, tasks };
    return tasks;
  }

  async create(t: NewMotionTask) {
    await this.setup();
    const today = new Date().toISOString().slice(0, 10);
    const j = await this.call("/tasks", {
      method: "POST",
      body: {
        name: t.name,
        workspaceId: this.workspace,
        assigneeId: this.meId,
        duration: t.duration ?? 30,
        ...(t.dueDate ? { dueDate: `${t.dueDate}T23:59:00` } : {}),
        ...(t.description ? { description: t.description } : {}),
        autoScheduled: { startDate: today, deadlineType: t.dueDate ? "SOFT" : "NONE", schedule: "Work Hours" },
      },
    });
    this.cache = null;
    return toTask(j, this.meId);
  }
}

function toTask(t: any, meId: string): MotionTask {
  const assignees = (t.assignees ?? []).map((a: any) => String(a.name ?? a.email ?? ""));
  return {
    id: String(t.id),
    name: String(t.name ?? ""),
    dueDate: t.dueDate ?? undefined,
    scheduledStart: t.scheduledStart ?? undefined,
    scheduledEnd: t.scheduledEnd ?? undefined,
    duration: typeof t.duration === "number" ? t.duration : undefined,
    completed: !!t.completed || !!t.status?.isResolvedStatus,
    status: String(t.status?.name ?? ""),
    assignees,
    mine: (t.assignees ?? []).some((a: any) => a.id === meId),
    link: `https://app.usemotion.com/web/pm/tasks/${encodeURIComponent(String(t.id))}`,
  };
}

/**
 * Made-up Motion tasks (fixtures/motion.json) for practice mode: hers scheduled through today and tomorrow, and a
 * few of Kristin's and Frankie's. Times are hours from the start of today, so they always look current. Tasks
 * added in practice mode are kept in memory only.
 */
export class MockMotion implements MotionClient {
  readonly kind = "mock" as const;
  private list: MotionTask[];
  constructor(fixture: string, private me = "Marlys Woods") {
    const raw: any[] = existsSync(fixture) ? JSON.parse(readFileSync(fixture, "utf8")).tasks : [];
    const day0 = startOfTodayIn(TIME_ZONE);
    const at = (h: number | undefined) => (h === undefined ? undefined : new Date(day0.getTime() + h * 3600e3).toISOString());
    this.list = raw.map((t, i) => ({
      id: t.id ?? `m${i + 1}`,
      name: t.name,
      dueDate: t.dueInDays === undefined ? undefined : new Date(day0.getTime() + t.dueInDays * 864e5 + 12 * 3600e3).toISOString().slice(0, 10),
      scheduledStart: at(t.startHour),
      scheduledEnd: t.startHour === undefined ? undefined : at(t.startHour + (t.duration ?? 30) / 60),
      duration: t.duration ?? 30,
      completed: false,
      status: "Todo",
      assignees: [t.assignee ?? me],
      mine: (t.assignee ?? me) === me,
      link: "https://app.usemotion.com/",
    }));
  }
  connected() {
    return true;
  }
  async tasks(o: { team?: boolean } = {}) {
    return this.list.filter((t) => !t.completed && (o.team || t.mine));
  }
  async create(t: NewMotionTask) {
    const task: MotionTask = { id: `m${Date.now().toString(36)}`, name: t.name, dueDate: t.dueDate, duration: t.duration ?? 30, completed: false, status: "Todo", assignees: [this.me], mine: true, link: "https://app.usemotion.com/" };
    this.list.push(task);
    return task;
  }
}

/** On her Mac before the Motion key is added: no practice tasks (they'd look real), just "not connected". */
export class NotConnectedMotion implements MotionClient {
  readonly kind = "motion" as const;
  connected() {
    return false;
  }
  async tasks(): Promise<MotionTask[]> {
    throw new Error("Motion isn't connected yet: double-click Connect Motion in the app's folder.");
  }
  async create(): Promise<MotionTask> {
    throw new Error("Motion isn't connected yet: double-click Connect Motion in the app's folder.");
  }
}

export function makeMotion(cfg: Config): MotionClient {
  if (cfg.mode === "live" && cfg.motion.driver !== "motion") return new NotConnectedMotion();
  return cfg.motion.driver === "motion" ? new LiveMotion({ apiKey: cfg.motion.apiKey, workspaceId: cfg.motion.workspaceId }) : new MockMotion(path.join(cfg.hubRoot, "fixtures", "motion.json"), cfg.profile.owner);
}

/** Midnight today in her time zone (so practice tasks land on her today, whatever the computer's clock zone). */
function startOfTodayIn(tz: string, now = new Date()): Date {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
  const offset = asUtc - Math.floor(now.getTime() / 60000) * 60000;
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day) - offset);
}

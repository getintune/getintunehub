#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, TIME_ZONE } from "../core/config.js";
import { describe, makeHub, type Hub } from "../hub.js";
import { freeSlots } from "../connectors/calendar/index.js";
import { EventBus, WebApprover } from "./events.js";
import { allContacts, findContacts, noteAddresses, noteMessages, withLists } from "../workflows/contacts.js";
import { BRIEF, briefDue } from "../workflows/brief.js";
import { listCounts, needs } from "../workflows/needs.js";
import { renderPage } from "./page.js";
import { requestAllowed } from "./guard.js";
import { featureOn } from "../agent/costs.js";
import { saveWorkout, todaysWorkout } from "../workflows/workout.js";

/**
 * The app's screen: a local web app on 127.0.0.1, opened in her browser. Anything that sends an email or changes her
 * calendar or tasks asks first (a Yes/No card on the page).
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const cfg = loadConfig();
const bus = new EventBus();
const approver = new WebApprover(bus);
const hub: Hub = makeHub(cfg, approver);
hub.say = (text) => {
  console.log(text);
  bus.emit({ type: "log", text });
};

const MIME: Record<string, string> = { ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".json": "application/json", ".txt": "text/plain; charset=utf-8", ".eml": "message/rfc822", ".html": "text/html; charset=utf-8" };

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function body(req: IncomingMessage): Promise<any> {
  let s = "";
  for await (const c of req) s += c;
  return s ? JSON.parse(s) : {};
}

/** Runs a workflow in the background; progress and approvals stream to the page. */
function task(label: string, fn: () => Promise<unknown>, after?: "lists" | "mail") {
  const id = crypto.randomUUID();
  bus.emit({ type: "task", id, state: "running", label });
  fn()
    .then(() => {
      bus.emit({ type: "task", id, state: "done", label });
      if (after) bus.emit({ type: "changed", what: after });
    })
    .catch((e) => {
      console.error(e);
      bus.emit({ type: "task", id, state: "error", label, error: (e as Error).message });
    });
  return { taskId: id };
}

// ---------------------------------------------------------------- mail

async function mailThread(id: string) {
  const t = await hub.gmail.getThread(id);
  noteMessages(hub, t.messages);
  // Who is this on her lists? By email (therapy clients are initials only, so they never match).
  const addresses = new Set(t.messages.flatMap((m) => [m.from, ...m.to, ...m.cc]).map((a) => a.match(/[\w.+-]+@[\w.-]+/)?.[0]?.toLowerCase()).filter((a): a is string => !!a));
  const people = hub.lists.list().filter((e) => e.email && addresses.has(e.email.toLowerCase())).slice(0, 3).map((e) => ({ id: e.id, name: e.name, program: e.program, list: hub.lists.program(e.program).name, stage: e.stage }));
  // Drafts in the thread are marked (and Claude's say what made them), so they can't be mistaken for sent mail.
  const { generatedDrafts } = await import("../workflows/generated.js");
  const gen = generatedDrafts(hub);
  const messages = t.messages.map((m) => {
    if (!m.labelIds?.includes("DRAFT")) return m;
    const g = gen.find((x) => (m.messageIdHeader && x.messageId === m.messageIdHeader) || x.draftId === m.id);
    return { ...m, draft: { generated: !!g, source: g?.source } };
  });
  return { ...t, messages, people };
}

// ---------------------------------------------------------------- routes

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const p = url.pathname;
  const q = (k: string) => url.searchParams.get(k) ?? "";
  const allowed = requestAllowed(req, port);
  if (!allowed.ok) return send(res, 403, { error: allowed.why });
  try {
    if (p === "/" || p === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(renderPage(readFileSync(path.join(HERE, "ui.html"), "utf8"), cfg.profile, { GMAIL: cfg.gmail.address }));
    }
    if (p === "/logo.png" || p === "/favicon.png") {
      res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "max-age=3600" });
      return res.end(readFileSync(path.join(cfg.hubRoot, "assets", p === "/logo.png" ? "logo.png" : "icon.png")));
    }
    if (p === "/api/events") return bus.attach(res);
    if (p === "/api/status") {
      const ce = await import("../agent/env.js");
      return send(res, 200, {
        profile: { owner: cfg.profile.owner, first: cfg.profile.first, business: cfg.profile.business, appName: cfg.profile.appName, email: cfg.profile.email, timeZone: cfg.profile.timeZone },
        agentName: "Gemini",
        agentEndpoint: ce.agentEndpoint(),
        lines: describe(hub),
        lists: hub.lists.kind,
        outlook: hub.outlook.kind,
        outlookConnected: hub.outlook.connected(),
        mailboxes: hub.outlook.mailboxes(),
        gmail: hub.gmail.kind,
        gmailFull: hub.gmail.fullAccess?.() ?? false,
        calendar: hub.calendar.kind,
        calendarConnected: hub.calendar.connected(),
        tasksConnected: hub.tasks.connected(),
        emailTasks: (await import("../agent/emailTasks.js")).enabled(hub),
        agent: hub.gemini.connected(),
        me: cfg.profile.owner,
      });
    }
    // ---- Spotify: only the app's client ID lives on this computer (in .env); sign-in tokens stay in the browser.
    // ---- work email (Outlook, read-only), Grow alerts and sign-ups from info@
    if (p === "/api/work/messages") {
      const mailbox = q("mailbox") || hub.outlook.mailboxes()[0];
      if (!hub.outlook.mailboxes().includes(mailbox)) return send(res, 400, { error: "That mailbox isn't one of yours." });
      const { isGrow } = await import("../workflows/grow.js");
      // Grow emails: the page gets only who sent it and when (her HIPAA rule); the rest stays in Outlook.
      const messages = (await hub.outlook.list({ mailbox, q: q("q") || undefined })).map((m) => (isGrow(m) ? { ...m, subject: "Grow Therapy email", preview: "" } : m));
      return send(res, 200, { mailbox, messages });
    }
    const wm = p.match(/^\/api\/work\/messages\/([^/]+)\/([^/]+)$/);
    if (wm) {
      const mailbox = decodeURIComponent(wm[1]);
      if (!hub.outlook.mailboxes().includes(mailbox)) return send(res, 400, { error: "That mailbox isn't one of yours." });
      const m = await hub.outlook.get(mailbox, decodeURIComponent(wm[2]));
      const { isGrow } = await import("../workflows/grow.js");
      // Grow emails are opened in Outlook, not shown here (her HIPAA rule): only a pointer to them.
      if (isGrow(m)) return send(res, 200, { ...m, subject: "Grow Therapy email", preview: "", body: "", grow: true });
      noteMessages(hub, [{ id: m.id, from: m.from.name ? `${m.from.name} <${m.from.address}>` : m.from.address, to: m.to, cc: [], date: m.receivedAt, subject: m.subject, body: m.body ?? "", attachments: [] }]);
      return send(res, 200, m);
    }
    if (p === "/api/grow/dismiss" && req.method === "POST") {
      (await import("../workflows/grow.js")).dismissGrow(hub, String((await body(req)).id));
      return send(res, 200, { ok: true });
    }
    if (p === "/api/signups/accept" && req.method === "POST") {
      const b = await body(req);
      const e = (await import("../workflows/signups.js")).acceptSignup(hub, { messageId: String(b.messageId), name: String(b.name), email: String(b.email), source: b.source, event: String(b.event) });
      bus.emit({ type: "changed", what: "lists" });
      return send(res, 200, e);
    }
    if (p === "/api/signups/dismiss" && req.method === "POST") {
      (await import("../workflows/signups.js")).dismissSignup(hub, String((await body(req)).messageId));
      return send(res, 200, { ok: true });
    }

    // ---- Motion: Motion schedules; the app shows its plan and hands it new tasks (after she says Yes)
    if (p === "/api/motion/add" && req.method === "POST") {
      const b = await body(req);
      const name = String(b.name ?? "").trim();
      if (!name) return send(res, 400, { error: "The task needs a name." });
      const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(String(b.dueDate ?? "")) ? String(b.dueDate) : undefined;
      return send(res, 202, task(`Add to Motion: ${name.slice(0, 60)}`, async () => {
        const t = await (await import("../workflows/motion.js")).addToMotion(hub, { name, dueDate, duration: Number(b.duration) || undefined, description: b.description ? String(b.description) : undefined });
        hub.say(t ? `Added "${t.name}" to Motion. Motion will fit it into your schedule.` : "Not added to Motion.");
        if (t) bus.emit({ type: "changed", what: "calendar" });
      }));
    }

    // ---- "Do this in Claude": the request written out for her own Claude app (no API key needed)
    if (p === "/api/handoff" && req.method === "POST") {
      const b = await body(req);
      const h = await import("../workflows/handoff.js");
      if (b.kind === "plan") return send(res, 200, { prompt: await h.planPrompt(hub) });
      if (b.kind === "person") return send(res, 200, { prompt: h.personPrompt(hub, hub.lists.get(String(b.id)), b.ask ? String(b.ask) : undefined) });
      if (b.kind === "workreply") {
        const mailbox = String(b.mailbox);
        if (!hub.outlook.mailboxes().includes(mailbox)) return send(res, 400, { error: "That mailbox isn't one of yours." });
        const m = await hub.outlook.get(mailbox, String(b.id));
        const { isGrow } = await import("../workflows/grow.js");
        if (isGrow(m)) return send(res, 400, { error: "Grow Therapy emails stay in Grow and Outlook, not in Claude." });
        return send(res, 200, { prompt: h.replyPrompt(hub, { subject: m.subject, from: `${m.from.name} <${m.from.address}> (in my ${mailbox} Outlook mailbox)`, date: m.receivedAt, body: m.body ?? m.preview }) });
      }
      if (b.kind === "reply") {
        const t = await hub.gmail.getThread(String(b.threadId));
        const last = t.messages.filter((m) => !m.labelIds?.includes("DRAFT")).at(-1) ?? t.messages.at(-1)!;
        return send(res, 200, { prompt: h.replyPrompt(hub, last) });
      }
      return send(res, 200, { prompt: h.askPrompt(hub, String(b.text ?? "")) });
    }
    // ---- the agent (Gemini): on/off switches for the background features, and its use today and this month
    if ((p === "/api/settings/agent" || p === "/api/settings/claude") && req.method === "GET") {
      const c = await import("../agent/costs.js");
      const on = c.featureSettings(hub);
      return send(res, 200, {
        hasKey: hub.gemini.connected(),
        provider: "Google Gemini (free tier)",
        model: cfg.model,
        fastModel: cfg.fastModel,
        features: (Object.keys(c.FEATURES) as (keyof typeof c.FEATURES)[]).map((f) => ({ id: f, label: c.FEATURES[f].label, hint: c.FEATURES[f].hint, on: on[f], running: c.featureOn(hub, f) })),
        costs: c.costSummary(hub),
      });
    }
    if ((p === "/api/settings/agent" || p === "/api/settings/claude") && req.method === "POST") {
      const b = await body(req);
      const c = await import("../agent/costs.js");
      c.setFeature(hub, b.feature, !!b.on);
      return send(res, 200, { ok: true });
    }
    if (p === "/api/settings/spotify" && req.method === "GET") return send(res, 200, { clientId: cfg.spotify.clientId });
    // ---- today's workout (from Bevel, typed or pasted by her)
    if (p === "/api/workout" && req.method === "POST") {
      const b = await body(req);
      return send(res, 200, { workout: saveWorkout(hub, String(b.text ?? ""), Number(b.minutes) || undefined) });
    }
    // ---- drive times: where her day starts (typed by her in the app, saved to .env on her Mac only)
    if (p === "/api/settings/travel" && req.method === "GET") return send(res, 200, { start: cfg.travel.start });
    if (p === "/api/settings/travel" && req.method === "POST") {
      const start = String((await body(req)).start ?? "").replace(/[\r\n]+/g, " ").trim();
      if (start && start.length < 6) return send(res, 400, { error: "Type the full address, e.g. 123 Main St, Denver, CO 80202." });
      if (start) {
        // null = the map couldn't find it; a failed look-up (no internet) still saves.
        const found = await hub.travel.drive(start, start).catch(() => undefined);
        if (found === null && hub.travel.kind !== "mock") return send(res, 400, { error: `The map couldn't find "${start}". Check the address (street, city, state).` });
      }
      const { setEnv } = await import("../cli/connect.js");
      setEnv({ HUB_DAY_START_ADDRESS: start });
      cfg.travel.start = start;
      return send(res, 200, { ok: true, start });
    }
    if (p === "/api/settings/spotify" && req.method === "POST") {
      const b = await body(req);
      const id = String(b.clientId ?? "").trim();
      if (!/^[0-9a-f]{32}$/i.test(id)) return send(res, 400, { error: "That doesn't look like a Spotify Client ID (32 letters and numbers, from your app's Settings)." });
      const { setEnv } = await import("../cli/connect.js");
      setEnv({ SPOTIFY_CLIENT_ID: id });
      cfg.spotify.clientId = id;
      return send(res, 200, { ok: true });
    }
    // ---- the dashboard: what needs her, her lists, workshop sign-ups, today's calendar and tasks
    if (p === "/api/dashboard") {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart.getTime() + 864e5);
      const schedule = hub.calendar.connected() ? await hub.calendar.events({ start: dayStart.toISOString(), end: dayEnd.toISOString() }).catch(() => []) : [];
      const mo = await import("../workflows/motion.js");
      let motion: unknown = null, team: unknown[] = [], motionError = "";
      try {
        [motion, team] = await Promise.all([mo.motionToday(hub), mo.motionTeam(hub)]);
      } catch (e) {
        motionError = (e as Error).message;
      }
      const recent = hub.lists
        .list()
        .slice(0, 8)
        .map((e) => ({ id: e.id, name: e.name, program: e.program, list: hub.lists.program(e.program).name, stage: e.stage, at: e.updatedAt }));
      const { growAlerts } = await import("../workflows/grow.js");
      const { signupSuggestions } = await import("../workflows/signups.js");
      let grow: unknown[] = [], signups: unknown[] = [], workError = "";
      try {
        [grow, signups] = await Promise.all([growAlerts(hub), signupSuggestions(hub)]);
      } catch (e) {
        workError = (e as Error).message;
      }
      return send(res, 200, {
        grow,
        signups,
        workError,
        needs: needs(hub),
        ...listCounts(hub),
        schedule,
        travel: await import("../workflows/travel.js").then(async (t) => t.travelFor(hub, schedule, { calendars: await myCalendars() })).catch(() => ({})),
        motion,
        team,
        motionError,
        motionKind: hub.motion.kind,
        calendarConnected: hub.calendar.connected(),
        recent,
        travelStart: !!cfg.travel.start,
        workout: todaysWorkout(hub),
      });
    }
    if (p === "/api/plan" && req.method === "GET") return send(res, 200, { ...readPlan(), schedule: BRIEF });
    if (p === "/api/plan/check" && req.method === "POST") {
      // Tick an item of the brief off (or back on). Kept with the brief, so a new brief starts with none ticked.
      const b = await body(req);
      const cur = readPlan();
      if (!("startedAt" in cur) || cur.state === "running") return send(res, 409, { error: "There's no finished brief to tick off." });
      const done = { ...(cur.done ?? {}) };
      if (b.done) done[String(b.key)] = true;
      else delete done[String(b.key)];
      savePlan({ ...cur, done });
      bus.emit({ type: "changed", what: "plan" });
      return send(res, 200, { done });
    }
    if (p === "/api/plan" && req.method === "POST") {
      const r = startPlan("button");
      return "error" in r ? send(res, r.code, { error: r.error }) : send(res, 202, r);
    }

    // ---- her lists
    if (p === "/api/lists" && req.method === "GET") {
      const prog = q("program") || undefined;
      return send(res, 200, { programs: hub.lists.programs(), entries: q("q") ? hub.lists.find(q("q"), prog) : hub.lists.list(prog), kind: hub.lists.kind });
    }
    if (p === "/api/lists" && req.method === "POST") {
      const b = await body(req);
      const e = hub.lists.add(String(b.program), { name: String(b.name ?? ""), email: b.email, phone: b.phone, stage: b.stage, nextStep: b.nextStep, nextDate: b.nextDate, extra: b.extra });
      bus.emit({ type: "changed", what: "lists" });
      return send(res, 200, e);
    }
    const le = p.match(/^\/api\/lists\/([\w-]+)(?:\/(note))?$/);
    if (le) {
      const id = le[1];
      if (req.method === "GET") return send(res, 200, hub.lists.get(id));
      if (req.method === "PATCH") {
        const b = await body(req);
        const e = hub.lists.update(id, { name: b.name, email: b.email, phone: b.phone, stage: b.stage, nextStep: b.nextStep, nextDate: b.nextDate, extra: b.extra });
        bus.emit({ type: "changed", what: "lists" });
        return send(res, 200, e);
      }
      if (req.method === "POST" && le[2] === "note") {
        const e = hub.lists.addNote(id, String((await body(req)).text ?? ""));
        bus.emit({ type: "changed", what: "lists" });
        return send(res, 200, e);
      }
      if (req.method === "DELETE") {
        hub.lists.remove(id);
        bus.emit({ type: "changed", what: "lists" });
        return send(res, 200, { ok: true });
      }
    }

    // ---- mail
    if (p === "/api/mail/labels") return send(res, 200, (await hub.gmail.labels?.()) ?? []);
    // ---- contacts: everyone from email, filled out as more turns up, with the lists they're on
    if (p === "/api/contacts") {
      const query = q("q").trim();
      const list = query ? await findContacts(hub, query) : allContacts(hub).slice(0, 500).map((x) => withLists(hub, x));
      return send(res, 200, { total: allContacts(hub).length, contacts: list });
    }
    const ct = p.match(/^\/api\/contacts\/(.+)$/);
    if (ct && req.method === "GET") {
      const id = decodeURIComponent(ct[1]);
      const found = allContacts(hub).find((x) => x.id === id);
      const person = found ? withLists(hub, found) : null;
      return person ? send(res, 200, person) : send(res, 404, { error: "No such contact." });
    }
    if (p === "/api/mail/summaries" && req.method === "POST") {
      // One-line summaries for the rows on screen: the ones already written now, the rest as they're ready.
      const b = await body(req);
      const ms = await import("../agent/mailSummary.js");
      const threads = (Array.isArray(b.threads) ? b.threads : []).slice(0, 60).map((t: any) => ({ id: String(t.id), historyId: t.historyId ? String(t.historyId) : undefined }));
      ms.requestSummaries(hub, threads, () => bus.emit({ type: "changed", what: "summaries" }));
      return send(res, 200, { on: ms.enabled(hub), summaries: ms.summariesFor(hub, threads) });
    }
    if (p === "/api/mail/threads" && req.method === "GET") {
      if (!hub.gmail.listThreads) return send(res, 400, { error: "This Gmail connection can't list mail." });
      const list = await hub.gmail.listThreads({ label: q("label") || undefined, q: q("q") || undefined, pageToken: q("page") || undefined });
      const { generatedDrafts } = await import("../workflows/generated.js");
      noteAddresses(hub, list.threads.map((x) => ({ from: x.from, at: x.date })));
      const claude = new Set(generatedDrafts(hub).filter((g) => g.state === "draft" && g.threadId).map((g) => g.threadId!));
      return send(res, 200, { ...list, threads: list.threads.map((t) => ({ ...t, hasDraft: !!t.labelIds?.includes("DRAFT"), claudeDraft: claude.has(t.id) })) });
    }
    const t = p.match(/^\/api\/mail\/threads\/([\w-]+)(?:\/(modify))?$/);
    if (t && req.method === "GET") return send(res, 200, await mailThread(t[1]));
    if (t && t[2] === "modify" && req.method === "POST") {
      const b = await body(req);
      await hub.gmail.modifyThread?.(t[1], b);
      return send(res, 200, { ok: true });
    }
    // A draft in a thread: Send (only after the owner confirms, with the recipients in front of her) or Delete.
    const dr = p.match(/^\/api\/mail\/drafts\/([\w-]+)\/(send|delete|save)$/);
    if (dr && req.method === "POST") {
      const msgId = dr[1];
      if (!hub.gmail.draftIdFor || !hub.gmail.sendDraft || !hub.gmail.deleteDraft) return send(res, 400, { error: "This Gmail connection can't do that." });
      const draftId = await hub.gmail.draftIdFor(msgId);
      if (!draftId) return send(res, 404, { error: "That draft isn't in Gmail any more (sent or deleted?)." });
      const th = q("thread") ? await hub.gmail.getThread(q("thread")).catch(() => null) : null;
      const m = th?.messages.find((x) => x.id === msgId);
      if (dr[2] === "save") {
        // Edited right in the conversation: same draft, same thread, attachments and Bcc kept.
        if (!hub.gmail.updateDraft) return send(res, 400, { error: "This Gmail connection can't edit drafts." });
        const b = await body(req);
        const split = (v: unknown) => String(v ?? "").split(/[,;]/).map((x) => x.trim()).filter(Boolean);
        const files: string[] = [];
        for (const a of m?.attachments ?? []) {
          const f = path.join(cfg.stateDir, "draft-attachments", draftId, a.filename.replace(/[<>:"/\\|?*]/g, "_"));
          if (!existsSync(f) && hub.gmail.attachment) {
            mkdirSync(path.dirname(f), { recursive: true });
            writeFileSync(f, await hub.gmail.attachment(m!.id, a.id));
          }
          if (existsSync(f)) files.push(f);
        }
        const prev = th?.messages.filter((x) => !x.labelIds?.includes("DRAFT")).at(-1);
        const { generatedDrafts, GENERATED_LABEL } = await import("../workflows/generated.js");
        const gen = generatedDrafts(hub).some((g) => g.draftId === draftId || (m?.messageIdHeader && g.messageId === m.messageIdHeader));
        const to = split(b.to);
        if (!to.length) return send(res, 400, { error: "Add at least one recipient." });
        const r = await hub.gmail.updateDraft(draftId, { to, cc: split(b.cc), bcc: b.bcc !== undefined ? split(b.bcc) : m?.bcc ?? [], subject: String(b.subject ?? m?.subject ?? ""), body: String(b.body ?? ""), attachments: files, threadId: prev ? q("thread") || undefined : undefined, inReplyTo: prev?.messageIdHeader, labels: gen ? [GENERATED_LABEL] : undefined }, m?.messageIdHeader);
        bus.emit({ type: "changed", what: "mail" });
        return send(res, 200, { ok: true, messageId: r.messageId });
      }
      if (dr[2] === "delete") {
        await hub.gmail.deleteDraft(draftId);
        bus.emit({ type: "changed", what: "mail" });
        return send(res, 200, { ok: true });
      }
      if (hub.gmail.fullAccess && !hub.gmail.fullAccess()) return send(res, 400, { error: `Gmail needs to be reconnected once to send from ${cfg.profile.appName}: double-click Connect Gmail.` });
      return send(res, 202, task(`Send draft "${m?.subject ?? ""}"`, async () => {
        const lines = m ? [`To: ${m.to.join(", ")}`, m.cc.length ? `Cc: ${m.cc.join(", ")}` : "", `Subject: ${m.subject}`, m.attachments.length ? `Attached: ${m.attachments.map((a) => a.filename).join(", ")}` : ""].filter(Boolean) : [];
        if (!(await approver.confirm("Send this draft now?", lines))) return hub.say("Not sent. It's still a draft.");
        await hub.gmail.sendDraft!(draftId);
        hub.say(`Sent "${m?.subject ?? "the draft"}"${m ? ` to ${m.to.join(", ")}` : ""}.`);
        bus.emit({ type: "changed", what: "mail" });
      }, "mail"));
    }
    const att = p.match(/^\/api\/mail\/attachment\/([\w-]+)\/([\w-]+)$/);
    if (att) {
      if (!hub.gmail.attachment) return send(res, 404, { error: "not found" });
      const buf = await hub.gmail.attachment(att[1], att[2]);
      const name = q("name") || "attachment";
      res.writeHead(200, { "Content-Type": MIME[path.extname(name).toLowerCase()] ?? "application/octet-stream", "Content-Disposition": `inline; filename="${name.replace(/"/g, "")}"` });
      return res.end(buf);
    }
    if (p === "/api/mail/send" && req.method === "POST") {
      const b = await body(req);
      if (!hub.gmail.send) return send(res, 400, { error: "This Gmail connection can't send." });
      if (hub.gmail.fullAccess && !hub.gmail.fullAccess()) return send(res, 400, { error: `Gmail needs to be reconnected once to send from ${cfg.profile.appName}: double-click Connect Gmail.` });
      const split = (s: unknown) => String(s ?? "").split(/[,;]/).map((x) => x.trim()).filter(Boolean);
      const d = { to: split(b.to), cc: split(b.cc), bcc: split(b.bcc), subject: String(b.subject ?? ""), body: String(b.body ?? ""), attachments: [] as string[], threadId: b.threadId || undefined, inReplyTo: b.inReplyTo || undefined };
      if (!d.to.length) return send(res, 400, { error: "Add at least one recipient." });
      return send(res, 202, task(`Send "${d.subject}"`, async () => {
        const lines = [`To: ${d.to.join(", ")}`, d.cc.length ? `Cc: ${d.cc.join(", ")}` : "", d.bcc.length ? `Bcc: ${d.bcc.join(", ")}` : "", `Subject: ${d.subject}`, d.attachments.length ? `Attached: ${d.attachments.map((f) => path.basename(f)).join(", ")}` : ""].filter(Boolean);
        if (!(await approver.confirm("Send this email now?", lines))) return hub.say("Not sent. It's still in the compose box.");
        await hub.gmail.send!(d);
        if (b.replaceDraft) await replaceDraft(String(b.replaceDraft));
        hub.say(`Sent "${d.subject}" to ${d.to.join(", ")}.`);
        bus.emit({ type: "changed", what: "mail" });
      }, "mail"));
    }
    // ---- calendar
    if (p === "/api/cal/calendars") return send(res, 200, await hub.calendar.calendars());
    if (p === "/api/mail/generated") {
      // The Gmail tab's "Claude drafts" folder: drafts the app made, shaped like the thread list.
      const { openGeneratedDrafts } = await import("../workflows/generated.js");
      const list = await openGeneratedDrafts(hub);
      const qq = q("q").toLowerCase();
      const rows = list.filter((g) => !qq || `${g.subject} ${g.to.join(" ")} ${g.snippet}`.toLowerCase().includes(qq));
      return send(res, 200, { threads: rows.map((g) => ({ id: g.threadId ?? g.draftId, draftId: g.draftId, from: `To: ${g.to.join(", ")}`, to: g.to, subject: g.subject, snippet: g.snippet, date: g.createdAt, unread: false, starred: false, messageCount: 1, labelIds: ["DRAFT"], hasAttachments: g.attachments > 0, generated: { source: g.source } })), count: list.length });
    }
    if (p === "/api/travel/drive") {
      // A drive time on request, for any address: from her start address unless another start is given.
      const to = q("to"), from = q("from") || cfg.travel.start;
      if (!to) return send(res, 400, { error: "No address to drive to." });
      const d = await hub.travel.drive(from, to, q("at") ? new Date(q("at")) : undefined).catch((e: Error) => ({ error: /fetch failed|ENOTFOUND|ECONN/i.test(e.message) ? "The map service didn't answer (no internet?)." : e.message }));
      if (!d) return send(res, 404, { error: `The map couldn't find "${to}". Check the address.` });
      if ("error" in d) return send(res, 502, d);
      return send(res, 200, { ...d, from, to, mapsUrl: `https://www.google.com/maps/dir/?${new URLSearchParams({ api: "1", origin: from, destination: to, travelmode: "driving" })}` });
    }
    if (p === "/api/cal/travel") {
      const { travelFor } = await import("../workflows/travel.js");
      const ev = await hub.calendar.events({ start: q("start"), end: q("end") });
      const why: Record<string, string> = {};
      const legs = await travelFor(hub, ev, { calendars: await myCalendars(), why });
      return send(res, 200, { kind: hub.travel.kind, start: cfg.travel.start, legs, why });
    }
    if (p === "/api/cal/events" && req.method === "GET") {
      const ids = q("cals") ? q("cals").split(",") : undefined;
      return send(res, 200, await hub.calendar.events({ start: q("start"), end: q("end"), calendarIds: ids, q: q("q") || undefined }));
    }
    if (p === "/api/cal/free") {
      const days = Number(q("days") || 5), minutes = Number(q("minutes") || 60);
      const from = new Date();
      const to = new Date(from.getTime() + (days + 2) * 864e5);
      const busy = await hub.calendar.busy({ start: from.toISOString(), end: to.toISOString() });
      return send(res, 200, freeSlots(busy, { from, days, minutes }));
    }
    if (p === "/api/cal/events" && req.method === "POST") {
      const b = await body(req);
      const ev = await hub.calendar.create(b);
      bus.emit({ type: "changed", what: "calendar" });
      return send(res, 200, ev);
    }
    const ce = p.match(/^\/api\/cal\/events\/([^/]+)\/([^/]+)$/);
    if (ce && req.method === "PATCH") {
      const b = await body(req);
      return send(res, 200, await hub.calendar.update(decodeURIComponent(ce[1]), decodeURIComponent(ce[2]), b));
    }
    if (ce && req.method === "DELETE") {
      await hub.calendar.remove(decodeURIComponent(ce[1]), decodeURIComponent(ce[2]));
      return send(res, 200, { ok: true });
    }

    // ---- Google Tasks (the real lists: what's made here shows on the phone, and the other way round)
    if (p === "/api/tasks/lists") return send(res, 200, await hub.tasks.lists());
    if (p === "/api/tasks" && req.method === "GET") {
      return send(res, 200, await hub.tasks.tasks({ showCompleted: q("completed") === "1", dueMin: q("start") || undefined, dueMax: q("end") || undefined }));
    }
    if (p === "/api/tasks" && req.method === "POST") {
      const b = await body(req);
      const t = await hub.tasks.create({ listId: b.listId || undefined, title: String(b.title ?? "").trim() || "(no title)", notes: b.notes || undefined, due: b.due || undefined });
      return send(res, 200, t);
    }
    const tk = p.match(/^\/api\/tasks\/([^/]+)\/([^/]+)$/);
    if (tk && req.method === "PATCH") return send(res, 200, await hub.tasks.update(decodeURIComponent(tk[1]), decodeURIComponent(tk[2]), await body(req)));
    if (tk && req.method === "DELETE") {
      await hub.tasks.remove(decodeURIComponent(tk[1]), decodeURIComponent(tk[2]));
      return send(res, 200, { ok: true });
    }

    if (p === "/api/mail/draft" && req.method === "POST") {
      const b = await body(req);
      const split = (s: unknown) => String(s ?? "").split(/[,;]/).map((x) => x.trim()).filter(Boolean);
      const ref = await hub.gmail.createDraft({ to: split(b.to), cc: split(b.cc), bcc: split(b.bcc), subject: String(b.subject ?? ""), body: String(b.body ?? ""), attachments: [], threadId: b.threadId || undefined, inReplyTo: b.inReplyTo || undefined });
      if (b.replaceDraft) await replaceDraft(String(b.replaceDraft));
      bus.emit({ type: "changed", what: "mail" });
      return send(res, 200, { ok: true, id: ref.id });
    }

    if (p === "/api/ask" && req.method === "POST") {
      const b = await body(req);
      if (!hub.gemini.connected()) return send(res, 400, { error: "The app's agent is off (no GEMINI_API_KEY in the .env file). The Claude buttons open your Claude app instead." });
      // The answer comes back as an "answer" event with what the page should show: the drafts made (to open in Gmail),
      // the people on her lists and contacts the agent looked at (for buttons on the popup), and its reply.
      const id = crypto.randomUUID();
      const prompt = String(b.prompt);
      const made: import("../workflows/generated.js").GeneratedDraft[] = [];
      const seen = new Set<string>(), contacts = new Set<string>();
      task(`Ask: ${prompt.slice(0, 60)}`, async () => {
        const { withDraftSource } = await import("../workflows/generated.js");
        let text = "", error: string | undefined;
        try {
          text = await withDraftSource("Gemini", async () => (await import("../agent/run.js")).ask(hub, prompt, {
            onMessage: (m) => {
              if (m.type !== "tool") return;
              if (typeof m.input.id === "string") seen.add(m.input.id);
              if (m.name === "contacts_find" && typeof m.input.query === "string") contacts.add(m.input.query);
            },
          }), made);
        } catch (e) {
          error = (e as Error).message;
        }
        const people = [...seen].flatMap((x) => { try { const e = hub.lists.get(x); return [{ id: e.id, name: e.name, program: e.program }]; } catch { return []; } }).slice(0, 4);
        bus.emit({ type: "answer", id, prompt, text, error, drafts: made.map((d) => ({ threadId: d.threadId || (hub.gmail.kind === "mock" ? d.draftId : undefined), subject: d.subject, to: d.to })), people, contacts: [...contacts].slice(0, 3) });
        if (error) throw new Error(error);
      }, "lists");
      return send(res, 202, { id });
    }
    const a = p.match(/^\/api\/approvals\/([\w-]+)$/);
    if (a && req.method === "POST") {
      const b = await body(req);
      return send(res, approver.answer(a[1], !!b.yes, typeof b.text === "string" ? b.text : undefined) ? 200 : 404, { ok: true });
    }
    send(res, 404, { error: "not found" });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: (e as Error).message });
  }
});

// ---- tasks from new email: every 5 minutes while Gmail is connected (HUB_EMAIL_TASKS=off stops it)
let checking = false;
async function runInbox() {
  if (checking) return;
  checking = true;
  try {
    const { tasksFromInbox } = await import("../agent/emailTasks.js");
    const added = await tasksFromInbox(hub);
    for (const t of added) hub.say(`New task from email: ${t.title}`);
    if (added.length) bus.emit({ type: "changed", what: "calendar" });
  } catch (e) {
    console.error("email tasks:", e);
  } finally {
    checking = false;
  }
}
const INBOX_MINUTES = Number(process.env.HUB_INBOX_MINUTES || 5);
if (INBOX_MINUTES > 0 && hub.gmail.kind === "google") {
  setTimeout(runInbox, 30_000);
  setInterval(runInbox, INBOX_MINUTES * 60_000);
}

const port = Number(process.env.HUB_PORT || 4317);
const host = process.env.HUB_HOST || "127.0.0.1";
server.listen(port, host, () => {
  console.log(`${cfg.profile.appName} running at http://${host === "0.0.0.0" ? "localhost" : host}:${port}`);
  for (const l of describe(hub)) console.log(`  ${l}`);
  void import("../agent/env.js").then((ce) => {
    console.log(`  agent       ${hub.gemini.connected() ? `Gemini, requests go to ${ce.agentEndpoint()}` : "off (no GEMINI_API_KEY)"}`);
  });
});

// ---- Plan my day: the last brief the agent wrote, shown on the dashboard
interface Plan { state: "running" | "done" | "error"; startedAt: string; finishedAt?: string; text: string; steps: string[]; error?: string; trigger?: "button" | "morning"; /** Items ticked off on the Brief tab, by item key. */ done?: Record<string, boolean> }

function startPlan(trigger: "button" | "morning"): { taskId: string } | { error: string; code: number } {
  if (!hub.gemini.connected()) return { error: "The app's agent is off (no GEMINI_API_KEY): use Plan my day in Claude.", code: 400 };
  if (readPlan().state === "running") return { error: "Already planning your day.", code: 409 };
  const buildPrompt = (myDayNote: string) => {
    const p = cfg.profile;
    const w = todaysWorkout(hub);
    const { workshops } = listCounts(hub);
    return `Plan my day. Here is what my lists say needs me, as JSON (kind, list, name, stage, title, days):
${JSON.stringify(needs(hub).slice(0, 40))}

${w ? `Today's workout (planned in Bevel): ${w.text}${w.minutes ? ` (about ${w.minutes} min)` : ""}. Fit it into the day around my appointments.\n\n` : ""}Workshop sign-ups so far: ${workshops.length ? workshops.map((w) => `${w.event}: ${w.total} (${w.newToday} new in the last day; ${w.bySource.map((x) => `${x.source} ${x.count}`).join(", ")})`).join("; ") : "none"}.

${myDayNote}

This brief is only for me (${p.first}) and my time. Rules:
- Use ONLY the calendar events and tasks listed above. They are mine. Don't look up other calendars or tasks, and leave out other people's meetings and to-dos.
- Every line in the brief is something I do. If something waits on someone else (Kristin, Frankie), write it as my action ("Ask Kristin whether the Eventbrite people got the Zoom link") or leave it out.
- Therapy clients are initials only. Never write a full name, and nothing clinical.
- Look at my email (search the last 2 days) for anything waiting on my reply, and put the important ones in.

For the top replies and follow-ups, read the thread and draft the email in Gmail for me (drafts only; I'll send). Never draft emails to therapy clients.

Email buttons: whenever a line is about a specific email conversation and you know its Gmail thread id (from a thread you read or searched, or the threadId a draft you made returned), end that line with {email:THREAD_ID}. The app turns it into a View email button. Never invent an id.

Go buttons: end every line that's about someone on my lists with {go:ID}, using the id from the JSON above or from lists_find, e.g. "2. Tom Sample: send the coaching program details {go:c2}". The app turns it into a button that opens them. Never invent an id.

Your final reply is my brief for the day, shown at the top of my dashboard. Write it in this shape, in markdown, and nothing else:
**Today at a glance:** one or two sentences (what's booked, how many things are waiting, the one thing that matters most).

**Do in this order**
1. Name: what to do (one line each, most urgent first: someone waiting on a reply beats a slow follow-up).

**On the calendar:** the day's appointments, one line each (skip if none).

**Drafts ready in Gmail:** one line per draft you made (skip if none).`;
  };
  const plan: Plan = { state: "running", startedAt: new Date().toISOString(), text: "", steps: [], trigger };
  savePlan(plan);

  bus.emit({ type: "changed", what: "plan" });
  return task(trigger === "morning" ? "Morning brief" : "Plan my day", async () => {
    const { describeTool } = await import("../agent/run.js");
    try {
      const { withDraftSource } = await import("../workflows/generated.js");
      const note = await travelNote();
      const prompt = buildPrompt(await myDay());
      plan.text = await withDraftSource(trigger === "morning" ? "Morning brief" : "Plan my day", async () => (await import("../agent/run.js")).ask(hub, prompt + note, {
        use: "brief",
        onMessage: (m) => {
          if (m.type === "wait") {
            plan.steps.push(`Waiting ${m.seconds} s for Gemini's free per-minute limit…`);
            savePlan(plan);
            bus.emit({ type: "changed", what: "plan" });
            return;
          }
          if (m.type !== "tool") return;
          plan.steps.push(describeTool(m.name, m.input));
          savePlan(plan);
          bus.emit({ type: "changed", what: "plan" });
        },
      }));
      plan.state = "done";
    } catch (e) {
      plan.state = "error";
      plan.error = (e as Error).message;
      throw e;
    } finally {
      plan.finishedAt = new Date().toISOString();
      savePlan(plan);
      bus.emit({ type: "changed", what: "plan" });
    }
  });
}

// ---- the morning brief: on its own at 7:00 AM her time on weekdays (the dashboard switch or HUB_BRIEF_TIME=off stops it,
// HUB_BRIEF_DAYS=0-6 for every day). If the app wasn't open at 7, it runs as soon as it opens, until 5 PM.
function checkBrief() {
  const last = readPlan();
  if (!featureOn(hub, "morningBrief") || last.state === "running" || !briefDue(new Date(), "startedAt" in last ? last : null)) return;
  const r = startPlan("morning");
  if (!("error" in r)) hub.say("Making this morning's brief…");
}
if (BRIEF.at !== "off") {
  setTimeout(checkBrief, 60_000);
  setInterval(checkBrief, 60_000);
}
const planFile = () => path.join(cfg.stateDir, "plan.json");
function readPlan(): Plan | { state: "none" } {
  try {
    const p: Plan = JSON.parse(readFileSync(planFile(), "utf8"));
    // A run that was going when the app closed never finished.
    if (p.state === "running" && Date.now() - Date.parse(p.startedAt) > 20 * 60_000) return { ...p, state: "error", error: "That plan didn't finish. Try again." };
    return p;
  } catch {
    return { state: "none" };
  }
}
function savePlan(p: Plan) {
  mkdirSync(cfg.stateDir, { recursive: true });
  writeFileSync(planFile(), JSON.stringify(p, null, 2));
}

/** Today's drive times, for Plan my day: when to leave for each appointment with an address. */
async function travelNote(): Promise<string> {
  if (!hub.calendar.connected()) return "";
  try {
    const d0 = new Date(), d1 = new Date();
    d0.setHours(0, 0, 0, 0);
    d1.setHours(24, 0, 0, 0);
    const ev = await hub.calendar.events({ start: d0.toISOString(), end: d1.toISOString() });
    const legs = await (await import("../workflows/travel.js")).travelFor(hub, ev, { calendars: await myCalendars() });
    const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TIME_ZONE });
    const lines = ev.filter((e) => legs[e.id]).map((e) => { const g = legs[e.id]; return `- ${hm(e.start)} ${e.title} at ${g.to}: ${g.minutes} min drive from ${g.fromLabel}${g.rush ? " (rush hour)" : ""}, leave by ${hm(g.leaveBy)}${g.late ? `; ${g.late} min short coming straight from ${g.fromLabel}` : ""}`; });
    return lines.length ? `\n\nDrive times for today's appointments (already worked out; use them, and put the leave-by time on each calendar line of the brief; call out any that are short):\n${lines.join("\n")}` : "";
  } catch {
    return "";
  }
}

/** Your own calendar (not shared team calendars): the one drive times are worked out for. */
async function myCalendars(): Promise<Set<string>> {
  const cals = await hub.calendar.calendars().catch(() => []);
  return new Set(["primary", ...cals.filter((c) => c.primary).map((c) => c.id)]);
}

/** After an edited draft is sent or saved again, the old version is removed so it isn't left behind. */
async function replaceDraft(messageId: string) {
  const id = await hub.gmail.draftIdFor?.(messageId).catch(() => null);
  if (id) await hub.gmail.deleteDraft?.(id).catch(() => {});
}

/** My calendar and my tasks for the brief: my own calendar only (no shared team calendars, nothing I declined) and
 *  my own Google Tasks, today through the next three days. */
async function myDay(): Promise<string> {
  const lines: string[] = [];
  const d0 = new Date(), d1 = new Date();
  d0.setHours(0, 0, 0, 0);
  d1.setDate(d1.getDate() + 3);
  d1.setHours(24, 0, 0, 0);
  const day = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: TIME_ZONE });
  const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TIME_ZONE });
  if (hub.calendar.connected()) {
    const mine = await myCalendars();
    const ev = (await hub.calendar.events({ start: d0.toISOString(), end: d1.toISOString() }).catch(() => []))
      .filter((e) => mine.has(e.calendarId) && e.myResponse !== "declined")
      .sort((a, b) => a.start.localeCompare(b.start));
    lines.push("My calendar (my own calendar only), today and the next 3 days:", ...(ev.length ? ev.map((e) => `- ${day(e.start)} ${e.allDay ? "all day" : `${hm(e.start)}-${hm(e.end)}`}: ${e.private ? "Client session (details private)" : `${e.title}${e.location ? ` @ ${e.location}` : ""}`}${e.myResponse === "tentative" ? " (maybe)" : ""}`) : ["- nothing booked"]));
  } else lines.push("My calendar: not connected.");
  if (hub.tasks.connected()) {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: TIME_ZONE });
    const soon = new Date(Date.now() + 86400_000).toLocaleDateString("en-CA", { timeZone: TIME_ZONE });
    const ts = (await hub.tasks.tasks().catch(() => [])).filter((t) => !t.completed && t.due && t.due <= soon).sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""));
    lines.push("", "My tasks due by tomorrow (and overdue):", ...(ts.length ? ts.map((t) => `- ${t.title}${t.due! < today ? ` (overdue since ${day(t.due!)})` : t.due === today ? " (due today)" : " (due tomorrow)"}`) : ["- none"]));
  } else lines.push("", "My tasks: not connected.");
  return lines.join("\n");
}

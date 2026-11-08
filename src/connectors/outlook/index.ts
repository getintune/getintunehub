import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Config } from "../../core/config.js";

/**
 * Her work email in Microsoft 365 (Outlook): marlys@ and the shared info@ mailbox, read-only. The app lists and
 * reads mail, spots Grow Therapy alerts and workshop sign-ups, and links to the message in Outlook. It never
 * sends, moves or deletes anything there (replies are drafted in Claude or written in Outlook).
 *
 * Sign-in is Microsoft's "device code" flow: she opens microsoft.com/devicelogin, types a short code and approves.
 * The token lives in auth/microsoft-token.json (never uploaded). See `hub connect outlook`.
 */

export interface WorkMessage {
  id: string;
  mailbox: string;
  from: { name: string; address: string };
  to: string[];
  subject: string;
  receivedAt: string;
  preview: string;
  unread: boolean;
  /** Opens the message in Outlook on the web. */
  webLink: string;
  conversationId?: string;
  /** Plain-text body, only when one message is read. */
  body?: string;
}

export interface WorkMailClient {
  readonly kind: "mock" | "microsoft";
  connected(): boolean;
  mailboxes(): string[];
  /** Newest first from one mailbox's inbox; `q` searches. */
  list(o: { mailbox: string; q?: string; max?: number }): Promise<WorkMessage[]>;
  get(mailbox: string, id: string): Promise<WorkMessage>;
  /** Everything received since `since` (ISO) in a mailbox, newest first, for the Grow and sign-up checks. */
  since(mailbox: string, since: string, max?: number): Promise<WorkMessage[]>;
}

export const SCOPES = ["offline_access", "User.Read", "Mail.Read", "Mail.Read.Shared"];

// ---------------------------------------------------------------- Microsoft Graph

interface Token {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export class GraphMail implements WorkMailClient {
  readonly kind = "microsoft" as const;
  constructor(
    private o: { clientId: string; tenant: string; tokenFile: string; mailboxes: string[] },
    private fetchFn: typeof fetch = fetch,
  ) {}

  connected() {
    return existsSync(this.o.tokenFile);
  }
  mailboxes() {
    return this.o.mailboxes;
  }

  private authUrl(p: string) {
    return `https://login.microsoftonline.com/${encodeURIComponent(this.o.tenant)}/oauth2/v2.0/${p}`;
  }

  /** Signs in with a device code: `show` gets the code and the page to type it into. Saves the token. */
  async login(show: (code: string, url: string) => void): Promise<void> {
    const form = (f: Record<string, string>) => new URLSearchParams(f);
    const r = await this.fetchFn(this.authUrl("devicecode"), { method: "POST", body: form({ client_id: this.o.clientId, scope: SCOPES.join(" ") }) });
    const d: any = await r.json();
    if (!r.ok) throw new Error(d.error_description ?? `Microsoft didn't start the sign-in (${r.status}).`);
    show(d.user_code, d.verification_uri);
    const until = Date.now() + (d.expires_in ?? 900) * 1000;
    let wait = (d.interval ?? 5) * 1000;
    while (Date.now() < until) {
      await new Promise((ok) => setTimeout(ok, wait));
      const t = await this.fetchFn(this.authUrl("token"), { method: "POST", body: form({ grant_type: "urn:ietf:params:oauth:grant-type:device_code", client_id: this.o.clientId, device_code: d.device_code }) });
      const j: any = await t.json();
      if (t.ok) return this.save(j);
      if (j.error === "authorization_pending") continue;
      if (j.error === "slow_down") {
        wait += 5000;
        continue;
      }
      throw new Error(j.error_description ?? j.error ?? "Sign-in didn't finish.");
    }
    throw new Error("The sign-in code expired. Run Connect Outlook again.");
  }

  private save(j: any) {
    mkdirSync(path.dirname(this.o.tokenFile), { recursive: true });
    const tok: Token = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (j.expires_in ?? 3600) * 1000 - 60_000 };
    writeFileSync(this.o.tokenFile, JSON.stringify(tok, null, 2), { mode: 0o600 });
    return undefined;
  }

  private async token(): Promise<string> {
    if (!this.connected()) throw new Error("Outlook isn't connected yet: double-click Connect Outlook in the app's folder.");
    const t: Token = JSON.parse(readFileSync(this.o.tokenFile, "utf8"));
    if (Date.now() < t.expires_at) return t.access_token;
    const r = await this.fetchFn(this.authUrl("token"), {
      method: "POST",
      body: new URLSearchParams({ grant_type: "refresh_token", client_id: this.o.clientId, refresh_token: t.refresh_token, scope: SCOPES.join(" ") }),
    });
    const j: any = await r.json();
    if (!r.ok) throw new Error(`Outlook needs signing in again: double-click Connect Outlook. (${j.error_description ?? j.error ?? r.status})`);
    this.save({ ...j, refresh_token: j.refresh_token ?? t.refresh_token });
    return j.access_token;
  }

  private async graph(p: string, headers: Record<string, string> = {}): Promise<any> {
    const r = await this.fetchFn(`https://graph.microsoft.com/v1.0${p}`, { headers: { Authorization: `Bearer ${await this.token()}`, ...headers } });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = j.error?.message ?? r.statusText;
      if (r.status === 403 || r.status === 404) throw new Error(`Outlook won't show that mailbox (${msg}). If it's info@, check you have access to it in Outlook.`);
      throw new Error(`Outlook: ${msg}`);
    }
    return j;
  }

  private static SELECT = "id,subject,from,toRecipients,receivedDateTime,bodyPreview,isRead,webLink,conversationId";

  async list(o: { mailbox: string; q?: string; max?: number }) {
    const top = Math.min(o.max ?? 40, 100);
    const base = `/users/${encodeURIComponent(o.mailbox)}`;
    const j = o.q?.trim()
      ? await this.graph(`${base}/messages?$search=${encodeURIComponent(`"${o.q.replace(/"/g, "")}"`)}&$top=${top}&$select=${GraphMail.SELECT}`)
      : await this.graph(`${base}/mailFolders/inbox/messages?$top=${top}&$orderby=receivedDateTime desc&$select=${GraphMail.SELECT}`);
    return (j.value ?? []).map((m: any) => toMessage(o.mailbox, m));
  }

  async get(mailbox: string, id: string) {
    const m = await this.graph(`/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(id)}?$select=${GraphMail.SELECT},body`, { Prefer: 'outlook.body-content-type="text"' });
    return { ...toMessage(mailbox, m), body: String(m.body?.content ?? "") };
  }

  async since(mailbox: string, since: string, max = 50) {
    const j = await this.graph(`/users/${encodeURIComponent(mailbox)}/mailFolders/inbox/messages?$filter=${encodeURIComponent(`receivedDateTime ge ${since}`)}&$top=${Math.min(max, 100)}&$orderby=receivedDateTime desc&$select=${GraphMail.SELECT}`);
    return (j.value ?? []).map((m: any) => toMessage(mailbox, m));
  }
}

function toMessage(mailbox: string, m: any): WorkMessage {
  return {
    id: String(m.id),
    mailbox,
    from: { name: m.from?.emailAddress?.name ?? "", address: String(m.from?.emailAddress?.address ?? "").toLowerCase() },
    to: (m.toRecipients ?? []).map((r: any) => String(r.emailAddress?.address ?? "")),
    subject: String(m.subject ?? ""),
    receivedAt: String(m.receivedDateTime ?? ""),
    preview: String(m.bodyPreview ?? ""),
    unread: m.isRead === false,
    webLink: String(m.webLink ?? ""),
    conversationId: m.conversationId,
  };
}

// ---------------------------------------------------------------- practice mail

/**
 * Made-up work mail from fixtures/outlook.json, so the Work email tab, Grow alerts and sign-ups can be tried with
 * nothing connected. Dates are hours ago (e.g. -5), so they always look recent. The Grow, Wix and Eventbrite
 * emails are invented: the real ones' wording gets checked once Outlook is connected.
 */
export class MockWorkMail implements WorkMailClient {
  readonly kind = "mock" as const;
  private msgs: WorkMessage[];
  constructor(fixture: string, private boxes: string[]) {
    const raw: any[] = existsSync(fixture) ? JSON.parse(readFileSync(fixture, "utf8")).messages : [];
    this.msgs = raw.map((m, i) => ({
      id: m.id ?? `w${i + 1}`,
      mailbox: m.mailbox,
      from: m.from,
      to: m.to ?? [m.mailbox],
      subject: m.subject,
      receivedAt: new Date(Date.now() + Number(m.hoursAgo ?? -1) * 3600e3).toISOString(),
      preview: (m.body as string).replace(/\s+/g, " ").slice(0, 255),
      body: m.body,
      unread: m.unread ?? true,
      webLink: "https://outlook.office.com/mail/",
    }));
  }
  connected() {
    return true;
  }
  mailboxes() {
    return this.boxes;
  }
  private box(mailbox: string) {
    // The fixture is written for the default addresses; any other configured address maps by position.
    const i = this.boxes.indexOf(mailbox);
    const names = ["me", "info"];
    return this.msgs.filter((m) => m.mailbox === mailbox || m.mailbox === names[i]);
  }
  async list(o: { mailbox: string; q?: string; max?: number }) {
    const q = o.q?.toLowerCase().trim();
    return this.box(o.mailbox)
      .filter((m) => !q || `${m.subject} ${m.from.name} ${m.from.address} ${m.body}`.toLowerCase().includes(q))
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
      .slice(0, o.max ?? 40)
      .map(({ body, ...m }) => ({ ...m, mailbox: o.mailbox }));
  }
  async get(mailbox: string, id: string) {
    const m = this.box(mailbox).find((x) => x.id === id);
    if (!m) throw new Error("That email isn't there any more.");
    return { ...m, mailbox };
  }
  async since(mailbox: string, since: string, max = 50) {
    return (await this.list({ mailbox, max: 500 })).filter((m) => m.receivedAt >= since).slice(0, max);
  }
}

/** On her Mac before Connect Outlook has been run: no practice mail (it would look real), just "not connected". */
export class NotConnectedWorkMail implements WorkMailClient {
  readonly kind = "microsoft" as const;
  constructor(private boxes: string[]) {}
  connected() {
    return false;
  }
  mailboxes() {
    return this.boxes;
  }
  private no(): never {
    throw new Error("Outlook isn't connected yet: double-click Connect Outlook in the app's folder.");
  }
  async list(): Promise<WorkMessage[]> {
    return this.no();
  }
  async get(): Promise<WorkMessage> {
    return this.no();
  }
  async since(): Promise<WorkMessage[]> {
    return this.no();
  }
}

export function makeWorkMail(cfg: Config): WorkMailClient {
  const o = cfg.outlook;
  if (o.driver === "microsoft") return new GraphMail({ clientId: o.clientId, tenant: o.tenant, tokenFile: o.tokenFile, mailboxes: o.mailboxes });
  if (cfg.mode === "live") return new NotConnectedWorkMail(o.mailboxes);
  return new MockWorkMail(path.join(cfg.hubRoot, "fixtures", "outlook.json"), o.mailboxes);
}

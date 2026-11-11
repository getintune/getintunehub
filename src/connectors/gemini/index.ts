import type { Config } from "../../core/config.js";

/**
 * Google Gemini: the model behind the app's own agent ("Ask", Plan my day, email summaries, tasks from email) when
 * GEMINI_API_KEY is in .env. Without a key the agent is off and the "Do this in Claude" buttons open her Claude app.
 *
 * Privacy (told to Marlys 2026-11-09): on Gemini's FREE tier, Google may use what's sent to improve its products and
 * people may read it. Grow Therapy email and therapy clients' details are never sent; background features start off.
 */

export interface GeminiPart {
  text?: string;
  functionCall?: { id?: string; name: string; args?: Record<string, unknown> };
  functionResponse?: { id?: string; name: string; response: Record<string, unknown> };
}
export interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}
export interface FunctionDeclaration {
  name: string;
  description: string;
  parametersJsonSchema: unknown;
}

export interface GenerateRequest {
  model: string;
  system: string;
  contents: GeminiContent[];
  tools?: FunctionDeclaration[];
  /** Ask for JSON matching this schema (no tools). */
  json?: unknown;
  /** Told when the app is waiting out Gemini's per-minute free limit (seconds), so the page can say so. */
  onWait?: (seconds: number) => void;
}

/** Gemini's free limit was hit: `daily` when it's the per-day one (resets overnight), else the per-minute one. */
export class GeminiLimitError extends Error {
  constructor(public daily: boolean) {
    super(
      daily
        ? "Gemini's free daily limit is used up (it resets overnight). For today, use Plan my day in Claude: it's free on your Claude subscription."
        : "Gemini's free per-minute limit is busy. Wait a minute and try again.",
    );
  }
}

/** Google's servers for the model are overloaded (503 "high demand"), and retrying and a lighter model didn't help. */
export class GeminiBusyError extends Error {
  constructor() {
    super("Gemini is very busy right now (Google says demand is high). Try again in a little while, or use Plan my day in Claude instead: it's free on your Claude subscription.");
  }
}

/** A lighter model to try when one is overloaded: gemini-x-flash -> gemini-x-flash-lite (null if already lite). */
export function lighterModel(model: string): string | null {
  return /-lite$/.test(model) ? null : /-flash$/.test(model) ? `${model}-lite` : null;
}

/** Which free limit a 429 is about, and how long Google asks to wait. */
export function quotaInfo(msg: string): { daily: boolean; retrySeconds?: number } {
  const daily = /PerDay|per[ _-]?day|daily/i.test(msg);
  const m = msg.match(/retryDelay"?\s*[:=]\s*"?(\d+(?:\.\d+)?)s/i) ?? msg.match(/retry in (\d+(?:\.\d+)?)\s*s/i);
  return { daily, retrySeconds: m ? Math.ceil(parseFloat(m[1])) : undefined };
}
export interface GenerateResult {
  text: string;
  calls: { id?: string; name: string; args: Record<string, unknown> }[];
  /** The model's turn as it should go back into `contents` (keeps function calls paired with their answers). */
  content: GeminiContent;
  usage: { input: number; output: number };
  /** The model that answered (differs from the one asked for when Google retired that one). */
  model?: string;
}

export interface GeminiClient {
  readonly kind: "gemini" | "mock" | "off";
  connected(): boolean;
  generate(r: GenerateRequest): Promise<GenerateResult>;
}

/** The bit of Google's SDK the app uses (so tests can stand in for it). */
export interface GenAiSdk {
  models: {
    generateContent(params: any): Promise<any>;
    list(params?: any): Promise<AsyncIterable<{ name?: string; supportedActions?: string[] }>>;
  };
}

/**
 * Picks the replacement when Google retires a model: the one Google's error names ("use models/gemini-3.5-flash-lite"),
 * else the newest model of the same kind (flash, or flash-lite) that Google lists for generateContent.
 */
export function replacementModel(retired: string, errorText: string, available: string[]): string | null {
  const named = errorText.match(/use (?:models\/)?(gemini-[\w.-]+)/i)?.[1];
  if (named && named !== retired) return named;
  const lite = /-lite\b/.test(retired);
  const family = available
    .map((n) => n.replace(/^models\//, ""))
    .filter((n) => /^gemini-\d+(\.\d+)?-flash(-lite)?$/.test(n) && /-lite$/.test(n) === lite)
    .sort((a, b) => parseFloat(b.slice(7)) - parseFloat(a.slice(7)));
  return family.find((n) => n !== retired) ?? null;
}

/** The real thing, through Google's official SDK (@google/genai). */
export class LiveGemini implements GeminiClient {
  readonly kind = "gemini" as const;
  /** Models Google retired, and what's used instead (for the rest of this run). */
  private swaps: Record<string, string> = {};
  constructor(private apiKey: string, private baseUrl = "", private sdk?: GenAiSdk, private sleep = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms))) {}
  connected() {
    return !!this.apiKey;
  }
  private async client(): Promise<GenAiSdk> {
    if (!this.sdk) {
      const { GoogleGenAI } = await import("@google/genai");
      this.sdk = new GoogleGenAI({ apiKey: this.apiKey, ...(this.baseUrl ? { httpOptions: { baseUrl: this.baseUrl } } : {}) }) as unknown as GenAiSdk;
    }
    return this.sdk;
  }
  private async availableModels(ai: GenAiSdk): Promise<string[]> {
    const out: string[] = [];
    try {
      for await (const m of await ai.models.list()) if (m.name && (!m.supportedActions || m.supportedActions.includes("generateContent"))) out.push(m.name);
    } catch {
      /* no list: rely on the error's suggestion */
    }
    return out;
  }
  async generate(r: GenerateRequest): Promise<GenerateResult> {
    const ai = await this.client();
    let model = this.swaps[r.model] ?? r.model;
    let waits = 0, busy = 0, triedLighter = false;
    for (let attempt = 0; ; attempt++) {
      try {
        return { ...(await this.call(ai, model, r)), model };
      } catch (e) {
        const msg = String((e as Error).message ?? e);
        if (attempt === 0 && /404|NOT_FOUND|no longer available|not found/i.test(msg)) {
          const next = replacementModel(model, msg, await this.availableModels(ai));
          if (next) {
            this.swaps[r.model] = next;
            model = next;
            continue;
          }
        }
        if (/429|RESOURCE_EXHAUSTED|quota|rate limit/i.test(msg)) {
          const q = quotaInfo(msg);
          // The per-minute limit: wait as long as Google asks (a few times), then carry on.
          if (!q.daily && waits < 4) {
            const secs = Math.min(Math.max(q.retrySeconds ?? 20, 5), 70);
            waits++;
            r.onWait?.(secs);
            await this.sleep(secs * 1000);
            attempt--; // a wait isn't a model change
            continue;
          }
          throw new GeminiLimitError(q.daily);
        }
        // Overloaded ("high demand"): wait and retry twice, then try the lighter model once, then give up kindly.
        if (/\b50[03]\b|UNAVAILABLE|overloaded|high demand|INTERNAL/i.test(msg)) {
          if (busy < 2) {
            const secs = busy === 0 ? 5 : 15;
            busy++;
            r.onWait?.(secs);
            await this.sleep(secs * 1000);
            attempt--;
            continue;
          }
          const lighter = !triedLighter ? lighterModel(model) : null;
          if (lighter) {
            triedLighter = true;
            busy = 0;
            model = lighter;
            attempt--;
            continue;
          }
          throw new GeminiBusyError();
        }
        if (/API key|401|403|PERMISSION_DENIED/i.test(msg)) throw new Error("Gemini didn't accept the key. Check GEMINI_API_KEY in the .env file (from aistudio.google.com → Get API key).");
        throw new Error(`Gemini: ${msg}`);
      }
    }
  }
  private async call(ai: GenAiSdk, model: string, r: GenerateRequest): Promise<GenerateResult> {
    const res: any = await ai.models.generateContent({
      model,
      contents: r.contents,
      config: {
        systemInstruction: r.system,
        ...(r.tools?.length ? { tools: [{ functionDeclarations: r.tools }] } : {}),
        ...(r.json ? { responseMimeType: "application/json", responseJsonSchema: r.json } : {}),
      },
    });
    const content: GeminiContent = res.candidates?.[0]?.content ?? { role: "model", parts: [] };
    const calls = res.functionCalls ?? (content.parts ?? []).filter((p: GeminiPart) => p.functionCall).map((p: GeminiPart) => p.functionCall);
    const text = typeof res.text === "string" ? res.text : (content.parts ?? []).map((p: GeminiPart) => p.text ?? "").join("");
    return {
      text: text ?? "",
      calls: (calls ?? []).map((c: any) => ({ id: c.id, name: String(c.name), args: c.args ?? {} })),
      content: { role: "model", parts: content.parts ?? [] },
      usage: { input: res.usageMetadata?.promptTokenCount ?? 0, output: res.usageMetadata?.candidatesTokenCount ?? 0 },
    };
  }
}

/** No key: the in-app agent is off (the page uses "Do this in Claude" instead). */
export class NoGemini implements GeminiClient {
  readonly kind = "off" as const;
  connected() {
    return false;
  }
  async generate(): Promise<GenerateResult> {
    throw new Error("The app's agent is off: add GEMINI_API_KEY to the .env file in the app's folder.");
  }
}

/**
 * A scripted Gemini for tests: each call to generate() gets the next reply from `script` (a function gets the request
 * and returns the reply, so a test can check what was sent).
 */
export class MockGemini implements GeminiClient {
  readonly kind = "mock" as const;
  requests: GenerateRequest[] = [];
  constructor(private script: ((r: GenerateRequest) => Partial<GenerateResult>)[] = []) {}
  connected() {
    return true;
  }
  async generate(r: GenerateRequest): Promise<GenerateResult> {
    const { onWait: _onWait, ...plain } = r;
    this.requests.push(structuredClone(plain));
    const next = this.script.shift();
    const out = next ? next(r) : { text: "OK" };
    const calls = out.calls ?? [];
    return {
      text: out.text ?? "",
      calls,
      content: out.content ?? { role: "model", parts: [...(out.text ? [{ text: out.text }] : []), ...calls.map((c) => ({ functionCall: c }))] },
      usage: out.usage ?? { input: 100, output: 20 },
    };
  }
}

export function makeGemini(cfg: Config): GeminiClient {
  return cfg.geminiApiKey ? new LiveGemini(cfg.geminiApiKey, process.env.HUB_GEMINI_BASE_URL?.trim() ?? "") : new NoGemini();
}

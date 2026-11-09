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
}
export interface GenerateResult {
  text: string;
  calls: { id?: string; name: string; args: Record<string, unknown> }[];
  /** The model's turn as it should go back into `contents` (keeps function calls paired with their answers). */
  content: GeminiContent;
  usage: { input: number; output: number };
}

export interface GeminiClient {
  readonly kind: "gemini" | "mock" | "off";
  connected(): boolean;
  generate(r: GenerateRequest): Promise<GenerateResult>;
}

/** The real thing, through Google's official SDK (@google/genai). */
export class LiveGemini implements GeminiClient {
  readonly kind = "gemini" as const;
  private ai: any;
  constructor(private apiKey: string, private baseUrl = "") {}
  connected() {
    return !!this.apiKey;
  }
  private async client() {
    if (!this.ai) {
      const { GoogleGenAI } = await import("@google/genai");
      this.ai = new GoogleGenAI({ apiKey: this.apiKey, ...(this.baseUrl ? { httpOptions: { baseUrl: this.baseUrl } } : {}) });
    }
    return this.ai;
  }
  async generate(r: GenerateRequest): Promise<GenerateResult> {
    const ai = await this.client();
    let res: any;
    try {
      res = await ai.models.generateContent({
        model: r.model,
        contents: r.contents,
        config: {
          systemInstruction: r.system,
          ...(r.tools?.length ? { tools: [{ functionDeclarations: r.tools }] } : {}),
          ...(r.json ? { responseMimeType: "application/json", responseJsonSchema: r.json } : {}),
        },
      });
    } catch (e) {
      const msg = String((e as Error).message ?? e);
      if (/429|RESOURCE_EXHAUSTED|quota/i.test(msg)) throw new Error("Gemini's free tier limit is used up for now. Try again in a minute (or tomorrow, for the daily limit).");
      if (/API key|401|403|PERMISSION_DENIED/i.test(msg)) throw new Error("Gemini didn't accept the key. Check GEMINI_API_KEY in the .env file (from aistudio.google.com → Get API key).");
      throw new Error(`Gemini: ${msg}`);
    }
    const content: GeminiContent = res.candidates?.[0]?.content ?? { role: "model", parts: [] };
    return {
      text: res.text ?? "",
      calls: (res.functionCalls ?? []).map((c: any) => ({ id: c.id, name: String(c.name), args: c.args ?? {} })),
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
    this.requests.push(structuredClone(r));
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

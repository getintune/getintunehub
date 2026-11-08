import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PROGRAMS, toInitials, type Entry, type EntryPatch, type ListsClient, type NewEntry, type Program } from "./types.js";

/**
 * The lists in one JSON file (lists.json) in her data folder. Each save writes a new file and swaps it in, and the
 * previous version is kept as lists.backup.json, so a crash can't leave a half-written file.
 */
export class LocalLists implements ListsClient {
  kind: "local" | "mock" = "local";
  constructor(private dir: string, private progs: Program[] = PROGRAMS) {}

  private file() {
    return path.join(this.dir, "lists.json");
  }

  private load(): Entry[] {
    try {
      return (JSON.parse(readFileSync(this.file(), "utf8")).entries ?? []) as Entry[];
    } catch (e) {
      if (!existsSync(this.file())) return [];
      throw new Error(`Couldn't read ${this.file()}: ${(e as Error).message}. The last good copy is lists.backup.json in the same folder.`);
    }
  }

  private save(entries: Entry[]) {
    mkdirSync(this.dir, { recursive: true });
    const tmp = `${this.file()}.tmp`;
    writeFileSync(tmp, JSON.stringify({ version: 1, entries }, null, 2));
    if (existsSync(this.file())) copyFileSync(this.file(), path.join(this.dir, "lists.backup.json"));
    renameSync(tmp, this.file());
  }

  programs() {
    return this.progs;
  }

  program(id: string) {
    const p = this.progs.find((x) => x.id === id);
    if (!p) throw new Error(`There's no list called "${id}". Lists: ${this.progs.map((x) => x.id).join(", ")}.`);
    return p;
  }

  list(program?: string) {
    if (program) this.program(program);
    return this.load()
      .filter((e) => !program || e.program === program)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  get(id: string) {
    const e = this.load().find((x) => x.id === id);
    if (!e) throw new Error(`No one on the lists has id ${id}.`);
    return e;
  }

  find(query: string, program?: string) {
    const q = query.trim().toLowerCase();
    if (!q) return this.list(program);
    return this.list(program).filter((e) => [e.name, e.email, e.phone, e.nextStep, ...Object.values(e.extra), ...e.notes.map((n) => n.text)].join(" ").toLowerCase().includes(q));
  }

  add(program: string, data: NewEntry) {
    const p = this.program(program);
    const now = new Date().toISOString();
    const name = String(data.name ?? "").trim();
    if (!name) throw new Error(p.initialsOnly ? "Add the client's initials." : "Add a name.");
    const stage = data.stage && p.stages.includes(data.stage) ? data.stage : p.stages[0];
    const e: Entry = clean(p, {
      id: randomUUID(),
      program,
      name,
      email: data.email ?? "",
      phone: data.phone ?? "",
      stage,
      stageSince: data.stageSince || now,
      nextStep: data.nextStep ?? "",
      nextDate: data.nextDate ?? "",
      extra: pickExtra(p, data.extra),
      notes: [],
      createdAt: now,
      updatedAt: now,
    });
    this.save([...this.load(), e]);
    return e;
  }

  update(id: string, patch: EntryPatch) {
    const all = this.load();
    const i = all.findIndex((x) => x.id === id);
    if (i < 0) throw new Error(`No one on the lists has id ${id}.`);
    const cur = all[i];
    const p = this.program(cur.program);
    if (patch.stage !== undefined && !p.stages.includes(patch.stage)) throw new Error(`"${patch.stage}" isn't a stage on ${p.name}. Stages: ${p.stages.join(", ")}.`);
    if (patch.name !== undefined && !patch.name.trim()) throw new Error("The name can't be empty.");
    const now = new Date().toISOString();
    const next: Entry = clean(p, {
      ...cur,
      ...Object.fromEntries(Object.entries(patch).filter(([k, v]) => v !== undefined && k !== "extra")),
      extra: patch.extra ? { ...cur.extra, ...pickExtra(p, patch.extra) } : cur.extra,
      stageSince: patch.stage && patch.stage !== cur.stage ? now : cur.stageSince,
      updatedAt: now,
    } as Entry);
    all[i] = next;
    this.save(all);
    return next;
  }

  addNote(id: string, text: string) {
    const t = text.trim();
    if (!t) throw new Error("The note is empty.");
    const all = this.load();
    const i = all.findIndex((x) => x.id === id);
    if (i < 0) throw new Error(`No one on the lists has id ${id}.`);
    const now = new Date().toISOString();
    all[i] = { ...all[i], notes: [...all[i].notes, { at: now, text: t }], updatedAt: now };
    this.save(all);
    return all[i];
  }

  remove(id: string) {
    const all = this.load();
    if (!all.some((x) => x.id === id)) throw new Error(`No one on the lists has id ${id}.`);
    this.save(all.filter((x) => x.id !== id));
  }
}

/** Keeps only the program's own extra fields, as trimmed strings. */
function pickExtra(p: Program, extra: Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of p.fields) {
    const v = extra?.[f.key];
    if (v !== undefined && v !== null && String(v).trim()) out[f.key] = String(v).trim();
  }
  return out;
}

/** Initials-only lists never keep a full name, email or phone. */
function clean(p: Program, e: Entry): Entry {
  if (!p.initialsOnly) return e;
  return { ...e, name: toInitials(e.name), email: "", phone: "" };
}

/**
 * Practice lists for HUB_MODE=mock and the tests: made-up people from fixtures/lists.json, copied into the mock
 * state folder on first use so changes stick between restarts but never touch real data.
 */
export class MockLists extends LocalLists {
  kind = "mock" as const;
  constructor(stateDir: string, fixture: string) {
    const dir = path.join(stateDir, "mock-lists");
    if (!existsSync(path.join(dir, "lists.json")) && existsSync(fixture)) {
      mkdirSync(dir, { recursive: true });
      const raw = JSON.parse(readFileSync(fixture, "utf8"));
      // Dates in the fixture are days ago (e.g. -3), so the practice data always looks current.
      const at = (d: unknown) => (typeof d === "number" ? new Date(Date.now() + d * 864e5).toISOString() : String(d ?? new Date().toISOString()));
      const day = (d: unknown) => (typeof d === "number" ? at(d).slice(0, 10) : String(d ?? ""));
      const entries = (raw.entries as any[]).map((e, i) => ({
        id: e.id ?? `mock-${i + 1}`,
        program: e.program,
        name: e.name,
        email: e.email ?? "",
        phone: e.phone ?? "",
        stage: e.stage,
        stageSince: at(e.stageSince ?? e.createdAt ?? -7),
        nextStep: e.nextStep ?? "",
        nextDate: day(e.nextDate),
        extra: e.extra ?? {},
        notes: (e.notes ?? []).map((n: any) => ({ at: at(n.at), text: n.text })),
        createdAt: at(e.createdAt ?? -7),
        updatedAt: at(e.updatedAt ?? e.stageSince ?? e.createdAt ?? -7),
      }));
      writeFileSync(path.join(dir, "lists.json"), JSON.stringify({ version: 1, entries }, null, 2));
    }
    super(dir);
  }
}
